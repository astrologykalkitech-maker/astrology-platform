"use server";

import { createPublicServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function toggleFavoriteAstrologer(astrologerId: string) {
  try {
    const supabase = await createPublicServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Please log in to save favourite astrologers." };
    }

    const admin = await createAdminClient("main");

    // Check if already favorited
    const { data: existing } = await admin
      .from("customer_favorite_astrologers")
      .select("id")
      .eq("customer_id", user.id)
      .eq("astrologer_id", astrologerId)
      .maybeSingle();

    if (existing) {
      await admin
        .from("customer_favorite_astrologers")
        .delete()
        .eq("id", existing.id);

      revalidatePath("/customer/favorites");
      revalidatePath("/customer/astrologers");
      return { success: true, isFavorited: false };
    } else {
      await admin.from("customer_favorite_astrologers").insert({
        customer_id: user.id,
        astrologer_id: astrologerId,
      });

      revalidatePath("/customer/favorites");
      revalidatePath("/customer/astrologers");
      return { success: true, isFavorited: true };
    }
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update favorites." };
  }
}

export async function getCustomerFavoriteAstrologers() {
  try {
    const supabase = await createPublicServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: true, data: [] };

    const admin = await createAdminClient("main");
    const { data: favs, error } = await admin
      .from("customer_favorite_astrologers")
      .select("id, astrologer_id, created_at, astrologer:astrologer_profiles(*)")
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: favs || [] };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to fetch favorites." };
  }
}

export async function checkIsAstrologerFavorited(astrologerId: string) {
  try {
    const supabase = await createPublicServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return false;

    const admin = await createAdminClient("main");
    const { data } = await admin
      .from("customer_favorite_astrologers")
      .select("id")
      .eq("customer_id", user.id)
      .eq("astrologer_id", astrologerId)
      .maybeSingle();

    return !!data;
  } catch (e) {
    return false;
  }
}

