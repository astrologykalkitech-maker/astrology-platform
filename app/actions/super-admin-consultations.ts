"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import type { AuthResult } from "@/lib/types/auth.types";
import type { ConsultationMode, BookingStatus } from "@/lib/types/database.types";
import { calculateConsultationFee, resolveConsultationRate } from "@/lib/consultation/billing-engine";
import { rupeesToPaise } from "@/lib/financial/pricing";

export interface SuperAdminConsultationRecord {
  id: string;
  booking_id: string;
  customer_id: string;
  customer_name: string;
  astrologer_id: string;
  astrologer_name: string;
  consultation_mode: ConsultationMode;
  service_type: string;
  scheduled_at: string;
  actual_start_at: string | null;
  actual_ended_at: string | null;
  connected_seconds: number;
  billable_minutes: number;
  rate_per_minute_inr: number;
  gross_amount_inr: number;
  gross_amount_paise: number;
  platform_commission_inr: number;
  astrologer_earnings_inr: number;
  status: BookingStatus;
  payment_status: string;
  payment_mode: string;
  termination_reason?: string | null;
}

export interface SuperAdminConsultationOverview {
  totalConsultations: number;
  chatConsultations: number;
  voiceConsultations: number;
  videoConsultations: number;
  completedConsultations: number;
  cancelledConsultations: number;
  activeConsultations: number;
  totalGrossRevenueInr: number;
  totalCommissionInr: number;
  totalAstrologerEarningsInr: number;
  totalBillableMinutes: number;
  records: SuperAdminConsultationRecord[];
}

export async function getSuperAdminConsultationsAction(filters?: {
  mode?: ConsultationMode | "all";
  status?: BookingStatus | "all";
  search?: string;
}): Promise<AuthResult<SuperAdminConsultationOverview>> {
  try {
    await requireSuperAdmin();
    const admin = await createAdminClient("main");

    // Fetch consultation bookings
    let query = admin
      .from("customer_bookings")
      .select(`
        id,
        customer_id,
        astrologer_id,
        service_type,
        consultation_mode,
        scheduled_at,
        duration_minutes,
        actual_started_at,
        actual_ended_at,
        billable_minutes,
        rate_per_minute,
        payment_collected_amount,
        price,
        status,
        payment_mode,
        payment_status,
        direct_payment_status,
        cancellation_reason,
        created_at,
        updated_at,
        customer:customer_id(full_name),
        astrologer:astrologer_id(display_name, chat_price_per_minute, voice_price_per_minute, video_price_per_minute)
      `)
      .order("scheduled_at", { ascending: false })
      .limit(200);

    if (filters?.mode && filters.mode !== "all") {
      query = query.eq("consultation_mode", filters.mode);
    }
    if (filters?.status && filters.status !== "all") {
      query = query.eq("status", filters.status);
    }

    const { data: bookings, error: bookingsErr } = await query;
    if (bookingsErr) {
      return { success: false, error: bookingsErr.message };
    }

    const allBookings = bookings || [];
    const bookingIds = allBookings.map((b) => b.id);

    // Fetch corresponding meeting sessions if any for duration tracking
    const { data: meetings } = bookingIds.length > 0
      ? await admin
          .from("consultation_meetings")
          .select("id, booking_id, started_at, ended_at, status")
          .in("booking_id", bookingIds)
      : { data: [] };

    const meetingMap = new Map((meetings || []).map((m) => [m.booking_id, m]));

    let totalChat = 0;
    let totalVoice = 0;
    let totalVideo = 0;
    let completedCount = 0;
    let cancelledCount = 0;
    let activeCount = 0;
    let totalGrossPaise = 0;
    let totalCommissionPaise = 0;
    let totalAstroPaise = 0;
    let totalBillableMins = 0;

    const records: SuperAdminConsultationRecord[] = allBookings.map((b) => {
      const mode = (b.consultation_mode || "Video") as ConsultationMode;
      const meeting = meetingMap.get(b.id);
      const customerData = Array.isArray(b.customer) ? b.customer[0] : b.customer;
      const astroData = Array.isArray(b.astrologer) ? b.astrologer[0] : b.astrologer;

      if (mode === "Chat") totalChat++;
      else if (mode === "Call") totalVoice++;
      else totalVideo++;

      if (b.status === "completed") completedCount++;
      else if (b.status === "cancelled") cancelledCount++;
      else if (meeting?.status === "active") activeCount++;

      // Connected duration calculation
      const effectiveStart = meeting?.started_at || b.actual_started_at || null;
      const effectiveEnd = meeting?.ended_at || b.actual_ended_at || null;

      let connectedSeconds = 0;
      if (effectiveStart && effectiveEnd) {
        connectedSeconds = Math.max(
          0,
          Math.floor((new Date(effectiveEnd).getTime() - new Date(effectiveStart).getTime()) / 1000)
        );
      } else if (b.status === "completed") {
        connectedSeconds = (Number(b.billable_minutes) || Number(b.duration_minutes) || 30) * 60;
      }

      const rateInfo = resolveConsultationRate({
        mode,
        chatRate: astroData?.chat_price_per_minute,
        voiceRate: astroData?.voice_price_per_minute,
        videoRate: astroData?.video_price_per_minute,
      });

      // Price resolution
      const configuredPrice = Number(b.price) || 0;
      const grossPaise = configuredPrice > 0 ? rupeesToPaise(configuredPrice) : rateInfo.ratePaise * (Number(b.duration_minutes) || 30);
      const feeCalc = calculateConsultationFee({
        durationSeconds: connectedSeconds || (Number(b.duration_minutes) || 30) * 60,
        ratePerMinutePaise: rateInfo.ratePaise,
        commissionPercent: 10,
      });

      const actualGrossPaise = b.status === "completed" ? grossPaise : 0;
      const actualCommissionPaise = b.status === "completed" ? Math.round(actualGrossPaise * 0.10) : 0;
      const actualAstroPaise = actualGrossPaise - actualCommissionPaise;

      totalGrossPaise += actualGrossPaise;
      totalCommissionPaise += actualCommissionPaise;
      totalAstroPaise += actualAstroPaise;
      totalBillableMins += feeCalc.billableMinutes;

      const paymentStatus = b.direct_payment_status === "paid" || b.payment_status === "paid" ? "paid" : (b.payment_status || "pending");

      return {
        id: `cons-${b.id.slice(0, 8)}`,
        booking_id: b.id,
        customer_id: b.customer_id,
        customer_name: customerData?.full_name || "Seeker",
        astrologer_id: b.astrologer_id,
        astrologer_name: astroData?.display_name || "Vedic Astrologer",
        consultation_mode: mode,
        service_type: b.service_type,
        scheduled_at: b.scheduled_at,
        actual_start_at: effectiveStart,
        actual_ended_at: effectiveEnd,
        connected_seconds: connectedSeconds,
        billable_minutes: Number(b.billable_minutes) || feeCalc.billableMinutes,
        rate_per_minute_inr: rateInfo.rateRupees,
        gross_amount_inr: Math.round(actualGrossPaise / 100),
        gross_amount_paise: actualGrossPaise,
        platform_commission_inr: Math.round(actualCommissionPaise / 100),
        astrologer_earnings_inr: Math.round(actualAstroPaise / 100),
        status: b.status as BookingStatus,
        payment_status: paymentStatus,
        payment_mode: b.payment_mode || "platform_gateway",
        termination_reason: b.cancellation_reason || (meeting?.status === "ended" ? "Normal Completion" : null),
      };
    });

    let filteredRecords = records;
    if (filters?.search && filters.search.trim()) {
      const q = filters.search.toLowerCase().trim();
      filteredRecords = records.filter(
        (r) =>
          r.customer_name.toLowerCase().includes(q) ||
          r.astrologer_name.toLowerCase().includes(q) ||
          r.booking_id.toLowerCase().includes(q) ||
          r.service_type.toLowerCase().includes(q)
      );
    }

    return {
      success: true,
      data: {
        totalConsultations: allBookings.length,
        chatConsultations: totalChat,
        voiceConsultations: totalVoice,
        videoConsultations: totalVideo,
        completedConsultations: completedCount,
        cancelledConsultations: cancelledCount,
        activeConsultations: activeCount,
        totalGrossRevenueInr: Math.round(totalGrossPaise / 100),
        totalCommissionInr: Math.round(totalCommissionPaise / 100),
        totalAstrologerEarningsInr: Math.round(totalAstroPaise / 100),
        totalBillableMinutes: totalBillableMins,
        records: filteredRecords,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load consultations overview.",
    };
  }
}
