import { createAdminClient } from "@/lib/supabase/admin";
import { ACCOUNT_CODES } from "./types";

export interface JournalLineInput {
  accountCode: string;
  debitPaise: number;
  creditPaise: number;
}

export interface CreateJournalEntryParams {
  entryNumber?: string;
  referenceType:
    | "consultation_payment"
    | "subscription_payment"
    | "consultant_settlement"
    | "refund"
    | "jyotish_payment_intent"
    | "consultation_escrow_release";
  referenceId: string;
  description: string;
  entryDate?: string;
  lines: JournalLineInput[];
}

/**
 * Creates an immutable double-entry journal entry with line items.
 * Validates that sum(debits) === sum(credits) down to the exact paise.
 */
export async function createDoubleEntryJournal(
  params: CreateJournalEntryParams
): Promise<{ success: boolean; entryId?: string; error?: string }> {
  const { lines, referenceType, referenceId, description } = params;

  // 1. Validation: At least two lines required
  if (!lines || lines.length < 2) {
    return { success: false, error: "A double-entry journal entry requires at least 2 lines." };
  }

  // 2. Parity check: Total Debits must strictly equal Total Credits
  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of lines) {
    if (line.debitPaise < 0 || line.creditPaise < 0) {
      return { success: false, error: "Journal lines cannot have negative debit or credit amounts." };
    }
    if (line.debitPaise > 0 && line.creditPaise > 0) {
      return { success: false, error: "A single line item cannot have both debit and credit amounts." };
    }
    if (line.debitPaise === 0 && line.creditPaise === 0) {
      return { success: false, error: "Journal line must have either debit or credit greater than 0." };
    }

    totalDebit += line.debitPaise;
    totalCredit += line.creditPaise;
  }

  if (totalDebit !== totalCredit) {
    return {
      success: false,
      error: `Accounting equation violated: Total debits (${totalDebit}) must equal total credits (${totalCredit}).`,
    };
  }

  const supabase = await createAdminClient("main");

  const entryNumber =
    params.entryNumber ||
    `JE-${new Date().toISOString().slice(0, 7).replace("-", "")}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const rpcLines = lines.map((line) => ({
    account_code: line.accountCode,
    debit_paise: line.debitPaise,
    credit_paise: line.creditPaise,
  }));

  const { data: entryId, error } = await supabase.rpc("post_atomic_financial_journal", {
    p_entry_number: entryNumber,
    p_reference_type: referenceType,
    p_reference_id: referenceId,
    p_description: description,
    p_entry_date: params.entryDate || new Date().toISOString().slice(0, 10),
    p_lines: rpcLines,
  });

  if (error) {
    if (/Could not find the function|does not exist|schema cache/i.test(error.message)) {
      return {
        success: false,
        error: "Payment safety migration 064 must be applied before posting financial journals.",
      };
    }
    return { success: false, error: `Failed to post atomic journal entry: ${error.message}` };
  }
  if (typeof entryId !== "string") {
    return { success: false, error: "Atomic journal RPC returned no journal entry." };
  }

  return { success: true, entryId };
}

/**
 * Convenience helper: Records a consultation payment in the double-entry ledger.
 * Debit: Instamojo Clearing Account (Asset)
 * Credit: Platform Commission Revenue (Revenue)
 * Credit: Astrologer Payable Liability (Liability)
 */
export async function recordConsultationPaymentInLedger(params: {
  paymentId: string;
  grossPaise: number;
  platformFeePaise: number;
  astrologerPayablePaise: number;
  description: string;
}): Promise<{ success: boolean; error?: string }> {
  return createDoubleEntryJournal({
    referenceType: "consultation_payment",
    referenceId: params.paymentId,
    description: params.description,
    lines: [
      {
        accountCode: ACCOUNT_CODES.INSTAMOJO_CLEARING,
        debitPaise: params.grossPaise,
        creditPaise: 0,
      },
      {
        accountCode: ACCOUNT_CODES.PLATFORM_COMMISSION_REVENUE,
        debitPaise: 0,
        creditPaise: params.platformFeePaise,
      },
      {
        accountCode: ACCOUNT_CODES.ASTROLOGER_PAYABLE,
        debitPaise: 0,
        creditPaise: params.astrologerPayablePaise,
      },
    ],
  });
}

/**
 * Convenience helper: Records a subscription purchase/renewal in the ledger.
 * Debit: Instamojo Clearing Account (Asset)
 * Credit: Astrologer Subscription Revenue (Revenue)
 */
export async function recordSubscriptionPaymentInLedger(params: {
  paymentId: string;
  amountPaise: number;
  description: string;
}): Promise<{ success: boolean; error?: string }> {
  return createDoubleEntryJournal({
    referenceType: "subscription_payment",
    referenceId: params.paymentId,
    description: params.description,
    lines: [
      {
        accountCode: ACCOUNT_CODES.INSTAMOJO_CLEARING,
        debitPaise: params.amountPaise,
        creditPaise: 0,
      },
      {
        accountCode: ACCOUNT_CODES.SUBSCRIPTION_REVENUE,
        debitPaise: 0,
        creditPaise: params.amountPaise,
      },
    ],
  });
}

/**
 * General financial transaction recorder for Karmic Ascension Pay orchestration.
 */
export async function recordFinancialTransaction(params: {
  entityType: "consultation" | "subscription";
  referenceId: string;
  amountPaise: number;
  commissionPaise?: number;
  astrologerPaise?: number;
  astrologerId?: string;
  description: string;
}): Promise<{ success: boolean; error?: string }> {
  if (params.entityType === "consultation") {
    const commission = params.commissionPaise ?? Math.round(params.amountPaise * 0.1);
    const astrologerAmount = params.astrologerPaise ?? params.amountPaise - commission;
    return recordConsultationPaymentInLedger({
      paymentId: params.referenceId,
      grossPaise: params.amountPaise,
      platformFeePaise: commission,
      astrologerPayablePaise: astrologerAmount,
      description: params.description,
    });
  } else {
    return recordSubscriptionPaymentInLedger({
      paymentId: params.referenceId,
      amountPaise: params.amountPaise,
      description: params.description,
    });
  }
}

export async function recordJyotishPaymentIntentInLedger(params: {
  intentId: string;
  entityType: "consultation" | "subscription";
  amountPaise: number;
  description: string;
}): Promise<{ success: boolean; error?: string }> {
  if (params.entityType === "subscription") {
    return createDoubleEntryJournal({
      referenceType: "jyotish_payment_intent",
      referenceId: params.intentId,
      description: params.description,
      lines: [
        { accountCode: ACCOUNT_CODES.INSTAMOJO_CLEARING, debitPaise: params.amountPaise, creditPaise: 0 },
        { accountCode: ACCOUNT_CODES.SUBSCRIPTION_REVENUE, debitPaise: 0, creditPaise: params.amountPaise },
      ],
    });
  }

  return createDoubleEntryJournal({
    referenceType: "jyotish_payment_intent",
    referenceId: params.intentId,
    description: params.description,
    lines: [
      { accountCode: ACCOUNT_CODES.INSTAMOJO_CLEARING, debitPaise: params.amountPaise, creditPaise: 0 },
      { accountCode: ACCOUNT_CODES.ESCROW_CONSULTATION, debitPaise: 0, creditPaise: params.amountPaise },
    ],
  });
}

/**
 * Releases escrowed consultation funds upon session delivery.
 * Debit: Customer Consultation Escrow (2010 - Liability reduction)
 * Credit: Platform Commission Revenue (4010 - Revenue earned)
 * Credit: Astrologer Payable Liability (2020 - Liability owed to practitioner)
 */
export async function releaseConsultationEscrowInLedger(params: {
  bookingId: string;
  grossPaise: number;
  platformFeePaise: number;
  astrologerPayablePaise: number;
  description: string;
}): Promise<{ success: boolean; entryId?: string; error?: string }> {
  return createDoubleEntryJournal({
    referenceType: "consultation_escrow_release",
    referenceId: params.bookingId,
    description: params.description,
    lines: [
      {
        accountCode: ACCOUNT_CODES.ESCROW_CONSULTATION,
        debitPaise: params.grossPaise,
        creditPaise: 0,
      },
      {
        accountCode: ACCOUNT_CODES.PLATFORM_COMMISSION_REVENUE,
        debitPaise: 0,
        creditPaise: params.platformFeePaise,
      },
      {
        accountCode: ACCOUNT_CODES.ASTROLOGER_PAYABLE,
        debitPaise: 0,
        creditPaise: params.astrologerPayablePaise,
      },
    ],
  });
}

/**
 * Reconciles dual-ledger accounting upon consultation completion:
 * 1. Releases Escrow (Account 2010) if booking was paid via Jyotish Pay QR.
 * 2. Bridges gateway earnings (Instamojo / Jyotish Pay) into commission_ledger.
 */
export async function reconcileCompletedConsultationLedgers(params: {
  bookingId: string;
  astrologerId?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createAdminClient("main");

    const { data: booking, error: bErr } = await supabase
      .from("customer_bookings")
      .select("id, price, astrologer_id, payment_mode, status")
      .eq("id", params.bookingId)
      .maybeSingle();

    if (bErr || !booking) {
      return { success: false, error: bErr?.message || "Booking not found" };
    }

    const astrologerId = params.astrologerId || booking.astrologer_id;

    // Authoritative atomic escrow release via Migration 066 RPC
    const { data: atomicResult, error: atomicErr } = await supabase.rpc(
      "release_consultation_escrow_atomic",
      { p_booking_id: params.bookingId }
    );

    if (atomicErr) {
      console.error("[reconcileCompletedBookingEscrowAndCommission] Atomic RPC invocation error:", atomicErr.message);
      return { success: false, error: atomicErr.message };
    }

    if (!atomicResult || !atomicResult.success) {
      return {
        success: false,
        error: atomicResult?.error || "Consultation escrow release failed or was rejected.",
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Ledger reconciliation failed",
    };
  }
}

