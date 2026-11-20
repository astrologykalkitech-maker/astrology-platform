import { NextRequest, NextResponse } from "next/server";
import { WebhookReceiver } from "livekit-server-sdk";
import { getLiveKitConfig } from "@/lib/consultation/token";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * LiveKit Webhook Handler:
 * Listens for room and participant lifecycle events from LiveKit SFU:
 * - room_finished: Host or server closed room -> sets status to 'ended', ended_at, viewer_count to 0
 * - participant_left: If broadcaster disconnected -> update presence / trigger grace period
 * - participant_joined: Broadcaster reconnects -> restore active status
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");

    if (!authHeader) {
      return NextResponse.json({ error: "Missing authorization header" }, { status: 401 });
    }

    const config = getLiveKitConfig();
    const receiver = new WebhookReceiver(config.apiKey, config.apiSecret);

    // Verify webhook signature cryptographically
    let event: any;
    try {
      event = await receiver.receive(rawBody, authHeader);
    } catch (err: any) {
      console.warn("[LiveKit Webhook] Signature verification failed:", err?.message);
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }

    const eventType = event.event;
    const room = event.room;
    const roomName = room?.name;

    if (!roomName) {
      return NextResponse.json({ received: true, ignored: "No room name" });
    }

    const admin = await createAdminClient("main");

    // 0. Deduplicate and log raw webhook event
    const eventId = event.id || `${eventType}_${roomName}_${Date.now()}`;
    await admin
      .from("consultation_raw_webhook_events")
      .insert({
        event_id: eventId,
        event_type: eventType,
        room_name: roomName,
        payload: event,
        status: "PROCESSED",
        processed_at: new Date().toISOString(),
      })
      .maybeSingle();

    // 1. Room Finished: Mark broadcast or voice call authoritatively ended
    if (eventType === "room_finished") {
      const nowIso = new Date().toISOString();

      // Case A: Astrologer Live Broadcast
      await admin
        .from("astrologer_live_broadcasts")
        .update({
          status: "ended",
          ended_at: nowIso,
          termination_reason: "Room finished on SFU",
          viewer_count: 0,
          updated_at: nowIso,
        })
        .eq("room_name", roomName)
        .in("status", ["live", "starting", "preparing", "paused"]);

      // Case B: Direct Voice Call Session (Authoritative Server-Side Termination)
      if (roomName.startsWith("karmicascension_voice_")) {
        const { data: voiceCall } = await admin
          .from("voice_calls")
          .select("id, conversation_id, status, started_at")
          .eq("room_name", roomName)
          .maybeSingle();

        if (voiceCall) {
          // Calculate authoritative duration from server-tracked started_at to now
          const startedAtMs = voiceCall.started_at ? Date.parse(voiceCall.started_at) : 0;
          const durationSeconds = startedAtMs > 0 ? Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)) : 0;

          // Transition call to ended if still active
          await admin
            .from("voice_calls")
            .update({
              status: "ended",
              ended_at: nowIso,
              duration_seconds: durationSeconds,
              end_reason: "SFU room_finished webhook",
              updated_at: nowIso,
            })
            .eq("id", voiceCall.id)
            .in("status", ["ringing", "accepted", "active"]);

          // Complete linked consultation booking ONLY if call was active and lasted at least 30s
          if (voiceCall.status === "active" && durationSeconds >= 30) {
            const { data: conv } = await admin
              .from("conversations")
              .select("booking_id")
              .eq("id", voiceCall.conversation_id)
              .maybeSingle();

            if (conv?.booking_id) {
              await admin
                .from("customer_bookings")
                .update({
                  status: "completed",
                  completion_source: "voice_ended",
                  updated_at: nowIso,
                })
                .eq("id", conv.booking_id)
                .in("status", ["pending", "confirmed"]);
            }
          }
        }
      }

      // Case C: One-on-One Consultation Billing Session Settlement
      if (roomName.startsWith("karmicascension_consultation_")) {
        const { data: session } = await admin
          .from("consultation_billing_sessions")
          .select("id, started_at, status")
          .eq("room_name", roomName)
          .maybeSingle();

        if (session && session.status === "ACTIVE") {
          const startedAtMs = session.started_at ? Date.parse(session.started_at) : Date.now();
          const billableSeconds = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));

          await admin.rpc("settle_consultation_billing_atomic", {
            p_session_id: session.id,
            p_billable_seconds: billableSeconds,
            p_termination_reason: "Room finished on SFU",
          });
        }
      }
    }

    // 2. Participant Left: Check if broadcaster left
    if (eventType === "participant_left") {
      const participant = event.participant;
      if (participant?.identity?.startsWith("astro_")) {
        // Broadcaster disconnected unexpectedly - mark paused if not already ended
        await admin
          .from("astrologer_live_broadcasts")
          .update({
            status: "paused",
            updated_at: new Date().toISOString(),
          })
          .eq("room_name", roomName)
          .eq("status", "live");
      }
    }

    // 3. Participant Joined: Check if broadcaster reconnected
    if (eventType === "participant_joined") {
      const participant = event.participant;
      if (participant?.identity?.startsWith("astro_")) {
        await admin
          .from("astrologer_live_broadcasts")
          .update({
            status: "live",
            last_host_heartbeat_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("room_name", roomName)
          .in("status", ["paused", "preparing", "starting"]);
      }
    }

    return NextResponse.json({ received: true, event: eventType });
  } catch (error: any) {
    console.error("[LiveKit Webhook Error]", error);
    return NextResponse.json({ error: error?.message || "Webhook processing error" }, { status: 500 });
  }
}

