"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";

export interface CommunityPostRecord {
  id: string;
  author_id: string;
  author_role: "astrologer" | "customer" | "super_admin";
  title?: string | null;
  content: string;
  category: "general" | "astrology_insights" | "vedic_philosophy" | "broadcast_announcement" | "daily_guidance";
  media_urls?: string[];
  likes_count: number;
  comments_count: number;
  is_pinned: boolean;
  status: "draft" | "published" | "flagged" | "hidden" | "archived";
  created_at: string;
  author?: {
    full_name?: string | null;
    avatar_url?: string | null;
  };
}

/**
 * Loads published community posts with author profiles.
 */
export async function getCommunityFeedAction({
  category,
  limit = 20,
}: {
  category?: string;
  limit?: number;
}) {
  try {
    const admin = await createAdminClient("main");
    let query = admin
      .from("community_posts")
      .select("*, author:author_id(full_name, avatar_url)")
      .eq("status", "published")
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (category && category !== "all") {
      query = query.eq("category", category);
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message, data: [] };

    return { success: true, data: (data || []) as CommunityPostRecord[] };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load community feed", data: [] };
  }
}

/**
 * Creates an authentic educational or announcement community post.
 */
export async function createCommunityPostAction({
  title,
  content,
  category = "general",
  mediaUrls = [],
}: {
  title?: string;
  content: string;
  category?: "general" | "astrology_insights" | "vedic_philosophy" | "broadcast_announcement" | "daily_guidance";
  mediaUrls?: string[];
}): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();

    if (!user) return { success: false, error: "Authentication required" };

    const admin = await createAdminClient("main");
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role = (profile?.role === "astrologer" || profile?.role === "super_admin") ? profile.role : "customer";

    const { error } = await admin.from("community_posts").insert({
      author_id: user.id,
      author_role: role,
      title: title?.trim() || null,
      content: content.trim(),
      category,
      media_urls: mediaUrls,
      status: "published",
    });

    if (error) return { success: false, error: error.message };

    revalidatePath("/community");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to publish post" };
  }
}

/**
 * Reports a post or comment for administrator moderation.
 */
export async function reportCommunityContentAction({
  targetType,
  targetId,
  reason,
}: {
  targetType: "post" | "comment" | "broadcast";
  targetId: string;
  reason: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();

    if (!user) return { success: false, error: "Authentication required" };

    const admin = await createAdminClient("main");
    const { error } = await admin.from("community_reports").insert({
      reporter_id: user.id,
      target_type: targetType,
      target_id: targetId,
      reason: reason.trim(),
      status: "pending",
    });

    if (error) return { success: false, error: error.message };

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to submit report" };
  }
}

