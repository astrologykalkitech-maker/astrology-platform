"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCustomerContext } from "@/lib/auth/customer-guard";
import { requireAstrologer } from "@/lib/auth/session";
import { getOwnAstrologerProfile } from "@/lib/astrologer/guard";
import {
  createInstamojoPaymentRequest,
} from "@/lib/financial/instamojo";
import {
  generateOrderNumber,
  rupeesToPaise,
  paiseToRupees,
} from "@/lib/financial/pricing";
import type { AuthResult } from "@/lib/types/auth.types";
import type {
  AstrologerSubscriptionRecord,
  PaymentPlanRecord,
} from "@/lib/financial/types";

/**
 * Initiates an Instamojo payment request for a Customer Consultation Booking.
 * NOTE: The booking remains UNCONFIRMED until payment is verified by webhook/callback.
 */
export async function initiateConsultationPaymentAction(payload: {
  bookingId: string;
}): Promise<
  AuthResult<{
    orderId: string;
    paymentUrl: string;
    amountPaise: number;
  }>
> {
  try {
    const { user } = await requireCustomerContext();
    const supabase = await createAdminClient("main");

    // 1. Fetch booking and astrologer details
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
      .eq("id", payload.bookingId)
      .eq("customer_id", user.id)
      .single();

    if (bErr || !booking) {
      return { success: false, error: "Consultation booking not found." };
    }

    if (booking.status === "confirmed" || booking.status === "completed") {
      return { success: false, error: "This consultation has already been paid and confirmed." };
    }

    const astrologerData = Array.isArray(booking.astrologer)
      ? booking.astrologer[0]
      : booking.astrologer;
    const authoritativePrice = booking.price || astrologerData?.consultation_fee || 500;
    const amountPaise = rupeesToPaise(authoritativePrice);

    // 2. Fetch customer profile for buyer details
    const { data: customerProfile } = await supabase
      .from("profiles")
      .select("full_name, phone_number")
      .eq("id", user.id)
      .single();

    const buyerName = customerProfile?.full_name || user.email?.split("@")[0] || "Valued Seeker";
    const orderNumber = generateOrderNumber();

    // 3. Create Internal Payment Order with status: 'created'
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
          service_type: booking.service_type,
        },
      })
      .select()
      .single();

    if (orderErr || !order) {
      return { success: false, error: `Failed to create payment order: ${orderErr?.message}` };
    }

    // 4. Request checkout link from Instamojo
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const redirectUrl = `${siteUrl}/api/payments/instamojo/callback`;
    const webhookUrl = `${siteUrl}/api/payments/instamojo/webhook`;

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
      return {
        success: false,
        error: mojoRes.error || "Failed to initialize payment gateway.",
      };
    }

    // 5. Update order to 'pending'
    await supabase
      .from("payment_orders")
      .update({
        payment_request_id: mojoRes.data.id,
        payment_url: mojoRes.data.longurl,
        status: "pending",
      })
      .eq("id", order.id);

    return {
      success: true,
      data: {
        orderId: order.id,
        paymentUrl: mojoRes.data.longurl,
        amountPaise,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error initiating consultation payment",
    };
  }
}

/**
 * Initiates an Instamojo subscription purchase/renewal for an Astrologer.
 * CRITICAL SECURITY RULE:
 * For paid plans, astrologer_subscriptions is NEVER set to 'active' here.
 * Only a temporary payment_orders record is created.
 * Subscription activates ONLY when Instamojo independently confirms payment credit.
 */
export async function initiateSubscriptionPaymentAction(payload: {
  planId: string;
}): Promise<
  AuthResult<{
    orderId: string;
    paymentUrl: string;
    amountPaise: number;
  }>
> {
  try {
    const { user } = await requireAstrologer();
    const { profile, error: profErr } = await getOwnAstrologerProfile();
    if (profErr || !profile) {
      return { success: false, error: "Astrologer profile not found." };
    }

    const supabase = await createAdminClient("main");

    // 1. Fetch Authoritative Plan from DB1
    const { data: plan, error: planErr } = await supabase
      .from("payment_plans")
      .select("*")
      .eq("id", payload.planId)
      .eq("is_active", true)
      .single();

    if (planErr || !plan) {
      return { success: false, error: "Selected subscription plan is not available." };
    }

    // Free Plan: Directly initialize Free membership (₹0, 0 leads)
    if (plan.price_paise === 0) {
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      await supabase.from("astrologer_subscriptions").upsert(
        {
          astrologer_id: profile.id,
          plan_id: plan.id,
          status: "active",
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          leads_allocated: 0,
          leads_consumed: 0,
          auto_renew: false,
        },
        { onConflict: "astrologer_id" }
      );

      revalidatePath("/astrologer/subscription");
      return {
        success: true,
        data: {
          orderId: "free_plan",
          paymentUrl: "/astrologer/subscription?activated=free",
          amountPaise: 0,
        },
      };
    }

    // PAID PLAN: Initialize pending subscription record (past_due) and create payment order
    const orderNumber = generateOrderNumber();

    const { data: subRecord } = await supabase
      .from("astrologer_subscriptions")
      .upsert(
        {
          astrologer_id: profile.id,
          plan_id: plan.id,
          status: "past_due",
          auto_renew: false,
        },
        { onConflict: "astrologer_id" }
      )
      .select("id")
      .maybeSingle();

    const orderEntityId = subRecord?.id || plan.id;

    const { data: order, error: orderErr } = await supabase
      .from("payment_orders")
      .insert({
        order_number: orderNumber,
        entity_type: "subscription",
        entity_id: orderEntityId,
        astrologer_id: profile.id,
        amount_paise: plan.price_paise,
        currency: "INR",
        status: "created",
        metadata: {
          plan_id: plan.id,
          plan_name: plan.name,
          astrologer_name: profile.display_name,
          email: user.email,
        },
      })
      .select()
      .single();

    if (orderErr || !order) {
      return { success: false, error: `Failed to create payment order: ${orderErr?.message}` };
    }

    // Call Instamojo Gateway API
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const redirectUrl = `${siteUrl}/api/payments/instamojo/callback`;
    const webhookUrl = `${siteUrl}/api/payments/instamojo/webhook`;

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
      return {
        success: false,
        error: mojoRes.error || "Failed to initialize payment gateway.",
      };
    }

    // Update order with gateway request ID & hosted URL
    await supabase
      .from("payment_orders")
      .update({
        payment_request_id: mojoRes.data.id,
        payment_url: mojoRes.data.longurl,
        status: "pending",
      })
      .eq("id", order.id);

    return {
      success: true,
      data: {
        orderId: order.id,
        paymentUrl: mojoRes.data.longurl,
        amountPaise: plan.price_paise,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error initiating subscription payment",
    };
  }
}

/**
 * Customer action to request a refund for a verified consultation.
 */
export async function requestCustomerRefundAction(payload: {
  paymentId: string;
  reason: string;
}): Promise<AuthResult<boolean>> {
  try {
    const { user } = await requireCustomerContext();
    const supabase = await createAdminClient("main");

    // Look up by internal payment UUID or gateway payment_id
    let { data: payment } = await supabase
      .from("payments")
      .select("id, order_id, payment_id, amount_paise, order:payment_orders!payments_order_id_fkey(customer_id)")
      .eq("id", payload.paymentId)
      .maybeSingle();

    if (!payment) {
      const { data: altPayment } = await supabase
        .from("payments")
        .select("id, order_id, payment_id, amount_paise, order:payment_orders!payments_order_id_fkey(customer_id)")
        .eq("payment_id", payload.paymentId)
        .maybeSingle();
      payment = altPayment;
    }

    const orderData = Array.isArray(payment?.order) ? payment?.order[0] : payment?.order;
    if (!payment || orderData?.customer_id !== user.id) {
      return { success: false, error: "Payment record not found or unauthorized." };
    }

    // Check if an active or processed refund request already exists for this payment
    const { data: existingRefund } = await supabase
      .from("refund_requests")
      .select("id, status")
      .eq("payment_id", payment.id)
      .in("status", ["requested", "approved", "processed"])
      .maybeSingle();

    if (existingRefund) {
      return {
        success: false,
        error: `A refund request for this payment is already ${existingRefund.status}.`,
      };
    }

    const { error } = await supabase.from("refund_requests").insert({
      payment_id: payment.id,
      order_id: payment.order_id,
      customer_id: user.id,
      amount_paise: payment.amount_paise,
      reason: payload.reason,
      status: "requested",
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/customer/billing");
    return { success: true, data: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to submit refund request",
    };
  }
}

/**
 * Fetches the active subscription and lead quota for the logged-in astrologer.
 * Uses authoritative getAstrologerEffectiveSubscription() for instant expiry & downgrade reconciliation.
 */
export async function getAstrologerSubscriptionDetails(): Promise<
  AuthResult<{
    subscription: AstrologerSubscriptionRecord | null;
    availablePlans: PaymentPlanRecord[];
    astrologerId: string;
  }>
> {
  try {
    await requireAstrologer();
    const { profile, error: profErr } = await getOwnAstrologerProfile();
    if (profErr || !profile) {
      return { success: false, error: "Astrologer profile not found." };
    }

    const { getAstrologerEffectiveSubscription } = await import("@/lib/financial/entitlements");
    const { subscription } = await getAstrologerEffectiveSubscription(profile.id);

    const supabase = await createAdminClient("main");

    // Fetch all active plans
    const { data: plans } = await supabase
      .from("payment_plans")
      .select("*")
      .eq("is_active", true)
      .order("price_paise", { ascending: true });

    return {
      success: true,
      data: {
        subscription,
        availablePlans: (plans as PaymentPlanRecord[]) || [],
        astrologerId: profile.id,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load subscription details",
    };
  }
}

/**
 * Pays for an unpaid consultation booking using the Customer's wallet balance.
 * Uses atomic RPC pay_consultation_via_wallet_atomic (Migration 083) with single-transaction guarantees:
 * - Locks customer booking and wallet FOR UPDATE
 * - Validates ownership and unpaid status
 * - Deducts in priority order: Promo -> Refund -> Paid Cash
 * - Inserts subledger transaction & balanced double-entry GL (Dr 2040, Cr 2010/4010)
 * - Marks booking paid and creates invoice/receipt
 */
export async function payConsultationViaWalletAction({
  bookingId,
}: {
  bookingId: string;
}): Promise<AuthResult<{ bookingId: string; orderNumber: string; receiptNumber: string; remainingBalancePaise: number }>> {
  try {
    const { user } = await requireCustomerContext();

    if (!bookingId) {
      return { success: false, error: "Booking ID is required." };
    }

    const admin = await createAdminClient("main");

    // Execute atomic RPC
    const { data, error } = await admin.rpc("pay_consultation_via_wallet_atomic", {
      p_customer_id: user.id,
      p_booking_id: bookingId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data || !data.success) {
      return {
        success: false,
        error: data?.error || "Failed to process consultation payment via wallet.",
      };
    }

    // Credit the astrologer's wallet with the consultation fee
    try {
      const { data: bookingData } = await admin
        .from("customer_bookings")
        .select("astrologer_id, price")
        .eq("id", bookingId)
        .maybeSingle();

      if (bookingData?.astrologer_id) {
        const { creditAstrologerOperatingWallet } = await import("@/lib/financial/astrologer-wallet-engine");
        const amountPaise = data.amount_paise || Math.round((bookingData.price || 0) * 100);

        if (amountPaise > 0) {
          const creditRes = await creditAstrologerOperatingWallet({
            astrologerId: bookingData.astrologer_id,
            amountPaise,
            creditType: "RECHARGE",
            idempotencyKey: `wallet_pay_astro_credit_${bookingId}`,
            description: `Consultation fee received via Customer Wallet for booking #${bookingId}`,
            metadata: {
              booking_id: bookingId,
              customer_id: user.id,
              order_number: data.order_number,
              receipt_number: data.receipt_number,
            },
          });

          if (!creditRes.success) {
            console.error(
              `[payConsultationViaWalletAction] Warning: Failed to credit astrologer ${bookingData.astrologer_id} wallet:`,
              creditRes.error
            );
          }
        }
      }
    } catch (creditErr) {
      console.error("[payConsultationViaWalletAction] Error crediting astrologer wallet:", creditErr);
    }

    // Revalidate paths
    revalidatePath("/customer/billing");
    revalidatePath("/customer/bookings");
    revalidatePath("/customer");
    revalidatePath("/astrologer/dashboard");
    revalidatePath("/astrologer/earnings");

    return {
      success: true,
      data: {
        bookingId: data.booking_id,
        orderNumber: data.order_number,
        receiptNumber: data.receipt_number,
        remainingBalancePaise: data.remaining_available_paise,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error processing wallet payment",
    };
  }
}
