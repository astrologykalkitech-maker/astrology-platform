"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { getLiveKitConfig } from "@/lib/consultation/token";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { getAuthSession, getCurrentUser, requireAstrologer } from "@/lib/auth/session";

export interface BroadcastTokenResult {
  token: string;
  serverUrl: string;
  roomName: string;
  participantIdentity: string;
  participantName: string;
  isHost: boolean;
}

export interface BroadcastComment {
  id: string;
  broadcast_id: string;
  user_id: string;
  sender_name: string;
  sender_role: "viewer" | "astrologer" | "moderator" | "super_admin";
  comment: string;
  is_pinned: boolean;
  created_at: string;
}

/**
 * Creates an authorized LiveKit Broadcast record and generates a short-lived broadcaster token.
 * Only authenticated, verified astrologers can create and host a broadcast.
 */
export async function createLiveBroadcast(params: {
  title: string;
  description?: string;
  topic?: string;
}): Promise<{
  success: boolean;
  broadcast?: any;
  tokenResult?: BroadcastTokenResult;
  error?: string;
}> {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return { success: false, error: "Authentication required." };
    }

    const admin = await createAdminClient("main");

    // Fetch astrologer profile
    const { data: profile } = await admin
      .from("astrologer_profiles")
      .select("id, display_name, approval_status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) {
      return { success: false, error: "Astrologer profile not found." };
    }

    if (profile.approval_status !== "approved") {
      return { success: false, error: "Only approved astrologers can host live broadcasts." };
    }

    const roomName = `broadcast_${profile.id}_${Date.now()}`;

    // Insert broadcast record with initial state 'preparing'
    const { data: broadcast, error: insertErr } = await admin
      .from("astrologer_live_broadcasts")
      .insert({
        astrologer_id: profile.id,
        room_name: roomName,
        title: params.title.trim(),
        description: params.description?.trim() || null,
        topic: params.topic?.trim() || "Vedic Astrology",
        status: "preparing",
        started_at: new Date().toISOString(),
        viewer_count: 0,
        peak_viewer_count: 0,
        total_unique_viewers: 0,
        comments_enabled: true,
        last_host_heartbeat_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (insertErr || !broadcast) {
      return { success: false, error: insertErr?.message || "Failed to create broadcast session." };
    }

    // Generate short-lived LiveKit token with Host Publish Grants
    const config = getLiveKitConfig();
    const participantIdentity = `astro_${profile.id}`;
    const participantName = profile.display_name || "Astrologer";

    const at = new AccessToken(config.apiKey, config.apiSecret, {
      identity: participantIdentity,
      name: participantName,
      ttl: "14400s", // 4 hours max broadcast duration
      metadata: JSON.stringify({
        role: "host",
        astrologerId: profile.id,
        broadcastId: broadcast.id,
      }),
    });

    at.addGrant({
      room: roomName,
      roomJoin: true,
      roomAdmin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    revalidatePath("/astrologer/broadcast");
    revalidatePath("/customer/broadcasts");

    return {
      success: true,
      broadcast,
      tokenResult: {
        token,
        serverUrl: config.wsUrl,
        roomName,
        participantIdentity,
        participantName,
        isHost: true,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create live broadcast." };
  }
}

/**
 * Confirms that the host has successfully connected to LiveKit and published media,
 * transitioning the broadcast status from 'preparing' to 'live'.
 * Dispatches live notification to customer followers.
 */
export async function confirmBroadcastLive(broadcastId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();

    if (!user) return { success: false, error: "Authentication required." };

    const admin = await createAdminClient("main");

    const { data: profile } = await admin
      .from("astrologer_profiles")
      .select("id, display_name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) return { success: false, error: "Astrologer profile not found." };

    const { data: broadcast } = await admin
      .from("astrologer_live_broadcasts")
      .select("id, astrologer_id, title, status")
      .eq("id", broadcastId)
      .maybeSingle();

    if (!broadcast) return { success: false, error: "Broadcast not found." };
    if (broadcast.astrologer_id !== profile.id) {
      return { success: false, error: "Unauthorized: You do not own this broadcast." };
    }

    const { error: updateErr } = await admin
      .from("astrologer_live_broadcasts")
      .update({
        status: "live",
        last_host_heartbeat_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", broadcastId);

    if (updateErr) return { success: false, error: updateErr.message };

    // FEATURE-12: NOTIFY FOLLOWERS IN REAL TIME (Non-blocking queue)
    void (async () => {
      try {
        const { data: followers } = await admin
          .from("customer_astrologer_follows")
          .select("customer_id")
          .eq("astrologer_id", profile.id)
          .eq("notifications_enabled", true);

        if (followers && followers.length > 0) {
          const notifications = followers.map((f) => ({
            customer_id: f.customer_id,
            title: `🔴 ${profile.display_name} is Live Now!`,
            message: `Join the live broadcast: "${broadcast.title}". Get astrological insights and live remedies.`,
            link_url: `/customer/broadcasts?join=${broadcast.id}`,
            event_type: "broadcast_live",
            metadata: { broadcast_id: broadcast.id, astrologer_id: profile.id },
          }));

          try {
            await admin.from("customer_notifications").insert(notifications);
          } catch {}
        }
      } catch {
        // Notification failure should never break live stream
      }
    })();

    revalidatePath("/astrologer/broadcast");
    revalidatePath("/customer/broadcasts");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to confirm broadcast status." };
  }
}

/**
 * Host heartbeat to keep broadcast session active and detect host disconnects.
 */
export async function sendHostHeartbeat(broadcastId: string): Promise<{ success: boolean }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false };

    const admin = await createAdminClient("main");
    await admin
      .from("astrologer_live_broadcasts")
      .update({ last_host_heartbeat_at: new Date().toISOString() })
      .eq("id", broadcastId);

    return { success: true };
  } catch {
    return { success: false };
  }
}

/**
 * Ends a live broadcast. Strictly verifies that either the owning astrologer
 * or an authorized Super Admin initiates termination.
 * Closes the LiveKit room session authoritatively on the SFU.
 */
export async function endLiveBroadcast(
  broadcastId: string,
  reason = "Broadcast ended by host"
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return { success: false, error: "Authentication required." };
    }

    const admin = await createAdminClient("main");

    // 1. Fetch broadcast
    const { data: broadcast, error: fetchErr } = await admin
      .from("astrologer_live_broadcasts")
      .select("id, astrologer_id, room_name, status, started_at")
      .eq("id", broadcastId)
      .maybeSingle();

    if (fetchErr || !broadcast) {
      return { success: false, error: "Broadcast record not found." };
    }

    // 2. Authorization check: Owner OR Super Admin
    const { data: astroProfile } = await admin
      .from("astrologer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const isOwner = Boolean(astroProfile && astroProfile.id === broadcast.astrologer_id);

    let isSuperAdmin = false;
    if (!isOwner) {
      const { data: profile } = await admin
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      isSuperAdmin = profile?.role === "super_admin";
    }

    if (!isOwner && !isSuperAdmin) {
      return { success: false, error: "Unauthorized: Only the broadcast owner or a Super Admin can end this broadcast." };
    }

    // 3. Update database status to ended
    const nowIso = new Date().toISOString();
    const { error: updateErr } = await admin
      .from("astrologer_live_broadcasts")
      .update({
        status: "ended",
        ended_at: nowIso,
        termination_reason: reason,
        updated_at: nowIso,
      })
      .eq("id", broadcastId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    // 4. Authoritatively terminate LiveKit room if active
    try {
      const config = getLiveKitConfig();
      const roomService = new RoomServiceClient(config.httpUrl, config.apiKey, config.apiSecret);
      await roomService.deleteRoom(broadcast.room_name).catch(() => {});
    } catch {
      // Non-fatal if room already closed or LiveKit unreachable
    }

    revalidatePath("/astrologer/broadcast");
    revalidatePath("/customer/broadcasts");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to end broadcast." };
  }
}

/**
 * Issues an authorized viewer token for a seeker to watch a live broadcast.
 * Seekers have strict read-only subscribe permissions (canPublish: false).
 */
export async function getBroadcastViewerToken(broadcastId: string): Promise<{
  success: boolean;
  tokenResult?: BroadcastTokenResult;
  error?: string;
}> {
  try {
    const user = await getCurrentUser();

    const admin = await createAdminClient("main");

    const { data: broadcast, error: bErr } = await admin
      .from("astrologer_live_broadcasts")
      .select("id, room_name, status, astrologer:astrologer_profiles(display_name)")
      .eq("id", broadcastId)
      .maybeSingle();

    if (bErr || !broadcast) {
      return { success: false, error: "Broadcast not found." };
    }

    if (broadcast.status !== "live" && broadcast.status !== "preparing") {
      return { success: false, error: "This broadcast is no longer live." };
    }

    const config = getLiveKitConfig();
    const viewerId = user ? `user_${user.id}` : `anon_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const viewerName = user?.user_metadata?.full_name || "Seeker";

    const at = new AccessToken(config.apiKey, config.apiSecret, {
      identity: viewerId,
      name: viewerName,
      ttl: "7200s",
      metadata: JSON.stringify({
        role: "viewer",
        broadcastId: broadcast.id,
      }),
    });

    at.addGrant({
      room: broadcast.room_name,
      roomJoin: true,
      canPublish: false,       // STRICT: Viewers cannot broadcast media
      canPublishData: false,   // STRICT: Viewers cannot inject raw data
      canSubscribe: true,      // Allows subscribing to astrologer's tracks
    });

    const token = await at.toJwt();

    // Record participant in broadcast_participants table (upsert)
    void (async () => {
      try {
        await admin.from("broadcast_participants").upsert(
          {
            broadcast_id: broadcast.id,
            user_id: user?.id || null,
            participant_identity: viewerId,
            participant_name: viewerName,
            role: "viewer",
            joined_at: new Date().toISOString(),
          },
          { onConflict: "broadcast_id, participant_identity" }
        );
      } catch {}
    })();

    return {
      success: true,
      tokenResult: {
        token,
        serverUrl: config.wsUrl,
        roomName: broadcast.room_name,
        participantIdentity: viewerId,
        participantName: viewerName,
        isHost: false,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to generate viewer token." };
  }
}

/**
 * Returns the authoritative real-time viewer count for an active LiveKit broadcast room.
 * Excludes the host and returns actual connected participant numbers.
 * Also tracks peak viewer count and reconciles host presence.
 */
export async function getAuthoritativeBroadcastViewerCount(roomName: string): Promise<{
  success: boolean;
  viewerCount: number | null;
  isHostOnline: boolean;
  error?: string;
}> {
  try {
    const config = getLiveKitConfig();
    const roomService = new RoomServiceClient(config.httpUrl, config.apiKey, config.apiSecret);
    const participants = await roomService.listParticipants(roomName);

    // Filter out broadcaster / host identities
    const host = participants.find((p) => p.identity.startsWith("astro_"));
    const viewers = participants.filter((p) => !p.identity.startsWith("astro_"));

    const admin = await createAdminClient("main");

    // Fetch current peak viewer count
    const { data: bRecord } = await admin
      .from("astrologer_live_broadcasts")
      .select("id, peak_viewer_count, status")
      .eq("room_name", roomName)
      .maybeSingle();

    if (bRecord) {
      const currentPeak = bRecord.peak_viewer_count || 0;
      const newPeak = Math.max(currentPeak, viewers.length);

      await admin
        .from("astrologer_live_broadcasts")
        .update({
          viewer_count: viewers.length,
          peak_viewer_count: newPeak,
        })
        .eq("id", bRecord.id);
    }

    return {
      success: true,
      viewerCount: viewers.length,
      isHostOnline: Boolean(host),
    };
  } catch {
    return { success: false, viewerCount: null, isHostOnline: true, error: "Viewer count unavailable" };
  }
}

/**
 * FEATURE-10: LIVE COMMENTS SYSTEM
 */
export async function sendBroadcastComment(params: {
  broadcastId: string;
  comment: string;
}): Promise<{ success: boolean; comment?: BroadcastComment; error?: string }> {
  try {
    const user = await getCurrentUser();

    if (!user) return { success: false, error: "Please log in to participate in live discussion." };

    const text = params.comment.trim();
    if (!text) return { success: false, error: "Comment cannot be empty." };
    if (text.length > 500) return { success: false, error: "Comment cannot exceed 500 characters." };

    const admin = await createAdminClient("main");

    // Verify broadcast is active and comments are enabled
    const { data: broadcast } = await admin
      .from("astrologer_live_broadcasts")
      .select("id, status, comments_enabled, astrologer_id")
      .eq("id", params.broadcastId)
      .maybeSingle();

    if (!broadcast) return { success: false, error: "Broadcast not found." };
    if (broadcast.status !== "live" && broadcast.status !== "preparing") {
      return { success: false, error: "Comments are disabled because this broadcast has ended." };
    }
    if (!broadcast.comments_enabled) {
      return { success: false, error: "The host has disabled comments for this session." };
    }

    // Determine sender role
    const { data: astroProfile } = await admin
      .from("astrologer_profiles")
      .select("id, display_name")
      .eq("user_id", user.id)
      .maybeSingle();

    let senderRole: BroadcastComment["sender_role"] = "viewer";
    let senderName = user.user_metadata?.full_name || "Seeker";

    if (astroProfile && astroProfile.id === broadcast.astrologer_id) {
      senderRole = "astrologer";
      senderName = `${astroProfile.display_name} (Host)`;
    } else {
      const { data: profile } = await admin
        .from("profiles")
        .select("role, full_name")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.role === "super_admin") {
        senderRole = "super_admin";
        senderName = "Super Admin (Moderator)";
      } else if (profile?.full_name) {
        senderName = profile.full_name;
      }
    }

    const { data: newComment, error: insertErr } = await admin
      .from("broadcast_comments")
      .insert({
        broadcast_id: params.broadcastId,
        user_id: user.id,
        sender_name: senderName,
        sender_role: senderRole,
        comment: text,
      })
      .select("*")
      .single();

    if (insertErr || !newComment) {
      return { success: false, error: insertErr?.message || "Failed to post comment." };
    }

    return { success: true, comment: newComment };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to post comment." };
  }
}

/**
 * Fetches recent live comments for a broadcast.
 */
export async function getBroadcastComments(broadcastId: string): Promise<{
  success: boolean;
  comments: BroadcastComment[];
  error?: string;
}> {
  try {
    const admin = await createAdminClient("main");
    const { data, error } = await admin
      .from("broadcast_comments")
      .select("*")
      .eq("broadcast_id", broadcastId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true })
      .limit(150);

    if (error) return { success: false, error: error.message, comments: [] };
    return { success: true, comments: data || [] };
  } catch (err: any) {
    return { success: false, error: err.message, comments: [] };
  }
}

/**
 * FEATURE-11: VIEWER MODERATION
 * Pin comment, soft-delete comment, or report comment/viewer.
 */
export async function moderateBroadcastComment(params: {
  commentId: string;
  action: "pin" | "unpin" | "delete";
}): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Authentication required." };

    const admin = await createAdminClient("main");

    // Fetch comment and broadcast host
    const { data: comment } = await admin
      .from("broadcast_comments")
      .select("id, broadcast_id, is_pinned, is_deleted")
      .eq("id", params.commentId)
      .maybeSingle();

    if (!comment) return { success: false, error: "Comment not found." };

    const { data: broadcast } = await admin
      .from("astrologer_live_broadcasts")
      .select("astrologer_id")
      .eq("id", comment.broadcast_id)
      .maybeSingle();

    const { data: astroProfile } = await admin
      .from("astrologer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const isHost = Boolean(astroProfile && astroProfile.id === broadcast?.astrologer_id);

    const { data: userProfile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const isSuperAdmin = userProfile?.role === "super_admin";

    if (!isHost && !isSuperAdmin) {
      return { success: false, error: "Unauthorized: Only the host or Super Admin can moderate comments." };
    }

    if (params.action === "delete") {
      await admin
        .from("broadcast_comments")
        .update({ is_deleted: true, deleted_by: user.id })
        .eq("id", params.commentId);
    } else if (params.action === "pin") {
      await admin
        .from("broadcast_comments")
        .update({ is_pinned: true })
        .eq("id", params.commentId);
    } else if (params.action === "unpin") {
      await admin
        .from("broadcast_comments")
        .update({ is_pinned: false })
        .eq("id", params.commentId);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to moderate comment." };
  }
}

/**
 * Report a broadcast or comment for abuse.
 */
export async function reportBroadcastAbuse(params: {
  broadcastId: string;
  commentId?: string;
  reason: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Please log in to submit a report." };

    const admin = await createAdminClient("main");
    await admin.from("broadcast_moderation_reports").insert({
      broadcast_id: params.broadcastId,
      reported_by: user.id,
      comment_id: params.commentId || null,
      reason: params.reason.trim(),
      status: "pending",
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to submit report." };
  }
}

/**
 * Toggle host comments toggle.
 */
export async function toggleBroadcastComments(
  broadcastId: string,
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Authentication required." };

    const admin = await createAdminClient("main");
    await admin
      .from("astrologer_live_broadcasts")
      .update({ comments_enabled: enabled })
      .eq("id", broadcastId);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Schedules an upcoming broadcast session with title, description, scheduled date/time, and duration.
 */
export async function scheduleBroadcast(params: {
  title: string;
  description?: string;
  topic?: string;
  scheduledFor: string;
  durationMinutes?: number;
}): Promise<{ success: boolean; broadcast?: any; error?: string }> {
  try {
    const user = await getCurrentUser();

    if (!user) return { success: false, error: "Authentication required." };

    const scheduledDate = new Date(params.scheduledFor);
    if (isNaN(scheduledDate.getTime()) || scheduledDate.getTime() < Date.now() - 60000) {
      return { success: false, error: "Scheduled time must be a valid future date and time." };
    }

    const admin = await createAdminClient("main");

    const { data: profile } = await admin
      .from("astrologer_profiles")
      .select("id, display_name, approval_status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) return { success: false, error: "Astrologer profile not found." };
    if (profile.approval_status !== "approved") {
      return { success: false, error: "Only approved astrologers can schedule broadcasts." };
    }

    const roomName = `broadcast_${profile.id}_${Date.now()}`;

    const { data: broadcast, error: insertErr } = await admin
      .from("astrologer_live_broadcasts")
      .insert({
        astrologer_id: profile.id,
        room_name: roomName,
        title: params.title.trim(),
        description: params.description?.trim() || null,
        topic: params.topic?.trim() || "Vedic Astrology",
        status: "scheduled",
        scheduled_for: scheduledDate.toISOString(),
        duration_minutes: params.durationMinutes || 60,
        viewer_count: 0,
        comments_enabled: true,
      })
      .select("*")
      .single();

    if (insertErr || !broadcast) {
      return { success: false, error: insertErr?.message || "Failed to schedule broadcast." };
    }

    revalidatePath("/astrologer/broadcast");
    revalidatePath("/customer/broadcasts");
    return { success: true, broadcast };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to schedule broadcast." };
  }
}

/**
 * Returns all upcoming scheduled broadcasts.
 */
export async function getUpcomingScheduledBroadcasts() {
  try {
    const admin = await createAdminClient("main");
    const { data, error } = await admin
      .from("astrologer_live_broadcasts")
      .select("*, astrologer:astrologer_profiles(id, display_name, profile_photo_url, experience_years)")
      .eq("status", "scheduled")
      .gte("scheduled_for", new Date().toISOString())
      .order("scheduled_for", { ascending: true });

    if (error) return { success: false, error: error.message, data: [] };
    return { success: true, data: data || [] };
  } catch (err: any) {
    return { success: false, error: err.message, data: [] };
  }
}

/**
 * Returns all active, live broadcasts.
 */
export async function getActiveLiveBroadcasts() {
  try {
    const admin = await createAdminClient("main");
    const { data, error } = await admin
      .from("astrologer_live_broadcasts")
      .select("*, astrologer:astrologer_profiles(id, display_name, profile_photo_url, experience_years)")
      .in("status", ["live", "preparing"])
      .order("started_at", { ascending: false });

    if (error) {
      return { success: false, error: error.message, data: [] };
    }

    return { success: true, data: data || [] };
  } catch (err: any) {
    return { success: false, error: err.message, data: [] };
  }
}

/**
 * FEATURE-13: BROADCAST HISTORY FOR ASTROLOGERS
 */
export async function getAstrologerBroadcastHistory() {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Authentication required", data: [] };

    const admin = await createAdminClient("main");
    const { data: profile } = await admin
      .from("astrologer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) return { success: false, error: "Astrologer profile not found", data: [] };

    const { data: history, error } = await admin
      .from("astrologer_live_broadcasts")
      .select("*")
      .eq("astrologer_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return { success: false, error: error.message, data: [] };
    return { success: true, data: history || [] };
  } catch (err: any) {
    return { success: false, error: err.message, data: [] };
  }
}
