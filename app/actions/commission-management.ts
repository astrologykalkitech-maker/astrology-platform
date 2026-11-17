"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/session";
import { requireAdminAccess, requireSuperAdmin } from "@/lib/auth/admin-guard";
import { revalidatePath } from "next/cache";
import {
  refreshConsultantBalanceSummary,
  type CommissionSettingsRecord,
} from "@/lib/financial/commission-engine";
import { rupeesToPaise } from "@/lib/financial/pricing";
import { getLivePaymentRuntimeConfig } from "@/lib/pay/config";
import { buildUPIUri, generateUPIDataUrl } from "@/lib/pay/qr";
import { normalizeDirectPaymentUtr } from "@/lib/financial/direct-payment-rules";

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
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to load commission analytics", data: null };
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
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to update commission rate" };
  }
}

/**
 * Consultant initiates a "Pay Now" commission settlement via Karmic Ascension Pay UPI QR / Gateway.
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

    if (
      amountRupees !== undefined &&
      (!Number.isFinite(amountRupees) || amountRupees <= 0)
    ) {
      return { success: false, error: "Settlement amount must be greater than zero." };
    }

    const settlementPaise = amountRupees !== undefined
      ? Math.min(rupeesToPaise(amountRupees), outstandingPaise)
      : outstandingPaise;
    if (settlementPaise <= 0) {
      return { success: false, error: "Settlement amount must be greater than zero." };
    }
    const settlementNumber = `JSP_SETTLE_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const paymentConfig = await getLivePaymentRuntimeConfig();
    const upiUri = buildUPIUri({
      transactionReference: settlementNumber,
      amountPaise: settlementPaise,
      transactionNote: "Karmic Ascension platform commission settlement",
      merchantVpa: paymentConfig.merchantVpa,
      merchantName: paymentConfig.merchantName,
      merchantCode: paymentConfig.merchantCode,
      isPersonalUPI: paymentConfig.merchantCode === "0000",
    });
    const qrDataUrl = await generateUPIDataUrl(upiUri);

    const { data: settlement, error: settleErr } = await admin
      .from("commission_settlements")
      .insert({
        settlement_number: settlementNumber,
        consultant_id: profile.id,
        amount_paise: settlementPaise,
        currency: "INR",
        gateway: "karmicascension_pay",
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
        upiUri,
        qrDataUrl,
      },
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to initiate settlement" };
  }
}

/**
 * Confirms and allocates a verified commission settlement against consultant's ledger entries.
 */
export async function submitConsultantCommissionSettlementUtrAction({
  settlementId,
  bankReferenceUtr,
  paymentDate,
}: {
  settlementId: string;
  bankReferenceUtr: string;
  paymentDate: string;
}) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Authentication required" };
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(settlementId)) {
      return { success: false, error: "Invalid settlement record." };
    }

    const utr = normalizeDirectPaymentUtr(bankReferenceUtr);
    if (!utr) return { success: false, error: "Enter a valid UTR/reference number." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      return { success: false, error: "Enter a valid payment date." };
    }
    const parsedDate = new Date(`${paymentDate}T00:00:00.000Z`);
    const indiaToday = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== paymentDate ||
      paymentDate > indiaToday
    ) {
      return { success: false, error: "Payment date cannot be invalid or in the future." };
    }

    const admin = await createAdminClient("main");

    const { data: profile, error: profileError } = await admin
      .from("astrologer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileError || !profile) {
      return { success: false, error: profileError?.message || "Astrologer profile not found." };
    }

    const { data: settlement, error: fetchErr } = await admin
      .from("commission_settlements")
      .select("id, consultant_id, status")
      .eq("id", settlementId)
      .eq("consultant_id", profile.id)
      .maybeSingle();

    if (fetchErr || !settlement) {
      return { success: false, error: "Settlement record not found" };
    }

    if (!["initiated", "rejected", "failed"].includes(settlement.status)) {
      return { success: false, error: "This settlement has already been submitted or processed." };
    }

    const { data: updatedSettlement, error: updateError } = await admin
      .from("commission_settlements")
      .update({
        status: "pending",
        submitted_utr: utr,
        submitted_by: user.id,
        submitted_at: new Date().toISOString(),
        payment_date: paymentDate,
        rejection_reason: null,
        reviewed_by: null,
        reviewed_at: null,
        review_notes: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", settlementId)
      .eq("consultant_id", profile.id)
      .eq("status", settlement.status)
      .select("id")
      .maybeSingle();
    if (updateError) return { success: false, error: updateError.message };
    if (!updatedSettlement) return { success: false, error: "Settlement state changed. Refresh and retry." };

    revalidatePath("/astrologer/earnings");
    revalidatePath("/super-admin/financials/commissions/verifications");
    revalidatePath("/super-admin/financials");

    return { success: true, message: "UTR submitted. Platform dues remain outstanding until a Super Admin verifies the payment." };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to submit settlement UTR" };
  }
}
