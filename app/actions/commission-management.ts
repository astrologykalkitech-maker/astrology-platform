"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/session";
import { requireAdminAccess, requireSuperAdmin } from "@/lib/auth/admin-guard";
import { revalidatePath } from "next/cache";
import {
  postCommissionLedgerEntry,
  refreshConsultantBalanceSummary,
  getEffectiveCommissionRate,
  getConsultantCommissionStatement,
  type CommissionSettingsRecord,
} from "@/lib/financial/commission-engine";
import { rupeesToPaise } from "@/lib/financial/pricing";

/**
 * Super Admin retrieves platform-wide commission analytics and consultant dues ledger.
 */
export async function getSuperAdminCommissionAnalytics() {
  try {
    await requireAdminAccess();
    const admin = await createAdminClient("main");

    // Fetch all balance summaries
    const { data: summaries } = await admin
      .from("consultant_balance_summaries")
      .select("*, consultant:astrologer_profiles(id, display_name, slug)")
      .order("outstanding_commission_paise", { ascending: false });

    // Aggregate platform metrics
    let totalGrossPaise = 0;
    let totalCommissionGeneratedPaise = 0;
    let totalCommissionSettledPaise = 0;
    let totalOutstandingDuesPaise = 0;

    for (const s of summaries || []) {
      totalGrossPaise += Number(s.total_gross_paise || 0);
      totalCommissionGeneratedPaise += Number(s.total_commission_earned_paise || 0);
      totalCommissionSettledPaise += Number(s.total_settled_paise || 0);
      totalOutstandingDuesPaise += Number(s.outstanding_commission_paise || 0);
    }

    // Fetch active commission settings
    const { data: settings } = await admin
      .from("commission_settings")
      .select("*")
      .order("created_at", { ascending: false });

    // Fetch recent 100 commission ledger entries
    const { data: recentEntries } = await admin
      .from("commission_ledger")
      .select("*, consultant:astrologer_profiles(display_name, slug)")
      .order("created_at", { ascending: false })
      .limit(100);

    return {
      success: true,
      data: {
        metrics: {
          totalGrossPaise,
          totalCommissionGeneratedPaise,
          totalCommissionSettledPaise,
          totalOutstandingDuesPaise,
          activeConsultantsCount: (summaries || []).length,
        },
        consultantDues: summaries || [],
        settings: (settings || []) as CommissionSettingsRecord[],
        recentLedger: recentEntries || [],
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load commission analytics", data: null };
  }
}

/**
 * Super Admin updates or configures the platform commission rate.
 */
export async function updateSuperAdminCommissionSetting({
  commissionRate,
  applicableScope = "all",
  consultantId,
  description,
}: {
  commissionRate: number;
  applicableScope?: string;
  consultantId?: string;
  description?: string;
}) {
  try {
    const { profile } = await requireSuperAdmin();
    const admin = await createAdminClient("main");

    const rate = Math.max(0, Math.min(100, Number(commissionRate)));

    const { data, error } = await admin
      .from("commission_settings")
      .insert({
        commission_rate: rate,
        applicable_scope: applicableScope,
        consultant_id: consultantId || null,
        description: description || `Commission rate updated to ${rate}% by Super Admin`,
        created_by: profile.id,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/super-admin/financials");
    revalidatePath("/astrologer/earnings");

    return { success: true, setting: data };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update commission rate" };
  }
}

/**
 * Consultant initiates a "Pay Now" commission settlement via JyotishSetu Pay UPI QR / Gateway.
 */
export async function initiateConsultantCommissionSettlementAction(amountRupees?: number) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Authentication required" };
    }

    const admin = await createAdminClient("main");
    const { data: profile } = await admin
      .from("astrologer_profiles")
      .select("id, display_name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) {
      return { success: false, error: "Astrologer profile not found" };
    }

    const summary = await refreshConsultantBalanceSummary(profile.id);
    const outstandingPaise = summary?.outstanding_commission_paise || 0;

    if (outstandingPaise <= 0) {
      return { success: false, error: "No outstanding commission dues to settle." };
    }

    const settlementPaise = amountRupees ? Math.min(rupeesToPaise(amountRupees), outstandingPaise) : outstandingPaise;
    const settlementNumber = `JSP_SETTLE_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const { data: settlement, error: settleErr } = await admin
      .from("commission_settlements")
      .insert({
        settlement_number: settlementNumber,
        consultant_id: profile.id,
        amount_paise: settlementPaise,
        currency: "INR",
        gateway: "jyotishsetu_pay",
        status: "initiated",
        notes: `Platform commission settlement for ${profile.display_name}`,
      })
      .select("id, settlement_number, amount_paise")
      .single();

    if (settleErr) {
      return { success: false, error: settleErr.message };
    }

    return {
      success: true,
      settlement: {
        id: settlement.id,
        settlementNumber: settlement.settlement_number,
        amountPaise: settlement.amount_paise,
        amountRupees: settlement.amount_paise / 100,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to initiate settlement" };
  }
}

/**
 * Confirms and allocates a verified commission settlement against consultant's ledger entries.
 */
export async function confirmConsultantCommissionSettlementAction({
  settlementId,
  bankReferenceUtr,
}: {
  settlementId: string;
  bankReferenceUtr: string;
}) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Authentication required" };

    const admin = await createAdminClient("main");

    const { data: settlement, error: fetchErr } = await admin
      .from("commission_settlements")
      .select("*")
      .eq("id", settlementId)
      .single();

    if (fetchErr || !settlement) {
      return { success: false, error: "Settlement record not found" };
    }

    if (settlement.status === "succeeded") {
      return { success: true, message: "Settlement already processed." };
    }

    const nowIso = new Date().toISOString();

    // 1. Mark settlement succeeded
    await admin
      .from("commission_settlements")
      .update({
        status: "succeeded",
        gateway_reference: bankReferenceUtr.trim(),
        verified_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", settlementId);

    // 2. Post SETTLEMENT_PAYMENT entry to commission_ledger
    await admin.from("commission_ledger").insert({
      consultant_id: settlement.consultant_id,
      entry_type: "SETTLEMENT_PAYMENT",
      commission_rate: 0,
      gross_amount_paise: settlement.amount_paise,
      commission_amount_paise: settlement.amount_paise,
      currency: "INR",
      status: "settled",
      idempotency_key: `SETTLE_ALLOC_${settlementId}`,
      description: `Settlement cleared via UTR ${bankReferenceUtr.trim()}`,
    });

    // 3. Refresh summary
    await refreshConsultantBalanceSummary(settlement.consultant_id);

    revalidatePath("/astrologer/earnings");
    revalidatePath("/super-admin/financials");

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to confirm settlement" };
  }
}
