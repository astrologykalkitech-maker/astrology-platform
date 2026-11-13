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

    // 1. Room Finished: Mark broadcast authoritatively ended
    if (eventType === "room_finished") {
      const nowIso = new Date().toISOString();
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

