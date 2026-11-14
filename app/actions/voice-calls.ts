"use server";

import crypto from "node:crypto";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { requireAuth } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLiveKitConfig } from "@/lib/consultation/token";
import type { VoiceCall, VoiceCallStatus } from "@/lib/types/database.types";
import {
  isLiveVoiceCallStatus,
  isVoiceCallRingExpired,
  getVoiceCallCommissionBookingId,
  LIVE_VOICE_CALL_STATUSES,
  VOICE_CALL_STALE_TIMEOUT_MS,
} from "@/lib/chat/voice-call";

const LIVE_CALL_STATUSES: VoiceCallStatus[] = LIVE_VOICE_CALL_STATUSES;

type VoiceCallResult = {
  success: boolean;
  call?: VoiceCall;
  error?: string;
};

export async function startVoiceCallAction(
  conversationId: string
): Promise<VoiceCallResult> {
  try {
    const { user, profile } = await requireAuth();
    if (!conversationId) return { success: false, error: "Select a conversation first." };

    const admin = await createAdminClient("main");
    const { data: conversation, error: conversationError } = await admin
      .from("conversations")
      .select("id, customer_id, astrologer_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (conversationError || !conversation) {
      return { success: false, error: "Conversation not found." };
    }

    const { data: astrologer, error: astrologerError } = await admin
      .from("astrologer_profiles")
      .select("user_id, display_name")
      .eq("id", conversation.astrologer_id)
      .maybeSingle();

    if (astrologerError || !astrologer) {
      return { success: false, error: "Astrologer profile not found." };
    }

    const isCustomer =
      profile.role === "customer" && conversation.customer_id === user.id;
    const isAstrologer =
      profile.role === "astrologer" && astrologer.user_id === user.id;

    if (!isCustomer && !isAstrologer) {
      return { success: false, error: "You are not a participant in this conversation." };
    }

    const callerRole = isCustomer ? "customer" : "astrologer";
    const calleeRole = isCustomer ? "astrologer" : "customer";
    const calleeId = isCustomer ? astrologer.user_id : conversation.customer_id;

    const { data: activeCalls, error: activeCallsError } = await admin
      .from("voice_calls")
      .select("*")
      .or(
        `caller_id.eq.${user.id},callee_id.eq.${user.id},caller_id.eq.${calleeId},callee_id.eq.${calleeId}`
      )
      .in("status", LIVE_CALL_STATUSES)
      .order("created_at", { ascending: false });

    if (activeCallsError) {
      return { success: false, error: "Unable to check current call availability." };
    }

    const now = Date.now();
    for (const activeCall of (activeCalls || []) as VoiceCall[]) {
      const expired = isVoiceCallRingExpired(activeCall, now);
      const abandonedActiveCall =
        activeCall.status !== "ringing" &&
        now - new Date(activeCall.updated_at).getTime() >= VOICE_CALL_STALE_TIMEOUT_MS;
      if (expired || abandonedActiveCall) {
        await admin
          .from("voice_calls")
          .update({
            status: expired ? "missed" : "ended",
            ended_at: new Date(now).toISOString(),
            end_reason: expired ? "No answer" : "Call connection expired",
            updated_at: new Date(now).toISOString(),
          })
          .eq("id", activeCall.id)
          .eq("status", activeCall.status);
      } else {
        return {
          success: false,
          error: "You or the other participant is already in a call.",
        };
      }
    }

    const callerName = isCustomer
      ? profile.full_name?.trim() || "Customer"
      : astrologer.display_name?.trim() || "Astrologer";
    const calleeName = isCustomer
      ? astrologer.display_name?.trim() || "Astrologer"
      : profile.full_name?.trim() || "Customer";

    const { data: call, error: insertError } = await admin
      .from("voice_calls")
      .insert({
        conversation_id: conversation.id,
        caller_id: user.id,
        callee_id: calleeId,
        caller_role: callerRole,
        callee_role: calleeRole,
        caller_name: callerName,
        callee_name: calleeName,
        room_name: `jyotishsetu_voice_${crypto.randomBytes(16).toString("hex")}`,
        status: "ringing",
      })
      .select("*")
      .single();

    if (insertError || !call) {
      console.error("[startVoiceCallAction] Could not create call:", insertError);
      return {
        success: false,
        error: "Unable to start the call. The other participant may already be in a call.",
      };
    }

    return { success: true, call: call as VoiceCall };
  } catch (error) {
    console.error("[startVoiceCallAction] Failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to start the call.",
    };
  }
}

export async function getActiveVoiceCallAction(): Promise<VoiceCallResult> {
  try {
    const { user } = await requireAuth();
    const admin = await createAdminClient("main");
    const { data: calls, error } = await admin
      .from("voice_calls")
      .select("*")
      .or(`caller_id.eq.${user.id},callee_id.eq.${user.id}`)
      .in("status", LIVE_CALL_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) return { success: false, error: "Unable to load current call." };
    const call = (calls?.[0] as VoiceCall | undefined) ?? undefined;
    if (!call) return { success: true };

    if (isVoiceCallRingExpired(call as VoiceCall)) {
      const { data: expiredCall } = await admin
        .from("voice_calls")
        .update({
          status: "missed",
          ended_at: new Date().toISOString(),
          end_reason: "No answer",
          updated_at: new Date().toISOString(),
        })
        .eq("id", call.id)
        .eq("status", "ringing")
        .select("*")
        .maybeSingle();
      return { success: true, call: (expiredCall as VoiceCall | null) ?? call };
    }

    return { success: true, call };
  } catch (error) {
    console.error("[getActiveVoiceCallAction] Failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to load current call.",
    };
  }
}

export async function acceptVoiceCallAction(callId: string): Promise<VoiceCallResult> {
  try {
    const { user } = await requireAuth();
    const admin = await createAdminClient("main");
    const { data: call } = await admin
      .from("voice_calls")
      .select("*")
      .eq("id", callId)
      .maybeSingle();

    if (!call || call.callee_id !== user.id || call.status !== "ringing") {
      return { success: false, error: "This call is no longer available." };
    }
    if (isVoiceCallRingExpired(call as VoiceCall)) {
      await admin
        .from("voice_calls")
        .update({
          status: "missed",
          ended_at: new Date().toISOString(),
          end_reason: "No answer",
          updated_at: new Date().toISOString(),
        })
        .eq("id", call.id)
        .eq("status", "ringing");
      return { success: false, error: "This call has expired." };
    }

    const { data: acceptedCall, error } = await admin
      .from("voice_calls")
      .update({ status: "accepted", updated_at: new Date().toISOString() })
      .eq("id", call.id)
      .eq("status", "ringing")
      .select("*")
      .maybeSingle();

    if (error || !acceptedCall) {
      return { success: false, error: "This call has already been answered or ended." };
    }
    return { success: true, call: acceptedCall as VoiceCall };
  } catch (error) {
    console.error("[acceptVoiceCallAction] Failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to answer the call.",
    };
  }
}

export async function updateVoiceCallStatusAction(
  callId: string,
  status: "active" | "declined" | "cancelled" | "ended" | "failed",
  endReason?: string
): Promise<VoiceCallResult> {
  try {
    const { user } = await requireAuth();
    const admin = await createAdminClient("main");
    const { data: call } = await admin
      .from("voice_calls")
      .select("*")
      .eq("id", callId)
      .maybeSingle();

    if (!call || (call.caller_id !== user.id && call.callee_id !== user.id)) {
      return { success: false, error: "Call not found or access denied." };
    }

    const currentCall = call as VoiceCall;
    const reconcileVerifiedBookingCommission = async (
      durationSeconds = currentCall.duration_seconds
    ): Promise<string | null> => {
      const { data: conversation, error: conversationError } = await admin
        .from("conversations")
        .select("booking_id")
        .eq("id", currentCall.conversation_id)
        .maybeSingle();

      if (conversationError) return conversationError.message;

      const bookingId = getVoiceCallCommissionBookingId(
        conversation?.booking_id,
        durationSeconds
      );
      if (!bookingId) return null;

      const { error: accrualError } = await admin.rpc("accrue_verified_booking_commissions", {
        p_booking_id: bookingId,
      });
      return accrualError?.message || null;
    };

    if (!isLiveVoiceCallStatus(currentCall.status)) {
      if (currentCall.status === "ended") {
        const reconciliationError = await reconcileVerifiedBookingCommission();
        if (reconciliationError) {
          return {
            success: false,
            error: `Call ended, but verified commission reconciliation failed: ${reconciliationError}`,
          };
        }
      }
      return { success: true, call: currentCall };
    }

    if (status === "active" && currentCall.status !== "accepted" && currentCall.status !== "active") {
      return { success: false, error: "Answer the call before joining." };
    }
    if (status === "declined" && (currentCall.callee_id !== user.id || currentCall.status !== "ringing")) {
      return { success: false, error: "Only the recipient can decline a ringing call." };
    }
    if (status === "cancelled" && (currentCall.caller_id !== user.id || currentCall.status !== "ringing")) {
      return { success: false, error: "Only the caller can cancel a ringing call." };
    }

    const now = new Date().toISOString();
    const updates: {
      status: VoiceCallStatus;
      updated_at: string;
      started_at?: string;
      ended_at?: string;
      duration_seconds?: number;
      ended_by?: string;
      end_reason?: string;
    } = { status, updated_at: now };

    if (status === "active") updates.started_at = currentCall.started_at || now;
    if (["declined", "cancelled", "ended", "failed"].includes(status)) {
      updates.ended_at = now;
      updates.ended_by = user.id;
      updates.end_reason = endReason?.trim().slice(0, 200) || status;
      updates.duration_seconds = currentCall.started_at
        ? Math.max(
            0,
            Math.floor((Date.parse(now) - Date.parse(currentCall.started_at)) / 1000)
          )
        : 0;
    }

    const { data: updatedCall, error } = await admin
      .from("voice_calls")
      .update(updates)
      .eq("id", call.id)
      .eq("status", currentCall.status)
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("[updateVoiceCallStatusAction] Could not update call:", error);
      return { success: false, error: "Unable to update call status." };
    }
    if (!updatedCall) return { success: true, call: currentCall };

    if (["declined", "cancelled", "ended", "failed"].includes(status)) {
      try {
        const config = getLiveKitConfig();
        const roomService = new RoomServiceClient(
          config.httpUrl,
          config.apiKey,
          config.apiSecret
        );
        await roomService.deleteRoom(currentCall.room_name);
      } catch (roomError) {
        console.warn("[updateVoiceCallStatusAction] LiveKit room cleanup notice:", roomError);
      }

      if (status === "ended" && updates.duration_seconds && updates.duration_seconds > 0) {
        const reconciliationError = await reconcileVerifiedBookingCommission(updates.duration_seconds);
        if (reconciliationError) {
          return {
            success: false,
            error: `Call ended, but verified commission reconciliation failed: ${reconciliationError}`,
          };
        }
      }
    }

    return { success: true, call: updatedCall as VoiceCall };
  } catch (error) {
    console.error("[updateVoiceCallStatusAction] Failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to update call status.",
    };
  }
}

export async function getVoiceCallTokenAction(callId: string): Promise<{
  success: boolean;
  token?: string;
  serverUrl?: string;
  error?: string;
}> {
  try {
    const { user } = await requireAuth();
    const admin = await createAdminClient("main");
    const { data: call } = await admin
      .from("voice_calls")
      .select("*")
      .eq("id", callId)
      .maybeSingle();

    if (
      !call ||
      (call.caller_id !== user.id && call.callee_id !== user.id) ||
      !["accepted", "active"].includes(call.status)
    ) {
      return { success: false, error: "This call is not available to join." };
    }

    const config = getLiveKitConfig();
    const isCaller = call.caller_id === user.id;
    const token = new AccessToken(config.apiKey, config.apiSecret, {
      identity: user.id,
      name: isCaller ? call.caller_name : call.callee_name,
      ttl: "1800s",
      metadata: JSON.stringify({
        role: isCaller ? call.caller_role : call.callee_role,
        callId: call.id,
        platform: "JyotishSetu Voice Call",
      }),
    });
    token.addGrant({
      room: call.room_name,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
    });

    return { success: true, token: await token.toJwt(), serverUrl: config.wsUrl };
  } catch (error) {
    console.error("[getVoiceCallTokenAction] Failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to connect the call.",
    };
  }
}

export async function heartbeatVoiceCallAction(callId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const { user } = await requireAuth();
    const admin = await createAdminClient("main");
    const { data: call, error } = await admin
      .from("voice_calls")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", callId)
      .or(`caller_id.eq.${user.id},callee_id.eq.${user.id}`)
      .in("status", ["accepted", "active"])
      .select("id")
      .maybeSingle();

    if (error || !call) {
      return { success: false, error: "Call is no longer active." };
    }
    return { success: true };
  } catch (error) {
    console.error("[heartbeatVoiceCallAction] Failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to keep the call connected.",
    };
  }
}
