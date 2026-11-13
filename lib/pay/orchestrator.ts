import crypto from "crypto";
import { getJyotishPayConfig } from "./config";
import { buildUPIUri, generateUPISvg } from "./qr";
import {
  JyotishPaymentIntent,
  JyotishQRSession,
  JyotishPayIntentStatus,
} from "./types";
import { recordFinancialTransaction } from "../financial/ledger";
import { activateSubscriptionOnPayment } from "../financial/plans";

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
 * Creates a JyotishSetu Pay dynamic QR payment session for an intent.
 */
export async function createDynamicQRSession(
  intent: JyotishPaymentIntent,
  note: string = "JyotishSetu Astrology Consultation",
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
  const receiptNo = generateReceiptNumber();

  // 1. Double-Entry Financial Ledger
  try {
    const isConsultation = intent.entity_type === "consultation";
    const commissionPaise = isConsultation ? Math.round(intent.amount_paise * 0.10) : 0;
    const astrologerPaise = isConsultation ? intent.amount_paise - commissionPaise : 0;

    await recordFinancialTransaction({
      entityType: intent.entity_type,
      referenceId: intent.booking_id || intent.plan_id || intent.id,
      amountPaise: intent.amount_paise,
      commissionPaise,
      astrologerPaise,
      astrologerId: intent.astrologer_id || undefined,
      description: `JyotishSetu Pay clearance: ${intent.intent_number} [Ref: ${providerRef}]`,
    });
  } catch (ledgerErr) {
    console.error("[JyotishSetu Pay] Ledger recording notice:", ledgerErr);
  }

  // 2. Subscription Activation (if subscription)
  if (intent.entity_type === "subscription" && intent.astrologer_id && intent.plan_id) {
    try {
      await activateSubscriptionOnPayment({
        astrologerId: intent.astrologer_id,
        planId: intent.plan_id,
        paymentId: intent.id,
        billingCycle: "monthly",
      });
    } catch (subErr) {
      console.error("[JyotishSetu Pay] Subscription activation notice:", subErr);
    }
  }

  // 3. Consultation Confirmation (if consultation)
  if (intent.entity_type === "consultation" && intent.booking_id && options?.supabaseClient) {
    try {
      await options.supabaseClient
        .from("customer_bookings")
        .update({
          payment_status: "paid",
          status: "confirmed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", intent.booking_id);
    } catch (bookingErr) {
      console.error("[JyotishSetu Pay] Booking status confirmation notice:", bookingErr);
    }
  }

  return {
    success: true,
    receiptNumber: receiptNo,
  };
}

