"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { RoomServiceClient, DataPacket_Kind } from "livekit-server-sdk";
import { requireAuth } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateLiveKitConsultationToken,
  type ConsultationTokenResult,
} from "@/lib/consultation/token";
import { isMeetingWindowActive } from "@/lib/consultation/meeting-window";
import { logConsultationDiagnostic } from "@/lib/consultation/diagnostics";
import type {
  ConsultationMeeting,
  MeetingChatMessage,
  MeetingStatus,
} from "@/lib/types/database.types";

export interface JoinMeetingResponse {
  success: boolean;
  meeting?: ConsultationMeeting;
  tokenResult?: ConsultationTokenResult;
  customerName?: string;
  astrologerName?: string;
  serviceType?: string;
  scheduledAt?: string;
  durationMinutes?: number;
  consultationMode?: string;
  isHost?: boolean;
  error?: string;
}

/**
 * Idempotently creates or retrieves the logical consultation meeting associated with a booking,
 * verifies strict caller authorization, and issues an authorized short-lived LiveKit WebRTC access token.
 */
export async function getOrCreateConsultationMeeting(
  bookingId: string
): Promise<JoinMeetingResponse> {
  try {
    const { user, profile } = await requireAuth();
    if (!bookingId || typeof bookingId !== "string") {
      return { success: false, error: "Valid bookingId is required." };
    }

    const admin = await createAdminClient("main");

    // 1. Fetch booking with customer and astrologer details
    const { data: booking, error: bookingErr } = await admin
      .from("customer_bookings")
      .select(`
        id,
        customer_id,
        astrologer_id,
        service_type,
        consultation_mode,
        scheduled_at,
        duration_minutes,
        status,
        customer:customer_id (
          full_name,
          avatar_url
        ),
        astrologer:astrologer_id (
          id,
          user_id,
          display_name,
          profile_photo_url
        )
      `)
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingErr || !booking) {
      return { success: false, error: "Consultation booking not found." };
    }

    // 2. Authorize caller: must be the booking's customer OR assigned astrologer
    const customerObj = Array.isArray(booking.customer) ? booking.customer[0] : booking.customer;
    const astroObj = Array.isArray(booking.astrologer) ? booking.astrologer[0] : booking.astrologer;

    const isCustomer = booking.customer_id === user.id;
    const isAstrologer = astroObj?.user_id === user.id;

    if (!isCustomer && !isAstrologer && profile.role !== "super_admin") {
      return {
        success: false,
        error: "Unauthorized: You are not an assigned participant in this consultation.",
      };
    }

    // 3. Status verification
    if (booking.status === "cancelled") {
      return { success: false, error: "This consultation appointment has been cancelled." };
    }
    if (booking.status === "completed") {
      return { success: false, error: "This consultation appointment has already been completed." };
    }

    // 4. Schedule window verification (15 minutes before until duration + 60 min)
    const windowCheck = isMeetingWindowActive(booking.scheduled_at, booking.duration_minutes);
    if (!windowCheck.allowed) {
      return { success: false, error: windowCheck.reason };
    }

    // 5. Retrieve or create meeting record (concurrency-safe / idempotent)
    let { data: meeting } = await admin
      .from("consultation_meetings")
      .select("*")
      .eq("booking_id", booking.id)
      .maybeSingle();

    if (meeting && meeting.status === "ended") {
      return { success: false, error: "This consultation session has ended." };
    }

    if (!meeting) {
      const opaqueRoomName = `jyotishsetu_${crypto.randomBytes(12).toString("hex")}`;
      const { data: newMeeting, error: createErr } = await admin
        .from("consultation_meetings")
        .insert({
          booking_id: booking.id,
          room_name: opaqueRoomName,
          host_astrologer_id: booking.astrologer_id,
          customer_id: booking.customer_id,
          status: "scheduled",
        })
        .select("*")
        .single();

      if (createErr) {
        // Handle race condition: check if another request inserted it simultaneously
        const { data: raceMeeting } = await admin
          .from("consultation_meetings")
          .select("*")
          .eq("booking_id", booking.id)
          .single();

        if (raceMeeting) {
          meeting = raceMeeting;
        } else {
          return { success: false, error: "Failed to initialize consultation meeting room." };
        }
      } else {
        meeting = newMeeting;
      }
    }

    // 6. Generate LiveKit token
    const isHost = isAstrologer || profile.role === "super_admin";
    const participantName = isAstrologer
      ? astroObj?.display_name || "Vedic Astrologer"
      : customerObj?.full_name || "Seeker";

    const avatarUrl = isAstrologer
      ? astroObj?.profile_photo_url || null
      : customerObj?.avatar_url || null;

    const tokenResult = await generateLiveKitConsultationToken({
      roomName: meeting.room_name,
      participantIdentity: user.id,
      participantName,
      role: isHost ? "host" : "customer",
      avatarUrl,
      expiresInSeconds: (booking.duration_minutes || 30) * 60 + 3600,
    });

    logConsultationDiagnostic("token_generated", {
      bookingId: booking.id,
      role: isHost ? "astrologer" : "customer",
      roomName: meeting.room_name,
    });

    return {
      success: true,
      meeting: meeting as ConsultationMeeting,
      tokenResult,
      customerName: customerObj?.full_name || "Seeker",
      astrologerName: astroObj?.display_name || "Vedic Astrologer",
      serviceType: booking.service_type,
      scheduledAt: booking.scheduled_at,
      durationMinutes: booking.duration_minutes,
      consultationMode: booking.consultation_mode,
      isHost,
    };
  } catch (err) {
    console.error("[consultation-meeting] Error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unable to load consultation room.",
    };
  }
}

/**
 * Server-authoritative consultation termination and instant booking completion.
 * Atomically updates consultation_meetings to 'ended' and customer_bookings to 'completed',
 * broadcasts a real-time termination signal via LiveKit Server SDK, force-closes the LiveKit room,
 * creates a completion notification for the customer, and revalidates cached views.
 */
export async function endConsultationMeetingAction(
  meetingId: string
): Promise<{ success: boolean; bookingId?: string; error?: string }> {
  try {
    const { user, profile } = await requireAuth();
    const admin = await createAdminClient("main");

    // 1. Fetch meeting record
    const { data: meeting, error: meetingErr } = await admin
      .from("consultation_meetings")
      .select("id, host_astrologer_id, customer_id, status, booking_id, started_at, room_name")
      .eq("id", meetingId)
      .maybeSingle();

    if (meetingErr || !meeting) {
      return { success: false, error: "Consultation meeting record not found." };
    }

    // 2. Authorize caller: must be the assigned host astrologer or super admin
    const { data: astroProfile } = await admin
      .from("astrologer_profiles")
      .select("id, display_name")
      .eq("user_id", user.id)
      .maybeSingle();

    const isHost =
      (astroProfile && meeting.host_astrologer_id === astroProfile.id) ||
      profile.role === "super_admin";

    if (!isHost) {
      return {
        success: false,
        error: "Unauthorized: Only the host astrologer can conclude the consultation for all participants.",
      };
    }

    const nowIso = new Date().toISOString();

    // 3. Update consultation_meetings status to 'ended'
    const { error: updateMeetingErr } = await admin
      .from("consultation_meetings")
      .update({
        status: "ended",
        ended_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", meetingId);

    if (updateMeetingErr) {
      console.error("[endConsultationMeetingAction] Meeting status update failed:", updateMeetingErr);
      throw updateMeetingErr;
    }

    // 4. Atomically update customer_bookings status to 'completed'
    if (meeting.booking_id) {
      const { error: updateBookingErr } = await admin
        .from("customer_bookings")
        .update({
          status: "completed",
          updated_at: nowIso,
        })
        .eq("id", meeting.booking_id);

      if (updateBookingErr) {
        console.error("[endConsultationMeetingAction] Booking status update failed:", updateBookingErr);
      }

      // 5. Insert customer notification
      try {
        const astrologerName = astroProfile?.display_name || "Your Vedic Astrologer";
        await admin.from("customer_notifications").insert({
          customer_id: meeting.customer_id,
          title: "Consultation Completed",
          message: `Your consultation session with ${astrologerName} has successfully concluded.`,
          link_url: "/customer/bookings",
          event_type: "booking_completed",
          is_read: false,
          created_at: nowIso,
        });
      } catch (notifErr) {
        console.warn("[endConsultationMeetingAction] Customer notification notice:", notifErr);
      }
    }

    // 6. LiveKit Cloud: Send termination packet and delete/close the room
    if (meeting.room_name) {
      try {
        const livekitHost =
          process.env.LIVEKIT_URL?.trim() ||
          process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim() ||
          "https://astrosetu-3dx4gffs.livekit.cloud";
        const apiKey = process.env.LIVEKIT_API_KEY?.trim() || "API5iWTsYP3tkbe";
        const apiSecret =
          process.env.LIVEKIT_API_SECRET?.trim() ||
          "EGgq9JNeTargvrjxfiOqcGXVbKPYC2lHgddwZNc7Rph";

        const roomService = new RoomServiceClient(livekitHost, apiKey, apiSecret);

        // Broadcast consultation_ended reliable data packet to all connected participants
        const endPayload = new TextEncoder().encode(
          JSON.stringify({
            type: "consultation_ended",
            meetingId: meeting.id,
            bookingId: meeting.booking_id,
            endedAt: nowIso,
          })
        );

        await roomService
          .sendData(meeting.room_name, endPayload, DataPacket_Kind.RELIABLE)
          .catch(() => {});

        // Delete the room so all remaining client connections are forcefully torn down
        await roomService.deleteRoom(meeting.room_name).catch((delErr) => {
          console.warn(
            "[endConsultationMeetingAction] LiveKit deleteRoom notice:",
            delErr?.message || delErr
          );
        });
      } catch (lkErr) {
        console.warn("[endConsultationMeetingAction] LiveKit room service notice:", lkErr);
      }
    }

    // 7. Invalidate RSC caches
    try {
      revalidatePath("/customer/bookings");
      revalidatePath("/astrologer/bookings");
      revalidatePath("/astrologer/dashboard");
      if (meeting.booking_id) {
        revalidatePath(`/consultation/${meeting.booking_id}`);
        revalidatePath(`/customer/consultation/${meeting.booking_id}`);
      }
    } catch (revalErr) {
      console.warn("[endConsultationMeetingAction] Revalidation notice:", revalErr);
    }

    logConsultationDiagnostic("meeting_ended_for_all", {
      bookingId: meeting.booking_id,
      role: "astrologer",
      roomName: meeting.room_name,
      connectionState: "ended",
    });

    return { success: true, bookingId: meeting.booking_id };
  } catch (err) {
    console.error("[endConsultationMeetingAction] Error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to end consultation session.",
    };
  }
}

/**
 * Updates meeting lifecycle state (e.g. 'waiting', 'active', 'ended').
 * If 'ended', seamlessly delegates to endConsultationMeetingAction to ensure atomic booking completion and room deletion.
 */
export async function updateMeetingStatusAction(
  meetingId: string,
  newStatus: MeetingStatus
): Promise<{ success: boolean; error?: string }> {
  try {
    if (newStatus === "ended") {
      const res = await endConsultationMeetingAction(meetingId);
      return { success: res.success, error: res.error };
    }

    const { user, profile } = await requireAuth();
    const admin = await createAdminClient("main");

    const { data: meeting } = await admin
      .from("consultation_meetings")
      .select("id, host_astrologer_id, customer_id, status, booking_id, started_at")
      .eq("id", meetingId)
      .maybeSingle();

    if (!meeting) {
      return { success: false, error: "Meeting not found." };
    }

    const updates: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (newStatus === "active" && !meeting.started_at) {
      updates.started_at = new Date().toISOString();
    }

    const { error } = await admin
      .from("consultation_meetings")
      .update(updates)
      .eq("id", meetingId);

    if (error) throw error;

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update meeting status.",
    };
  }
}

/**
 * Sends a message in the active meeting chat with server-side validation and persistence.
 */
export async function sendMeetingChatMessageAction(
  meetingId: string,
  messageText: string
): Promise<{ success: boolean; message?: MeetingChatMessage; error?: string }> {
  try {
    const { user, profile } = await requireAuth();
    const cleanText = messageText.trim();

    if (!cleanText || cleanText.length === 0) {
      return { success: false, error: "Message cannot be empty." };
    }

    if (cleanText.length > 1000) {
      return { success: false, error: "Message must not exceed 1000 characters." };
    }

    const admin = await createAdminClient("main");

    // Verify caller belongs to meeting
    const { data: meeting } = await admin
      .from("consultation_meetings")
      .select("id, host_astrologer_id, customer_id, status")
      .eq("id", meetingId)
      .maybeSingle();

    if (!meeting) {
      return { success: false, error: "Meeting not found." };
    }

    const { data: astroProfile } = await admin
      .from("astrologer_profiles")
      .select("id, display_name")
      .eq("user_id", user.id)
      .maybeSingle();

    const isHost = astroProfile && meeting.host_astrologer_id === astroProfile.id;
    const isCustomer = meeting.customer_id === user.id;

    if (!isHost && !isCustomer && profile.role !== "super_admin") {
      return { success: false, error: "Unauthorized: You are not a participant in this meeting." };
    }

    const senderRole = isHost ? "host" : "customer";
    const senderName = isHost
      ? astroProfile?.display_name || "Vedic Astrologer"
      : profile.full_name || "Seeker";

    const { data: savedMsg, error: insertErr } = await admin
      .from("meeting_chat_messages")
      .insert({
        meeting_id: meetingId,
        sender_id: user.id,
        sender_name: senderName,
        sender_role: senderRole,
        message: cleanText,
      })
      .select("*")
      .single();

    if (insertErr) throw insertErr;

    return {
      success: true,
      message: savedMsg as MeetingChatMessage,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to send message.",
    };
  }
}

/**
 * Loads the complete chat message history for an authorized consultation meeting.
 */
export async function getMeetingChatHistoryAction(
  meetingId: string
): Promise<{ success: boolean; messages?: MeetingChatMessage[]; error?: string }> {
  try {
    const { user, profile } = await requireAuth();
    const admin = await createAdminClient("main");

    const { data: meeting } = await admin
      .from("consultation_meetings")
      .select("id, host_astrologer_id, customer_id")
      .eq("id", meetingId)
      .maybeSingle();

    if (!meeting) {
      return { success: false, error: "Meeting not found." };
    }

    const { data: astroProfile } = await admin
      .from("astrologer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const isHost = astroProfile && meeting.host_astrologer_id === astroProfile.id;
    const isCustomer = meeting.customer_id === user.id;

    if (!isHost && !isCustomer && profile.role !== "super_admin") {
      return { success: false, error: "Unauthorized access to meeting messages." };
    }

    const { data: messages, error: queryErr } = await admin
      .from("meeting_chat_messages")
      .select("*")
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: true })
      .limit(200);

    if (queryErr) throw queryErr;

    return {
      success: true,
      messages: (messages as MeetingChatMessage[]) || [],
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load chat history.",
    };
  }
}
