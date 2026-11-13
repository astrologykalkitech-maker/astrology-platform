"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";

export async function toggleFollowAstrologer(astrologerId: string): Promise<{
  success: boolean;
  isFollowing?: boolean;
  error?: string;
}> {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return { success: false, error: "Please log in to follow astrologers." };
    }

    if (!astrologerId) return { success: false, error: "Invalid astrologer ID" };

    const admin = await createAdminClient("main");

    // Check existing follow
    const { data: existing, error: fetchErr } = await admin
      .from("customer_astrologer_follows")
      .select("id")
      .eq("customer_id", user.id)
      .eq("astrologer_id", astrologerId)
      .maybeSingle();

    if (fetchErr) return { success: false, error: fetchErr.message };

    if (existing) {
      const { error: delErr } = await admin
        .from("customer_astrologer_follows")
        .delete()
        .eq("id", existing.id);

      if (delErr) return { success: false, error: delErr.message };

      revalidatePath("/customer/astrologers");
      return { success: true, isFollowing: false };
    } else {
      const { error: insErr } = await admin
        .from("customer_astrologer_follows")
        .insert({
          customer_id: user.id,
          astrologer_id: astrologerId,
        });

      if (insErr) {
        if (insErr.code === "23505") return { success: true, isFollowing: true };
        return { success: false, error: insErr.message };
      }

      revalidatePath("/customer/astrologers");
      return { success: true, isFollowing: true };
    }
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update follow status" };
  }
}

export async function getCustomerFollowedAstrologers(): Promise<{
  success: boolean;
  astrologerIds?: string[];
  error?: string;
}> {
  try {
    const user = await getCurrentUser();

    if (!user) return { success: true, astrologerIds: [] };

    const admin = await createAdminClient("main");
    const { data, error } = await admin
      .from("customer_astrologer_follows")
      .select("astrologer_id")
      .eq("customer_id", user.id);

    if (error) return { success: false, error: error.message };
    return { success: true, astrologerIds: (data || []).map((d) => d.astrologer_id) };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

