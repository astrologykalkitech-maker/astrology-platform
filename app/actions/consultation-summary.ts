"use server";

import { requireAuth, requireAstrologer } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidUUID } from "@/lib/validations/lead";

export interface ConsultationSummaryData {
  id: string;
  booking_id: string;
  astrologer_id: string;
  customer_id: string;
  summary: string;
  key_discussion_points: string[];
  recommended_remedies: string[];
  follow_up_advice: string | null;
  is_approved_by_astrologer: boolean;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function getConsultationSummaryAction(
  bookingId: string
): Promise<{ success: boolean; data?: ConsultationSummaryData; error?: string }> {
  try {
    const { user } = await requireAuth();

    if (!isValidUUID(bookingId)) {
      return { success: false, error: "Invalid booking ID" };
    }

    const admin = await createAdminClient("main");

    const { data: booking } = await admin
      .from("customer_bookings")
      .select("id, customer_id, astrologer_id, astrologer:astrologer_id(user_id)")
      .eq("id", bookingId)
      .maybeSingle();

    if (!booking) {
      return { success: false, error: "Booking not found" };
    }

    const astroObj = Array.isArray(booking.astrologer) ? booking.astrologer[0] : booking.astrologer;
    const isCustomer = booking.customer_id === user.id;
    const isAstrologer = astroObj?.user_id === user.id;

    if (!isCustomer && !isAstrologer) {
      return { success: false, error: "Unauthorized access to this consultation summary" };
    }

    const { data: summary, error } = await admin
      .from("consultation_summaries")
      .select("*")
      .eq("booking_id", bookingId)
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    if (!summary) {
      return { success: true, data: undefined };
    }

    // Customer can only view approved summaries
    if (isCustomer && !summary.is_approved_by_astrologer) {
      return { success: true, data: undefined };
    }

    return { success: true, data: summary as ConsultationSummaryData };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load summary";
    return { success: false, error: msg };
  }
}

export async function generateConsultationSummaryAction(
  bookingId: string
): Promise<{ success: boolean; data?: ConsultationSummaryData; error?: string }> {
  try {
    const { user } = await requireAstrologer();

    if (!isValidUUID(bookingId)) {
      return { success: false, error: "Invalid booking ID" };
    }

    const admin = await createAdminClient("main");

    // Fetch booking
    const { data: booking, error: bErr } = await admin
      .from("customer_bookings")
      .select(`
        id,
        customer_id,
        astrologer_id,
        service_type,
        consultation_mode,
        scheduled_at,
        duration_minutes,
        customer:customer_id (full_name),
        astrologer:astrologer_id (id, user_id, display_name)
      `)
      .eq("id", bookingId)
      .maybeSingle();

    if (bErr || !booking) {
      return { success: false, error: "Booking not found" };
    }

    const astroObj = Array.isArray(booking.astrologer) ? booking.astrologer[0] : booking.astrologer;
    if (astroObj?.user_id !== user.id) {
      return { success: false, error: "Only the assigned astrologer can generate summaries" };
    }

    // Check if summary already exists
    const { data: existing } = await admin
      .from("consultation_summaries")
      .select("*")
      .eq("booking_id", bookingId)
      .maybeSingle();

    if (existing) {
      return { success: true, data: existing as ConsultationSummaryData };
    }

    // Fetch meeting chat messages for context
    const { data: meeting } = await admin
      .from("consultation_meetings")
      .select("id")
      .eq("booking_id", bookingId)
      .maybeSingle();

    let chatSummary = "";
    if (meeting) {
      const { data: chatMsgs } = await admin
        .from("meeting_chat_messages")
        .select("sender_name, message")
        .eq("meeting_id", meeting.id)
        .order("created_at", { ascending: true })
        .limit(20);

      if (chatMsgs && chatMsgs.length > 0) {
        chatSummary = chatMsgs.map((m) => `${m.sender_name}: ${m.message}`).join("\n");
      }
    }

    const customerObj = Array.isArray(booking.customer) ? booking.customer[0] : booking.customer;
    const customerName = customerObj?.full_name || "Seeker";

    const defaultSummaryText =
      `Vedic astrological consultation conducted with ${customerName} focusing on ` +
      `${booking.service_type || "Vedic Guidance"} via ${booking.consultation_mode}. ` +
      `Examined birth chart placements, planetary periods (Dashas), and current transits.` +
      (chatSummary ? ` Included in-call dialogue review.` : "");

    const keyPoints = [
      `Natal chart analysis for ${booking.service_type || "Consultation"}`,
      "Planetary Dasha balance and Gochar transit influences",
      "Vedic remedial guidance and karmic alignment recommendations",
    ];

    const remedies = [
      "Daily chanting of Gayatri Mantra or relevant Navagraha Stotram",
      "Charity (Daan) aligned with auspicious Vedic weekday",
      "Wearing recommended gemstone after proper purification and energization",
    ];

    const followUp = "Recommended follow-up after 45 days or during upcoming planetary transit.";

    // Insert new pending summary for astrologer review
    const { data: inserted, error: insErr } = await admin
      .from("consultation_summaries")
      .insert({
        booking_id: bookingId,
        astrologer_id: astroObj.id,
        customer_id: booking.customer_id,
        summary: defaultSummaryText,
        key_discussion_points: keyPoints,
        recommended_remedies: remedies,
        follow_up_advice: followUp,
        is_approved_by_astrologer: false,
      })
      .select()
      .single();

    if (insErr || !inserted) {
      return { success: false, error: insErr?.message || "Failed to create summary draft" };
    }

    return { success: true, data: inserted as ConsultationSummaryData };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to generate summary";
    return { success: false, error: msg };
  }
}

export async function approveConsultationSummaryAction(
  summaryId: string,
  updates?: {
    summary?: string;
    keyPoints?: string[];
    remedies?: string[];
    followUp?: string;
  }
): Promise<{ success: boolean; data?: ConsultationSummaryData; error?: string }> {
  try {
    const { user } = await requireAstrologer();

    if (!isValidUUID(summaryId)) {
      return { success: false, error: "Invalid summary ID" };
    }

    const admin = await createAdminClient("main");

    const { data: summary } = await admin
      .from("consultation_summaries")
      .select("id, astrologer_id, astrologer:astrologer_id(user_id)")
      .eq("id", summaryId)
      .maybeSingle();

    if (!summary) {
      return { success: false, error: "Summary not found" };
    }

    const astroObj = Array.isArray(summary.astrologer) ? summary.astrologer[0] : summary.astrologer;
    if (astroObj?.user_id !== user.id) {
      return { success: false, error: "Only the authoring astrologer can approve this summary" };
    }

    const nowIso = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      is_approved_by_astrologer: true,
      approved_at: nowIso,
      updated_at: nowIso,
    };

    if (updates?.summary?.trim()) {
      updatePayload.summary = updates.summary.trim();
    }
    if (updates?.keyPoints && Array.isArray(updates.keyPoints)) {
      updatePayload.key_discussion_points = updates.keyPoints.filter(Boolean);
    }
    if (updates?.remedies && Array.isArray(updates.remedies)) {
      updatePayload.recommended_remedies = updates.remedies.filter(Boolean);
    }
    if (updates?.followUp !== undefined) {
      updatePayload.follow_up_advice = updates.followUp?.trim() || null;
    }

    const { data: updated, error } = await admin
      .from("consultation_summaries")
      .update(updatePayload)
      .eq("id", summaryId)
      .select()
      .single();

    if (error || !updated) {
      return { success: false, error: error?.message || "Failed to approve summary" };
    }

    return { success: true, data: updated as ConsultationSummaryData };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to approve summary";
    return { success: false, error: msg };
  }
}

