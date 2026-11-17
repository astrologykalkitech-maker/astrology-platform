import crypto from "crypto";
import { getJyotishPayConfig } from "./config";
import { buildUPIUri, generateUPISvg } from "./qr";
import {
  JyotishPaymentIntent,
  JyotishQRSession,
  JyotishPayIntentStatus,
} from "./types";
import { recordJyotishPaymentIntentInLedger } from "../financial/ledger";
import { activateSubscriptionOnPayment } from "../financial/plans";
import { createAdminClient } from "@/lib/supabase/admin";

// In-memory or database-backed fallback storage for high-concurrency sessions
export interface CreateIntentParams {
  customerId?: string | null;
  astrologerId?: string | null;
  bookingId?: string | null;
  planId?: string | null;
  entityType: "consultation" | "subscription";
  amountPaise: number;
  metadata?: Record<string, any>;
}

export function generateIntentNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randHex = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `JSP_INT_${dateStr}_${randHex}`;
}

export function generateSessionCode(): string {
  const randHex = crypto.randomBytes(6).toString("hex").toUpperCase();
  return `JSP_QR_${randHex}`;
}

export function generateReceiptNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 7).replace(/-/g, "");
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `JSP-REC-${dateStr}-${rand}`;
}

export function generateClientSecret(intentId: string): string {
  return `jsp_sec_${intentId.replace(/-/g, "")}_${crypto.randomBytes(8).toString("hex")}`;
}

/**
 * Creates a Karmic Ascension Pay dynamic QR payment session for an intent.
 */
export async function createDynamicQRSession(
  intent: JyotishPaymentIntent,
  note: string = "Karmic Ascension Astrology Consultation",
  customConfig?: {
    merchantVpa?: string;
    merchantName?: string;
    merchantCode?: string;
  }
): Promise<{ sessionCode: string; upiUri: string; qrSvg: string; expiresAt: string }> {
  const sessionCode = generateSessionCode();
  const upiUri = buildUPIUri({
    transactionReference: sessionCode,
    amountPaise: intent.amount_paise,
    transactionNote: note,
    merchantVpa: customConfig?.merchantVpa,
    merchantName: customConfig?.merchantName,
    merchantCode: customConfig?.merchantCode,
    isPersonalUPI: customConfig?.merchantCode === "0000",
  });

  const qrSvg = await generateUPISvg(upiUri);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

  return {
    sessionCode,
    upiUri,
    qrSvg,
    expiresAt,
  };
}

/**
 * Transitions an intent and executes post-payment triggers (ledger entry, subscription activation, booking confirmation).
 */
export async function completePaymentIntent(
  intent: JyotishPaymentIntent,
  providerRef: string,
  options?: {
    supabaseClient?: any;
    verifiedBy?: string;
  }
): Promise<{ success: boolean; receiptNumber: string }> {
  // 1. Double-entry financial ledger. A stable intent reference prevents replay duplication.
  const ledgerResult = await recordJyotishPaymentIntentInLedger({
    intentId: intent.id,
    entityType: intent.entity_type,
    amountPaise: intent.amount_paise,
    description: `Karmic Ascension Pay clearance: ${intent.intent_number} [Ref: ${providerRef}]`,
  });
  if (!ledgerResult.success) {
    throw new Error(ledgerResult.error || "Failed to record payment in the financial ledger.");
  }

  // 2. Subscription Activation (if subscription)
  if (intent.entity_type === "subscription" && intent.astrologer_id && intent.plan_id) {
    const subscriptionResult = await activateSubscriptionOnPayment({
      astrologerId: intent.astrologer_id,
      planId: intent.plan_id,
      paymentId: intent.id,
      billingCycle: "monthly",
    });
    if (!subscriptionResult.success) {
      throw new Error(subscriptionResult.error || "Failed to activate the subscription.");
    }
  }

  // 3. Consultation Confirmation (if consultation)
  if (intent.entity_type === "consultation" && intent.booking_id) {
    if (!options?.supabaseClient) {
      throw new Error("A database client is required to complete a consultation payment.");
    }

    const { data: booking, error: bookingLookupError } = await options.supabaseClient
      .from("customer_bookings")
      .select("status")
      .eq("id", intent.booking_id)
      .maybeSingle();
    if (bookingLookupError || !booking) {
      throw new Error(
        `Could not validate the consultation booking: ${bookingLookupError?.message || "Booking not found."}`
      );
    }
    if (!["pending", "confirmed", "completed"].includes(booking.status)) {
      throw new Error("Cancelled or inactive bookings cannot be paid.");
    }

    const { data: updatedBooking, error: bookingError } = await options.supabaseClient
      .from("customer_bookings")
      .update({
        payment_status: "paid",
        status: booking.status === "pending" ? "confirmed" : booking.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", intent.booking_id)
      .eq("status", booking.status)
      .select("id")
      .maybeSingle();
    if (bookingError || !updatedBooking) {
      throw new Error(
        `Failed to confirm the consultation booking: ${bookingError?.message || "Booking state changed during payment."}`
      );
    }
  }

  const paymentDb = options?.supabaseClient || await createAdminClient("main");
  const { data: existingReceipts, error: existingReceiptError } = await paymentDb
    .from("payment_receipts")
    .select("receipt_number")
    .eq("intent_id", intent.id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (existingReceiptError) {
    throw new Error(`Failed to check existing payment receipts: ${existingReceiptError.message}`);
  }

  let receiptNo = existingReceipts?.[0]?.receipt_number;
  if (!receiptNo) {
    receiptNo = generateReceiptNumber();
    const verificationHash = crypto
      .createHash("sha256")
      .update(`${intent.id}:${providerRef}:${intent.amount_paise}`)
      .digest("hex");
    const { error: receiptError } = await paymentDb.from("payment_receipts").insert({
      receipt_number: receiptNo,
      intent_id: intent.id,
      booking_id: intent.booking_id || null,
      customer_id: intent.customer_id || null,
      astrologer_id: intent.astrologer_id || null,
      amount_paise: intent.amount_paise,
      tax_paise: 0,
      payment_method: "UPI_VERIFIED",
      utr_or_txn_id: providerRef,
      verification_hash: verificationHash,
      metadata: { receipt_source: "jyotish_pay_intent" },
    });
    if (receiptError) {
      const { data: retryReceipt, error: retryReceiptError } = await paymentDb
        .from("payment_receipts")
        .select("receipt_number")
        .eq("intent_id", intent.id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (retryReceiptError || !retryReceipt?.[0]) {
        throw new Error(
          `Failed to persist the verified payment receipt: ${receiptError.message}`
        );
      }
      receiptNo = retryReceipt[0].receipt_number;
    }
  }

  return {
    success: true,
    receiptNumber: receiptNo,
  };
}

