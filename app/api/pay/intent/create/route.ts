import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { checkRateLimitAsync } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { logSecurityEvent } from "@/lib/security/telemetry";
import {
  generateIntentNumber,
  generateClientSecret,
  createDynamicQRSession,
} from "@/lib/pay/orchestrator";
import { JyotishPaymentIntent } from "@/lib/pay/types";

type PaymentRequest = {
  entity_type?: unknown;
  booking_id?: unknown;
  plan_id?: unknown;
  payment_method?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    const { user, profile } = await requireAuth();

    // Rate limit: 10 intent creations per minute per authenticated user
    const rl = await checkRateLimitAsync(`pay:intent:${user.id}`, 10, 60_000);
    if (!rl.allowed) {
      logSecurityEvent({
        eventType: "RATE_LIMIT_EXCEEDED",
        actorId: user.id,
        actorRole: profile.role,
        targetType: "pay_intent",
        outcome: "blocked",
        reason: "Rate limit of 10 payment intent creations per minute exceeded",
      });
      return NextResponse.json(
        {
          success: false,
          error: "Too many payment requests. Please wait before creating another payment session.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": rl.retryAfterSeconds.toString(),
          },
        }
      );
    }

    const body = (await req.json()) as PaymentRequest;
    const entityType = body.entity_type;

    if (body.payment_method === "card" || body.payment_method === "net_banking") {
      return NextResponse.json(
        {
          success: false,
          error: "Card and Netbanking payments are processed via Instamojo, not JyotishSetu Pay UPI.",
        },
        { status: 400 }
      );
    }

    if (entityType !== "consultation" && entityType !== "subscription") {
      return NextResponse.json(
        { success: false, error: "Invalid entity_type: must be consultation or subscription" },
        { status: 400 }
      );
    }

    const supabase = await createAdminClient("main");
    let customerId: string | null = null;
    let astrologerId: string | null = null;
    let bookingId: string | null = null;
    let planId: string | null = null;
    let amountPaise = 0;

    if (entityType === "consultation") {
      if (profile.role !== "customer" || typeof body.booking_id !== "string") {
        return NextResponse.json(
          { success: false, error: "Only the customer can start payment for a consultation booking." },
          { status: 403 }
        );
      }

      const { data: booking, error: bookingError } = await supabase
        .from("customer_bookings")
        .select("id, customer_id, astrologer_id, price, status, payment_mode")
        .eq("id", body.booking_id)
        .eq("customer_id", user.id)
        .maybeSingle();

      if (bookingError) {
        console.error("[Karmic Ascension Pay] Booking lookup failed:", bookingError);
        return NextResponse.json(
          { success: false, error: "Unable to validate the booking." },
          { status: 500 }
        );
      }
      if (!booking) {
        return NextResponse.json(
          { success: false, error: "Booking not found or not owned by this customer." },
          { status: 404 }
        );
      }
      if (!["pending", "confirmed"].includes(booking.status)) {
        return NextResponse.json(
          { success: false, error: "This booking is not eligible for payment." },
          { status: 409 }
        );
      }
      // Allow checkout for platform_gateway or unassigned/direct bookings (automatically upgrading mode to platform_gateway)
      if (booking.payment_mode === "pay_at_drop") {
        return NextResponse.json(
          { success: false, error: "This booking is configured for cash-on-drop payment." },
          { status: 409 }
        );
      }
      if (booking.payment_mode !== "platform_gateway") {
        await supabase
          .from("customer_bookings")
          .update({ payment_mode: "platform_gateway", updated_at: new Date().toISOString() })
          .eq("id", booking.id);
      }

      amountPaise = Math.round(Number(booking.price) * 100);
      if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
        return NextResponse.json(
          { success: false, error: "The booking has an invalid payable amount." },
          { status: 409 }
        );
      }

      const { data: successfulIntents, error: successfulIntentError } = await supabase
        .from("payment_intents")
        .select("id")
        .eq("booking_id", booking.id)
        .eq("entity_type", "consultation")
        .eq("status", "succeeded")
        .limit(1);
      if (successfulIntentError) {
        console.error("[Karmic Ascension Pay] Existing payment lookup failed:", successfulIntentError);
        return NextResponse.json(
          { success: false, error: "Unable to validate the booking payment status." },
          { status: 500 }
        );
      }
      if (successfulIntents?.length) {
        return NextResponse.json(
          { success: false, error: "This booking already has a verified platform payment." },
          { status: 409 }
        );
      }

      const { data: directPayments, error: directPaymentError } = await supabase
        .from("direct_consultation_payments")
        .select("id")
        .eq("booking_id", booking.id)
        .in("status", ["pending", "verified"])
        .limit(1);
      if (directPaymentError) {
        console.error("[Karmic Ascension Pay] Direct payment lookup failed:", directPaymentError);
        return NextResponse.json(
          { success: false, error: "Unable to validate the booking payment status." },
          { status: 500 }
        );
      }
      if (directPayments?.length) {
        return NextResponse.json(
          { success: false, error: "This booking already has a direct payment submission." },
          { status: 409 }
        );
      }

      const { data: activeOrders, error: orderError } = await supabase
        .from("payment_orders")
        .select("id, status")
        .eq("entity_type", "consultation")
        .eq("entity_id", booking.id)
        .in("status", ["created", "pending", "successful"])
        .limit(1);
      if (orderError) {
        console.error("[Karmic Ascension Pay] Existing gateway order lookup failed:", orderError);
        return NextResponse.json(
          { success: false, error: "Unable to validate the booking payment status." },
          { status: 500 }
        );
      }
      if (activeOrders?.length) {
        return NextResponse.json(
          {
            success: false,
            error:
              activeOrders[0].status === "successful"
                ? "This booking already has a verified platform payment."
                : "An Instamojo payment session is already active for this booking.",
          },
          { status: 409 }
        );
      }

      // Expire any stale created/pending intents for this booking before creating a new one
      await supabase
        .from("payment_intents")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("booking_id", booking.id)
        .eq("entity_type", "consultation")
        .in("status", ["created", "pending"])
        .lte("expires_at", new Date().toISOString());

      const { data: activeIntents, error: activeIntentError } = await supabase
        .from("payment_intents")
        .select("id")
        .eq("booking_id", booking.id)
        .eq("entity_type", "consultation")
        .in("status", ["created", "pending", "processing"])
        .gt("expires_at", new Date().toISOString())
        .limit(1);
      if (activeIntentError) {
        console.error("[Karmic Ascension Pay] Active payment intent lookup failed:", activeIntentError);
        return NextResponse.json(
          { success: false, error: "Unable to validate existing payment sessions." },
          { status: 500 }
        );
      }
      if (activeIntents?.length) {
        return NextResponse.json(
          { success: false, error: "A payment session is already active for this booking." },
          { status: 409 }
        );
      }

      customerId = user.id;
      astrologerId = booking.astrologer_id;
      bookingId = booking.id;
    } else {
      if (profile.role !== "astrologer" || typeof body.plan_id !== "string") {
        return NextResponse.json(
          { success: false, error: "Only an astrologer can start a subscription payment." },
          { status: 403 }
        );
      }

      const { data: astrologer, error: astrologerError } = await supabase
        .from("astrologer_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (astrologerError) {
        console.error("[Karmic Ascension Pay] Astrologer profile lookup failed:", astrologerError);
        return NextResponse.json(
          { success: false, error: "Unable to validate the astrologer profile." },
          { status: 500 }
        );
      }
      if (!astrologer) {
        return NextResponse.json(
          { success: false, error: "Astrologer profile not found." },
          { status: 404 }
        );
      }

      const { data: plan, error: planError } = await supabase
        .from("payment_plans")
        .select("id, price_paise, currency, is_active")
        .eq("id", body.plan_id)
        .maybeSingle();
      if (planError) {
        console.error("[Karmic Ascension Pay] Payment plan lookup failed:", planError);
        return NextResponse.json(
          { success: false, error: "Unable to validate the selected plan." },
          { status: 500 }
        );
      }
      if (!plan || !plan.is_active || plan.currency !== "INR" || plan.price_paise <= 0) {
        return NextResponse.json(
          { success: false, error: "Selected subscription plan is unavailable." },
          { status: 409 }
        );
      }

      const { data: activeSubscription, error: subscriptionError } = await supabase
        .from("astrologer_subscriptions")
        .select("plan_id, status")
        .eq("astrologer_id", astrologer.id)
        .maybeSingle();
      if (subscriptionError) {
        console.error("[Karmic Ascension Pay] Subscription lookup failed:", subscriptionError);
        return NextResponse.json(
          { success: false, error: "Unable to validate the current subscription." },
          { status: 500 }
        );
      }
      if (activeSubscription?.status === "active" && activeSubscription.plan_id === plan.id) {
        return NextResponse.json(
          { success: false, error: "This subscription plan is already active." },
          { status: 409 }
        );
      }

      const { data: activeIntents, error: activeIntentError } = await supabase
        .from("payment_intents")
        .select("id")
        .eq("astrologer_id", astrologer.id)
        .eq("entity_type", "subscription")
        .in("status", ["created", "pending", "processing"])
        .gt("expires_at", new Date().toISOString())
        .limit(1);
      if (activeIntentError) {
        console.error("[Karmic Ascension Pay] Active subscription intent lookup failed:", activeIntentError);
        return NextResponse.json(
          { success: false, error: "Unable to validate existing payment sessions." },
          { status: 500 }
        );
      }
      if (activeIntents?.length) {
        return NextResponse.json(
          { success: false, error: "A subscription payment session is already active." },
          { status: 409 }
        );
      }

      astrologerId = astrologer.id;
      planId = plan.id;
      amountPaise = plan.price_paise;
    }

    const intentId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
    const intentRecord: JyotishPaymentIntent = {
      id: intentId,
      intent_number: generateIntentNumber(),
      customer_id: customerId,
      astrologer_id: astrologerId,
      booking_id: bookingId,
      plan_id: planId,
      entity_type: entityType,
      amount_paise: amountPaise,
      currency: "INR",
      status: "created",
      client_secret: generateClientSecret(intentId),
      payment_method_allowed: ["upi_qr", "upi_intent"],
      metadata: { source: "jyotish_pay_manual_review" },
      created_at: now.toISOString(),
      expires_at: expiresAt,
      updated_at: now.toISOString(),
    };

    const { getLivePaymentRuntimeConfig, isPaymentTestingModeEnabled } = await import("@/lib/pay/config");
    const runtimeConfig = await getLivePaymentRuntimeConfig();
    const testingModeEnabled = await isPaymentTestingModeEnabled();
    const qrData = await createDynamicQRSession(
      intentRecord,
      entityType === "subscription" ? "Astrologer Subscription Upgrade" : "Astrology Consultation Session",
      {
        merchantVpa: runtimeConfig.merchantVpa,
        merchantName: runtimeConfig.merchantName,
        merchantCode: runtimeConfig.merchantCode,
      }
    );

    const { error: intentError } = await supabase.from("payment_intents").insert(intentRecord);
    if (intentError) {
      console.error("[Karmic Ascension Pay] Payment intent insert failed:", intentError);
      const isConflict = intentError.code === "23505";
      return NextResponse.json(
        {
          success: false,
          error: isConflict
            ? "A payment session is already active for this booking."
            : "Could not create a persistent payment intent. Please try again.",
        },
        { status: isConflict ? 409 : 503 }
      );
    }

    const qrSessionRecord = {
      id: crypto.randomUUID(),
      session_code: qrData.sessionCode,
      intent_id: intentId,
      customer_id: customerId,
      astrologer_id: astrologerId,
      amount_paise: amountPaise,
      upi_uri: qrData.upiUri,
      qr_svg: qrData.qrSvg,
      status: "active",
      expires_at: qrData.expiresAt,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    const { error: sessionError } = await supabase
      .from("qr_payment_sessions")
      .insert(qrSessionRecord);
    if (sessionError) {
      console.error("[Karmic Ascension Pay] QR session insert failed:", sessionError);
      const { error: intentCleanupError } = await supabase
        .from("payment_intents")
        .update({ status: "failed", error_code: "QR_SESSION_CREATE_FAILED", updated_at: new Date().toISOString() })
        .eq("id", intentId);
      if (intentCleanupError) {
        console.error("[Karmic Ascension Pay] Failed to close incomplete payment intent:", intentCleanupError);
      }
      return NextResponse.json(
        { success: false, error: "Could not create a persistent QR session. Please try again." },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      intent: { id: intentRecord.id, intent_number: intentRecord.intent_number },
      testingModeEnabled,
      qrSession: {
        sessionCode: qrData.sessionCode,
        amountPaise,
        upiUri: qrData.upiUri,
        qrSvg: qrData.qrSvg,
        expiresAt: qrData.expiresAt,
        merchantVpa: runtimeConfig.merchantVpa,
      },
    });
  } catch (error) {
    console.error("[Karmic Ascension Pay] Intent creation error:", error);
    const isAuthError = error instanceof Error && error.name === "AuthRequiredError";
    return NextResponse.json(
      { success: false, error: isAuthError ? "Authentication required." : "Failed to create payment intent." },
      { status: isAuthError ? 401 : 500 }
    );
  }
}
