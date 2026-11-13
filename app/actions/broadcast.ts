"use server";

import { createPublicServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function createLiveBroadcast(params: {
  title: string;
  description?: string;
  topic?: string;
}) {
  try {
    const supabase = await createPublicServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Authentication required." };
    }

    const admin = await createAdminClient("main");

    // Fetch astrologer profile
    const { data: profile } = await admin
      .from("astrologer_profiles")
      .select("id, display_name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) {
      return { success: false, error: "Astrologer profile not found." };
    }

    const roomName = `broadcast_${profile.id}_${Date.now()}`;

    const { data: broadcast, error } = await admin
      .from("astrologer_live_broadcasts")
      .insert({
        astrologer_id: profile.id,
        room_name: roomName,
        title: params.title.trim(),
        description: params.description?.trim() || null,
        topic: params.topic?.trim() || "Vedic Astrology",
        status: "live",
        started_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/astrologer/broadcast");
    revalidatePath("/customer/broadcasts");
    return { success: true, broadcast };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create live broadcast." };
  }
}

export async function endLiveBroadcast(broadcastId: string) {
  try {
    const supabase = await createPublicServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Authentication required." };
    }

    const admin = await createAdminClient("main");

    const { error } = await admin
      .from("astrologer_live_broadcasts")
      .update({
        status: "ended",
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", broadcastId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/astrologer/broadcast");
    revalidatePath("/customer/broadcasts");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getActiveLiveBroadcasts() {
  try {
    const admin = await createAdminClient("main");
    const { data, error } = await admin
      .from("astrologer_live_broadcasts")
      .select("*, astrologer:astrologer_profiles(id, display_name, profile_photo_url, experience_years)")
      .eq("status", "live")
      .order("started_at", { ascending: false });

    if (error) {
      return { success: false, error: error.message, data: [] };
    }

    return { success: true, data: data || [] };
  } catch (err: any) {
    return { success: false, error: err.message, data: [] };
  }
}

