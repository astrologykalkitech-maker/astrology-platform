"use server";

import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { RoomServiceClient } from "livekit-server-sdk";
import { getLiveKitConfig } from "@/lib/consultation/token";
import { revalidatePath } from "next/cache";

export async function getSuperAdminBroadcasts() {
  try {
    await requireSuperAdmin();
    const admin = await createAdminClient("main");

    const { data: broadcasts, error } = await admin
      .from("astrologer_live_broadcasts")
      .select("*, astrologer:astrologer_profiles(id, display_name, profile_photo_url)")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) return { success: false, error: error.message, data: [] };

    // Query LiveKit for active rooms to correlate authoritative SFU status
    let activeRoomNames = new Set<string>();
    try {
      const config = getLiveKitConfig();
      const roomService = new RoomServiceClient(config.httpUrl, config.apiKey, config.apiSecret);
      const rooms = await roomService.listRooms();
      rooms.forEach((r) => activeRoomNames.add(r.name));
    } catch {}

    const enriched = (broadcasts || []).map((b) => ({
      ...b,
      isLiveKitActive: activeRoomNames.has(b.room_name),
    }));

    return { success: true, data: enriched };
  } catch (err: any) {
    return { success: false, error: err.message, data: [] };
  }
}

export async function getSuperAdminModerationReports() {
  try {
    await requireSuperAdmin();
    const admin = await createAdminClient("main");

    const { data: reports, error } = await admin
      .from("broadcast_moderation_reports")
      .select("*, reporter:profiles!reported_by(id, full_name, email), broadcast:astrologer_live_broadcasts(id, title, room_name)")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return { success: false, error: error.message, data: [] };
    return { success: true, data: reports || [] };
  } catch (err: any) {
    return { success: false, error: err.message, data: [] };
  }
}

export async function resolveModerationReport(reportId: string, actionTaken: string) {
  try {
    const { user } = await requireSuperAdmin();
    const admin = await createAdminClient("main");

    await admin
      .from("broadcast_moderation_reports")
      .update({
        status: "actioned",
        action_taken: actionTaken,
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", reportId);

    revalidatePath("/super-admin/broadcasts");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function superAdminTerminateBroadcast(broadcastId: string, reason?: string) {
  try {
    const { user } = await requireSuperAdmin();
    const admin = await createAdminClient("main");

    const { data: broadcast } = await admin
      .from("astrologer_live_broadcasts")
      .select("id, room_name")
      .eq("id", broadcastId)
      .maybeSingle();

    if (!broadcast) return { success: false, error: "Broadcast not found" };

    const nowIso = new Date().toISOString();
    await admin
      .from("astrologer_live_broadcasts")
      .update({
        status: "ended",
        ended_at: nowIso,
        termination_reason: reason || "Administrative intervention",
        updated_at: nowIso,
      })
      .eq("id", broadcastId);

    // LiveKit SFU termination
    try {
      const config = getLiveKitConfig();
      const roomService = new RoomServiceClient(config.httpUrl, config.apiKey, config.apiSecret);
      await roomService.deleteRoom(broadcast.room_name);
    } catch {}

    // Audit log
    try {
      await admin.from("audit_logs").insert({
        actor_id: user.id,
        action: "broadcast.terminate",
        target_type: "broadcast",
        target_id: broadcastId,
        details: { reason: reason || "Super Admin administrative termination" },
      });
    } catch {}

    revalidatePath("/super-admin/broadcasts");
    revalidatePath("/customer/broadcasts");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to terminate broadcast." };
  }
}
