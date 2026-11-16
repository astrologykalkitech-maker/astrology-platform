"use server";

import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { rupeesToPaise } from "@/lib/financial/pricing";
import { normalizeDirectPaymentUtr } from "@/lib/financial/direct-payment-rules";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function submitDirectConsultationPaymentAction(payload: {
  bookingId: string;
  utr: string;
  amountRupees: number;
  paymentDate: string;
}): Promise<{ success: boolean; paymentId?: string; error?: string }> {
  try {
    const { user } = await requireCustomer();
    const utr = normalizeDirectPaymentUtr(payload.utr);
    if (!UUID_PATTERN.test(payload.bookingId) || !utr) {
      return { success: false, error: "Enter a valid booking and UTR/reference number." };
    }
    if (
      typeof payload.amountRupees !== "number" ||
      !Number.isFinite(payload.amountRupees) ||
      payload.amountRupees <= 0
    ) {
      return { success: false, error: "Enter a valid payment amount." };
    }
    if (!PAYMENT_DATE_PATTERN.test(payload.paymentDate)) {
      return { success: false, error: "Enter a valid payment date." };
    }

    const paymentDate = new Date(`${payload.paymentDate}T00:00:00.000Z`);
    const indiaToday = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    if (
      Number.isNaN(paymentDate.getTime()) ||
      paymentDate.toISOString().slice(0, 10) !== payload.paymentDate ||
      payload.paymentDate > indiaToday
    ) {
      return { success: false, error: "Payment date cannot be invalid or in the future." };
    }

    const admin = await createAdminClient("main");
    const { data: paymentId, error } = await admin.rpc("submit_direct_consultation_payment", {
      p_booking_id: payload.bookingId,
      p_customer_id: user.id,
      p_utr: utr,
      p_amount_paise: rupeesToPaise(payload.amountRupees),
      p_payment_date: payload.paymentDate,
    });

    if (error || !paymentId) {
      const message = error?.message || "Payment submission failed.";
      if (error?.code === "23505" || /duplicate key|unique constraint/i.test(message)) {
        return {
          success: false,
          error: "This UTR or booking already has a pending or verified payment submission.",
        };
      }
      return { success: false, error: message };
    }

    revalidatePath("/customer/bookings");
    revalidatePath("/customer/billing");
    revalidatePath("/super-admin/financials/commissions/verifications");

    return { success: true, paymentId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to submit payment details.",
    };
  }
}
