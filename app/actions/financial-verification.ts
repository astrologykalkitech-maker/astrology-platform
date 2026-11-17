"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { canReviewDirectPayment } from "@/lib/financial/direct-payment-rules";

type DirectPaymentRow = {
  id: string;
  booking_id: string;
  astrologer_id: string;
  customer_id: string;
  utr: string;
  amount_paise: number;
  payment_date: string;
  status: "pending" | "verified" | "rejected" | "refunded" | "failed";
  submitted_at: string;
  reviewed_at: string | null;
  review_notes: string | null;
  rejection_reason: string | null;
  booking_status?: string;
  booking_price?: number;
  service_type?: string;
  customer_name?: string;
  astrologer_name?: string;
  astrologer_user_id?: string | null;
  astrologer_upi_vpa?: string | null;
};

type SettlementRow = {
  id: string;
  settlement_number: string;
  consultant_id: string;
  submitted_utr: string;
  amount_paise: number;
  payment_date: string | null;
  submitted_at: string | null;
  notes: string | null;
  display_name?: string;
  consultant_user_id?: string | null;
};

type JyotishPayVerificationRow = {
  id: string;
  intent_id: string;
  submitter_id: string;
  customer_id: string | null;
  astrologer_id: string | null;
  utr: string;
  amount_paise: number;
  payment_date: string;
  submitted_at: string;
  entity_type?: string;
  intent_number?: string;
  booking_id?: string | null;
  plan_id?: string | null;
  booking_status?: string;
  customer_name?: string;
  astrologer_name?: string;
};

export async function getManualVerificationQueueAction(): Promise<{
  success: boolean;
  directPayments?: DirectPaymentRow[];
  settlements?: SettlementRow[];
  jyotishPayments?: JyotishPayVerificationRow[];
  error?: string;
}> {
  try {
    await requireSuperAdmin();
    const admin = await createAdminClient("main");
    const [paymentResult, settlementResult, jyotishResult] = await Promise.all([
      admin
        .from("direct_consultation_payments")
        .select("id, booking_id, astrologer_id, customer_id, utr, amount_paise, payment_date, status, submitted_at, reviewed_at, review_notes, rejection_reason")
        .in("status", ["pending", "verified"])
        .order("submitted_at", { ascending: true })
        .limit(250),
      admin
        .from("commission_settlements")
        .select("id, settlement_number, consultant_id, submitted_utr, amount_paise, payment_date, submitted_at, notes")
        .eq("status", "pending")
        .not("submitted_utr", "is", null)
        .order("submitted_at", { ascending: true })
        .limit(250),
      admin
        .from("jyotish_pay_verifications")
        .select("id, intent_id, submitter_id, customer_id, astrologer_id, utr, amount_paise, payment_date, submitted_at")
        .eq("status", "pending")
        .order("submitted_at", { ascending: true })
        .limit(250),
    ]);

    if (paymentResult.error) return { success: false, error: paymentResult.error.message };
    if (settlementResult.error) return { success: false, error: settlementResult.error.message };
    if (jyotishResult.error) return { success: false, error: jyotishResult.error.message };

    const payments = (paymentResult.data || []) as DirectPaymentRow[];
    const settlements = (settlementResult.data || []) as SettlementRow[];
    const jyotishPayments = (jyotishResult.data || []) as JyotishPayVerificationRow[];
    const intentIds = Array.from(new Set(jyotishPayments.map((row) => row.intent_id)));
    const intentResult = intentIds.length
      ? await admin
          .from("payment_intents")
          .select("id, entity_type, intent_number, booking_id, plan_id")
          .in("id", intentIds)
      : { data: [], error: null };
    if (intentResult.error) return { success: false, error: intentResult.error.message };
    const intents = new Map((intentResult.data || []).map((row) => [row.id, row]));

    const bookingIds = Array.from(new Set(payments.map((row) => row.booking_id)));
    const jyotishBookingIds = Array.from(
      new Set(jyotishPayments.map((row) => intents.get(row.intent_id)?.booking_id).filter(Boolean))
    ) as string[];
    const allBookingIds = Array.from(new Set([...bookingIds, ...jyotishBookingIds]));
    const customerIds = Array.from(
      new Set([
        ...payments.map((row) => row.customer_id),
        ...jyotishPayments.map((row) => row.customer_id).filter((id): id is string => Boolean(id)),
      ])
    );
    const astrologerIds = Array.from(
      new Set([
        ...payments.map((row) => row.astrologer_id),
        ...settlements.map((row) => row.consultant_id),
        ...jyotishPayments.map((row) => row.astrologer_id).filter((id): id is string => Boolean(id)),
      ])
    );

    const [bookingsResult, customersResult, astrologersResult] = await Promise.all([
      allBookingIds.length
        ? admin.from("customer_bookings").select("id, status, price, service_type").in("id", allBookingIds)
        : Promise.resolve({ data: [], error: null }),
      customerIds.length
        ? admin.from("profiles").select("id, full_name").in("id", customerIds)
        : Promise.resolve({ data: [], error: null }),
      astrologerIds.length
        ? admin.from("astrologer_profiles").select("id, display_name, user_id, upi_vpa").in("id", astrologerIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (bookingsResult.error) return { success: false, error: bookingsResult.error.message };
    if (customersResult.error) return { success: false, error: customersResult.error.message };
    if (astrologersResult.error) return { success: false, error: astrologersResult.error.message };

    const bookings = new Map((bookingsResult.data || []).map((row) => [row.id, row]));
    const customers = new Map((customersResult.data || []).map((row) => [row.id, row]));
    const astrologers = new Map((astrologersResult.data || []).map((row) => [row.id, row]));

    return {
      success: true,
      directPayments: payments.map((payment) => {
        const booking = bookings.get(payment.booking_id);
        const astrologer = astrologers.get(payment.astrologer_id);
        return {
          ...payment,
          booking_status: booking?.status,
          booking_price: Number(booking?.price ?? 0),
          service_type: booking?.service_type,
          customer_name: customers.get(payment.customer_id)?.full_name || "Customer",
          astrologer_name: astrologer?.display_name || "Astrologer",
          astrologer_user_id: astrologer?.user_id ?? null,
          astrologer_upi_vpa: astrologer?.upi_vpa ?? null,
        };
      }),
      settlements: settlements.map((settlement) => {
        const astrologer = astrologers.get(settlement.consultant_id);
        return {
          ...settlement,
          display_name: astrologer?.display_name || "Astrologer",
          consultant_user_id: astrologer?.user_id ?? null,
        };
      }),
      jyotishPayments: jyotishPayments.map((payment) => {
        const intent = intents.get(payment.intent_id);
        const booking = intent?.booking_id ? bookings.get(intent.booking_id) : null;
        const astrologer = payment.astrologer_id ? astrologers.get(payment.astrologer_id) : null;
        return {
          ...payment,
          entity_type: intent?.entity_type,
          intent_number: intent?.intent_number,
          booking_id: intent?.booking_id,
          plan_id: intent?.plan_id,
          booking_status: booking?.status,
          customer_name: payment.customer_id
            ? customers.get(payment.customer_id)?.full_name || "Customer"
            : undefined,
          astrologer_name: astrologer?.display_name || "Astrologer",
        };
      }),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to load payment verifications.",
    };
  }
}

export async function reviewJyotishPayPaymentAction(payload: {
  verificationId: string;
  decision: "approve" | "reject";
  reviewNotes: string;
  rejectionReason?: string;
}): Promise<{ success: boolean; status?: string; error?: string }> {
  try {
    const { user } = await requireSuperAdmin();
    if (!UUID_PATTERN.test(payload.verificationId)) {
      return { success: false, error: "Invalid payment verification record." };
    }

    const reviewNotes = payload.reviewNotes.trim();
    const rejectionReason = payload.rejectionReason?.trim() || "";
    if (payload.decision === "approve" && reviewNotes.length < 5) {
      return { success: false, error: "Record the external payment evidence you checked." };
    }
    if (payload.decision === "reject" && rejectionReason.length < 3) {
      return { success: false, error: "A rejection reason is required." };
    }

    const admin = await createAdminClient("main");
    const { data, error } = await admin.rpc("review_jyotish_pay_utr", {
      p_verification_id: payload.verificationId,
      p_admin_id: user.id,
      p_decision: payload.decision,
      p_review_notes: reviewNotes,
      p_rejection_reason: rejectionReason || null,
    });
    if (error) return { success: false, error: error.message };

    revalidateFinancialPaths();
    return { success: true, status: data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to review Karmic Ascension Pay payment.",
    };
  }
}

export async function reviewDirectConsultationPaymentAction(payload: {
  paymentId: string;
  decision: "approve" | "reject" | "refund";
  reviewNotes: string;
  rejectionReason?: string;
}): Promise<{ success: boolean; status?: string; error?: string }> {
  try {
    const { user, profile } = await requireSuperAdmin();
    const reviewNotes = payload.reviewNotes.trim();
    const rejectionReason = payload.rejectionReason?.trim() || "";

    if (!UUID_PATTERN.test(payload.paymentId)) {
      return { success: false, error: "Invalid payment record." };
    }
    if (payload.decision !== "reject" && reviewNotes.length < 5) {
      return { success: false, error: "Record the external payment evidence you checked." };
    }
    if (payload.decision === "reject" && rejectionReason.length < 3) {
      return { success: false, error: "A rejection reason is required." };
    }
    if (payload.decision === "refund" && rejectionReason.length < 3) {
      return { success: false, error: "A refund reason is required." };
    }

    const admin = await createAdminClient("main");
    const { data: payment, error: paymentError } = await admin
      .from("direct_consultation_payments")
      .select("id, customer_id, astrologer_id")
      .eq("id", payload.paymentId)
      .maybeSingle();

    if (paymentError || !payment) {
      return { success: false, error: paymentError?.message || "Payment submission not found." };
    }

    const { data: astrologer, error: astrologerError } = await admin
      .from("astrologer_profiles")
      .select("user_id")
      .eq("id", payment.astrologer_id)
      .maybeSingle();
    if (astrologerError) return { success: false, error: astrologerError.message };

    if (
      !canReviewDirectPayment({
        role: profile.role,
        adminUserId: user.id,
        customerId: payment.customer_id,
        astrologerUserId: astrologer?.user_id ?? null,
      })
    ) {
      return { success: false, error: "You cannot review your own payment." };
    }

    const { data, error } = await admin.rpc("review_direct_consultation_payment", {
      p_payment_id: payload.paymentId,
      p_admin_id: user.id,
      p_decision: payload.decision,
      p_review_notes: reviewNotes,
      p_rejection_reason: rejectionReason || null,
    });
    if (error) return { success: false, error: error.message };

    revalidateFinancialPaths();
    return { success: true, status: data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to review payment.",
    };
  }
}

export async function reviewCommissionSettlementAction(payload: {
  settlementId: string;
  decision: "approve" | "reject";
  reviewNotes: string;
  rejectionReason?: string;
}): Promise<{ success: boolean; status?: string; error?: string }> {
  try {
    const { user } = await requireSuperAdmin();
    const reviewNotes = payload.reviewNotes.trim();
    const rejectionReason = payload.rejectionReason?.trim() || "";

    if (!UUID_PATTERN.test(payload.settlementId)) {
      return { success: false, error: "Invalid settlement record." };
    }
    if (payload.decision === "approve" && reviewNotes.length < 5) {
      return { success: false, error: "Record the external payment evidence you checked." };
    }
    if (payload.decision === "reject" && rejectionReason.length < 3) {
      return { success: false, error: "A rejection reason is required." };
    }

    const admin = await createAdminClient("main");
    const { data: settlement, error: settlementError } = await admin
      .from("commission_settlements")
      .select("id, consultant_id")
      .eq("id", payload.settlementId)
      .maybeSingle();
    if (settlementError || !settlement) {
      return { success: false, error: settlementError?.message || "Settlement record not found." };
    }

    const { data: astrologer, error: astrologerError } = await admin
      .from("astrologer_profiles")
      .select("user_id")
      .eq("id", settlement.consultant_id)
      .maybeSingle();
    if (astrologerError) return { success: false, error: astrologerError.message };
    if (astrologer?.user_id === user.id) {
      return { success: false, error: "You cannot review your own settlement." };
    }

    const { data, error } = await admin.rpc("review_commission_settlement", {
      p_settlement_id: payload.settlementId,
      p_admin_id: user.id,
      p_decision: payload.decision,
      p_review_notes: reviewNotes,
      p_rejection_reason: rejectionReason || null,
    });
    if (error) return { success: false, error: error.message };

    revalidateFinancialPaths();
    return { success: true, status: data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to review settlement.",
    };
  }
}

function revalidateFinancialPaths() {
  revalidatePath("/super-admin/financials/commissions/verifications");
  revalidatePath("/super-admin/financials/commissions");
  revalidatePath("/astrologer/earnings");
  revalidatePath("/customer/bookings");
  revalidatePath("/customer/billing");
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
