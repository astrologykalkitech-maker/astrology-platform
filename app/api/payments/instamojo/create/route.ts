import { NextRequest, NextResponse } from "next/server";
import { checkRateLimitAsync } from "@/lib/security/rate-limit";
import { requireCustomerContext } from "@/lib/auth/customer-guard";
import { requireAstrologer } from "@/lib/auth/session";
import { getOwnAstrologerProfile } from "@/lib/astrologer/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { createInstamojoPaymentRequest } from "@/lib/financial/instamojo";
import { generateOrderNumber, paiseToRupees, rupeesToPaise } from "@/lib/financial/pricing";
import { logSecurityEvent } from "@/lib/security/telemetry";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { purposeType, entityId } = body; // purposeType: 'consultation' | 'subscription'

    if (!purposeType || !entityId) {
      return NextResponse.json({ error: "Missing required parameters: purposeType, entityId" }, { status: 400 });
    }

    const supabase = await createAdminClient("main");
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const redirectUrl = `${siteUrl}/api/payments/instamojo/callback`;
    const webhookUrl = `${siteUrl}/api/payments/instamojo/webhook`;

    if (purposeType === "subscription") {
      // 1. Authenticate Astrologer
      const { user } = await requireAstrologer();

      // Rate limit: 10 subscription payment requests per minute per astrologer
      const rl = await checkRateLimitAsync(`pay:instamojo:sub:${user.id}`, 10, 60_000);
      if (!rl.allowed) {
        logSecurityEvent({
          eventType: "RATE_LIMIT_EXCEEDED",
          actorId: user.id,
          actorRole: "astrologer",
          targetType: "instamojo_subscription_payment",
          outcome: "blocked",
          reason: "Rate limit of 10 subscription payments per minute exceeded",
        });
        return NextResponse.json(
          { error: "Too many payment requests. Please wait." },
          { status: 429, headers: { "Retry-After": rl.retryAfterSeconds.toString() } }
        );
      }

      const { profile, error: profErr } = await getOwnAstrologerProfile();
      if (profErr || !profile) {
        return NextResponse.json({ error: "Astrologer profile not found" }, { status: 403 });
      }

      // 2. Fetch authoritative plan from DB
      const { data: plan, error: planErr } = await supabase
        .from("payment_plans")
        .select("*")
        .eq("id", entityId)
        .eq("is_active", true)
        .single();

      if (planErr || !plan) {
        return NextResponse.json({ error: "Invalid or inactive plan selected" }, { status: 404 });
      }

      if (plan.price_paise === 0) {
        return NextResponse.json({ error: "Free plan does not require payment" }, { status: 400 });
      }

      const orderNumber = generateOrderNumber();

      // 3. Preserve any existing active subscription; only create a pending record if none exists
      const { data: existingSub } = await supabase
        .from("astrologer_subscriptions")
        .select("id, status")
        .eq("astrologer_id", profile.id)
        .maybeSingle();

      let subscriptionEntityId = existingSub?.id ?? null;

      if (!subscriptionEntityId) {
        const { data: subRecord, error: subErr } = await supabase
          .from("astrologer_subscriptions")
          .insert({
            astrologer_id: profile.id,
            plan_id: plan.id,
            status: "past_due", // Will ONLY become active after verified webhook/callback!
            auto_renew: false,
          })
          .select("id")
          .single();

        if (subErr || !subRecord) {
          return NextResponse.json({ error: "Failed to initialize subscription" }, { status: 500 });
        }
        subscriptionEntityId = subRecord.id;
      }

      // 4. Create internal payment order
      const { data: order, error: orderErr } = await supabase
        .from("payment_orders")
        .insert({
          order_number: orderNumber,
          entity_type: "subscription",
          entity_id: subscriptionEntityId,
          astrologer_id: profile.id,
          amount_paise: plan.price_paise,
          currency: "INR",
          status: "created",
          metadata: {
            target_plan_id: plan.id,
            plan_name: plan.name,
            astrologer_name: profile.display_name,
            email: user.email,
          },
        })
        .select()
        .single();

      if (orderErr || !order) {
        return NextResponse.json({ error: "Failed to create payment order" }, { status: 500 });
      }

      // 5. Call Instamojo API
      const mojoRes = await createInstamojoPaymentRequest({
        amount: paiseToRupees(plan.price_paise),
        purpose: `Sub ${plan.name} #${orderNumber}`.slice(0, 30),
        buyerName: profile.display_name,
        email: user.email || "astrologer@karmicascension.com",
        phone: (profile as unknown as { phone_number?: string }).phone_number || "",
        redirectUrl,
        webhookUrl,
        sendEmail: true,
      });

      if (!mojoRes.success || !mojoRes.data) {
        return NextResponse.json({ error: mojoRes.error || "Payment gateway communication failed" }, { status: 502 });
      }

      await supabase
        .from("payment_orders")
        .update({
          payment_request_id: mojoRes.data.id,
          payment_url: mojoRes.data.longurl,
          status: "pending",
        })
        .eq("id", order.id);

      return NextResponse.json({
        success: true,
        orderId: order.id,
        checkoutUrl: mojoRes.data.longurl,
        amountPaise: plan.price_paise,
      });
    } else if (purposeType === "consultation") {
      // Customer consultation payment
      const { user } = await requireCustomerContext();

      // Rate limit: 10 consultation payment requests per minute per customer
      const rl = await checkRateLimitAsync(`pay:instamojo:consult:${user.id}`, 10, 60_000);
      if (!rl.allowed) {
        return NextResponse.json(
          { error: "Too many payment requests. Please wait." },
          { status: 429, headers: { "Retry-After": rl.retryAfterSeconds.toString() } }
        );
      }

      const { data: booking, error: bErr } = await supabase
        .from("customer_bookings")
        .select(`
          id,
          price,
          service_type,
          status,
          customer_id,
          astrologer_id,
          astrologer:astrologer_profiles!customer_bookings_astrologer_id_fkey(
            id,
            display_name,
            consultation_fee
          )
        `)
        .eq("id", entityId)
        .eq("customer_id", user.id)
        .single();

      if (bErr || !booking) {
        return NextResponse.json({ error: "Booking not found" }, { status: 404 });
      }

      const astrologerData = Array.isArray(booking.astrologer) ? booking.astrologer[0] : booking.astrologer;
      const fee = booking.price || astrologerData?.consultation_fee || 500;
      const amountPaise = rupeesToPaise(fee);

      const { data: customerProfile } = await supabase
        .from("profiles")
        .select("full_name, phone_number")
        .eq("id", user.id)
        .single();

      const buyerName = customerProfile?.full_name || user.email?.split("@")[0] || "Seeker";
      const orderNumber = generateOrderNumber();

      const { data: order, error: orderErr } = await supabase
        .from("payment_orders")
        .insert({
          order_number: orderNumber,
          entity_type: "consultation",
          entity_id: booking.id,
          customer_id: user.id,
          astrologer_id: booking.astrologer_id,
          amount_paise: amountPaise,
          currency: "INR",
          status: "created",
          metadata: {
            buyer_name: buyerName,
            email: user.email,
            phone: customerProfile?.phone_number || "",
          },
        })
        .select()
        .single();

      if (orderErr || !order) {
        return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
      }

      const mojoRes = await createInstamojoPaymentRequest({
        amount: paiseToRupees(amountPaise),
        purpose: `Consultation #${orderNumber}`.slice(0, 30),
        buyerName,
        email: user.email || "seeker@karmicascension.com",
        phone: customerProfile?.phone_number || "",
        redirectUrl,
        webhookUrl,
        sendEmail: true,
      });

      if (!mojoRes.success || !mojoRes.data) {
        return NextResponse.json({ error: mojoRes.error || "Gateway error" }, { status: 502 });
      }

      await supabase
        .from("payment_orders")
        .update({
          payment_request_id: mojoRes.data.id,
          payment_url: mojoRes.data.longurl,
          status: "pending",
        })
        .eq("id", order.id);

      return NextResponse.json({
        success: true,
        orderId: order.id,
        checkoutUrl: mojoRes.data.longurl,
        amountPaise,
      });
    }

    return NextResponse.json({ error: "Invalid purposeType" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error creating payment request" },
      { status: 500 }
    );
  }
}

