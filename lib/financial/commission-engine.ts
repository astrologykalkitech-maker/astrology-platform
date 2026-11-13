import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";

export interface CommissionSettingsRecord {
  id: string;
  commission_rate: number;
  applicable_scope: string;
  consultant_id?: string | null;
  effective_from: string;
  effective_until?: string | null;
  is_active: boolean;
  description?: string | null;
  created_at: string;
}

export interface CommissionLedgerRecord {
  id: string;
  consultant_id: string;
  booking_id?: string | null;
  puja_booking_id?: string | null;
  payment_order_id?: string | null;
  payment_intent_id?: string | null;
  entry_type:
    | "COMMISSION_EARNED"
    | "COMMISSION_REVERSED"
    | "SETTLEMENT_PAYMENT"
    | "SETTLEMENT_ALLOCATION"
    | "REFUND_ADJUSTMENT"
    | "MANUAL_ADJUSTMENT";
  commission_rate: number;
  gross_amount_paise: number;
  commission_amount_paise: number;
  currency: string;
  status: "posted" | "settled" | "reversed" | "pending";
  reversal_of?: string | null;
  idempotency_key?: string | null;
  description: string;
  created_at: string;
}

export interface ConsultantBalanceSummary {
  consultant_id: string;
  total_gross_paise: number;
  total_commission_earned_paise: number;
  total_settled_paise: number;
  total_reversed_paise: number;
  outstanding_commission_paise: number; // Negative balance / liability owed to JyotishSetu
  last_settlement_at?: string | null;
  last_calculated_at: string;
}

/**
 * Retrieves the effective platform commission rate.
 * Defaults to 10% if unconfigured.
 */
export async function getEffectiveCommissionRate(consultantId?: string): Promise<number> {
  try {
    const admin = await createAdminClient("main");

    // Check consultant-specific override first
    if (consultantId) {
      const { data: specific } = await admin
        .from("commission_settings")
        .select("commission_rate")
        .eq("consultant_id", consultantId)
        .eq("is_active", true)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (specific && typeof specific.commission_rate === "number") {
        return Number(specific.commission_rate);
      }
    }

    // Default to global setting
    const { data: globalSetting } = await admin
      .from("commission_settings")
      .select("commission_rate")
      .eq("applicable_scope", "all")
      .eq("is_active", true)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (globalSetting && typeof globalSetting.commission_rate === "number") {
      return Number(globalSetting.commission_rate);
    }

    return 10.0;
  } catch {
    return 10.0;
  }
}

/**
 * Posts an immutable commission entry into the double-entry commission ledger
 * when an eligible consultation or booking is completed.
 */
export async function postCommissionLedgerEntry({
  consultantId,
  bookingId,
  pujaBookingId,
  paymentOrderId,
  paymentIntentId,
  grossAmountPaise,
  idempotencyKey,
  description,
  customRate,
}: {
  consultantId: string;
  bookingId?: string;
  pujaBookingId?: string;
  paymentOrderId?: string;
  paymentIntentId?: string;
  grossAmountPaise: number;
  idempotencyKey?: string;
  description: string;
  customRate?: number;
}): Promise<{ success: boolean; entryId?: string; error?: string }> {
  try {
    if (!consultantId || grossAmountPaise <= 0) {
      return { success: false, error: "Invalid consultant or transaction amount" };
    }

    const admin = await createAdminClient("main");
    const rate = customRate !== undefined ? customRate : await getEffectiveCommissionRate(consultantId);
    const commissionPaise = Math.round((grossAmountPaise * rate) / 100);

    const idempotency = idempotencyKey || `COMM_${consultantId}_${bookingId || pujaBookingId || Date.now()}`;

    // 1. Insert into commission_ledger
    const { data: ledgerEntry, error: insertErr } = await admin
      .from("commission_ledger")
      .insert({
        consultant_id: consultantId,
        booking_id: bookingId || null,
        puja_booking_id: pujaBookingId || null,
        payment_order_id: paymentOrderId || null,
        payment_intent_id: paymentIntentId || null,
        entry_type: "COMMISSION_EARNED",
        commission_rate: rate,
        gross_amount_paise: grossAmountPaise,
        commission_amount_paise: commissionPaise,
        currency: "INR",
        status: "posted",
        idempotency_key: idempotency,
        description,
      })
      .select("id")
      .single();

    if (insertErr) {
      // Idempotent duplicate check
      if (insertErr.code === "23505") {
        return { success: true };
      }
      return { success: false, error: insertErr.message };
    }

    // 2. Recompute and update consultant balance summary
    await refreshConsultantBalanceSummary(consultantId);

    revalidatePath("/astrologer/earnings");
    revalidatePath("/super-admin/financials");

    return { success: true, entryId: ledgerEntry.id };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to post commission" };
  }
}

/**
 * Refreshes consultant's materialized liability and float balance from ledger.
 */
export async function refreshConsultantBalanceSummary(
  consultantId: string
): Promise<ConsultantBalanceSummary | null> {
  try {
    const admin = await createAdminClient("main");

    const { data: entries, error } = await admin
      .from("commission_ledger")
      .select("entry_type, gross_amount_paise, commission_amount_paise, status")
      .eq("consultant_id", consultantId);

    if (error || !entries) return null;

    let totalGross = 0;
    let totalCommissionEarned = 0;
    let totalSettled = 0;
    let totalReversed = 0;

    for (const e of entries) {
      if (e.entry_type === "COMMISSION_EARNED" && e.status !== "reversed") {
        totalGross += Number(e.gross_amount_paise || 0);
        totalCommissionEarned += Number(e.commission_amount_paise || 0);
      } else if (e.entry_type === "SETTLEMENT_PAYMENT" || e.entry_type === "SETTLEMENT_ALLOCATION") {
        totalSettled += Number(e.commission_amount_paise || 0);
      } else if (e.entry_type === "COMMISSION_REVERSED" || e.entry_type === "REFUND_ADJUSTMENT") {
        totalReversed += Number(e.commission_amount_paise || 0);
      }
    }

    const outstandingPaise = Math.max(0, totalCommissionEarned - totalSettled - totalReversed);
    const nowIso = new Date().toISOString();

    const summary: ConsultantBalanceSummary = {
      consultant_id: consultantId,
      total_gross_paise: totalGross,
      total_commission_earned_paise: totalCommissionEarned,
      total_settled_paise: totalSettled,
      total_reversed_paise: totalReversed,
      outstanding_commission_paise: outstandingPaise,
      last_calculated_at: nowIso,
    };

    await admin.from("consultant_balance_summaries").upsert(
      {
        consultant_id: consultantId,
        total_gross_paise: totalGross,
        total_commission_earned_paise: totalCommissionEarned,
        total_settled_paise: totalSettled,
        total_reversed_paise: totalReversed,
        outstanding_commission_paise: outstandingPaise,
        last_calculated_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "consultant_id" }
    );

    return summary;
  } catch {
    return null;
  }
}

/**
 * Retrieves the authenticated consultant's balance summary and recent ledger statements.
 */
export async function getConsultantCommissionStatement(consultantIdOverride?: string) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Authentication required", data: null };
    }

    const admin = await createAdminClient("main");
    let targetConsultantId = consultantIdOverride;

    if (!targetConsultantId) {
      const { data: profile } = await admin
        .from("astrologer_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!profile) {
        return { success: false, error: "Astrologer profile not found", data: null };
      }
      targetConsultantId = profile.id;
    }

    if (!targetConsultantId) {
      return { success: false, error: "Target consultant ID unresolved", data: null };
    }

    // Refresh summary
    const fetchedSummary = await refreshConsultantBalanceSummary(targetConsultantId);
    const summary: ConsultantBalanceSummary = fetchedSummary ?? {
      consultant_id: targetConsultantId,
      total_gross_paise: 0,
      total_commission_earned_paise: 0,
      total_settled_paise: 0,
      total_reversed_paise: 0,
      outstanding_commission_paise: 0,
      last_calculated_at: new Date().toISOString(),
    };

    // Fetch entries
    const { data: ledgerEntries } = await admin
      .from("commission_ledger")
      .select("*")
      .eq("consultant_id", targetConsultantId)
      .order("created_at", { ascending: false })
      .limit(50);

    return {
      success: true,
      data: {
        summary,
        ledger: (ledgerEntries || []) as CommissionLedgerRecord[],
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load statement", data: null };
  }
}
