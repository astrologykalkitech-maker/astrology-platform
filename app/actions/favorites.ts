"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";

export interface PublicFavoriteAstrologer {
  id: string;
  astrologer_id: string;
  created_at: string;
  astrologer: {
    id: string;
    display_name: string;
    slug?: string | null;
    bio?: string | null;
    profile_photo_url?: string | null;
    experience_years?: number | null;
    specializations?: string[];
    languages?: string[];
    consultation_fee?: number | null;
    rating?: number;
    total_reviews?: number;
  };
}

/**
 * Toggles an astrologer in the customer's favorites.
 * Strictly verifies authentication, validates the astrologer ID,
 * checks database insert/delete results, and handles idempotency cleanly.
 */
export async function toggleFavoriteAstrologer(astrologerId: string): Promise<{
  success: boolean;
  isFavorited?: boolean;
  error?: string;
}> {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return { success: false, error: "Please log in to save favourite astrologers." };
    }

    if (!astrologerId || typeof astrologerId !== "string") {
      return { success: false, error: "Invalid astrologer ID." };
    }

    const admin = await createAdminClient("main");

    // 1. Verify astrologer exists and is approved for public visibility
    const { data: astro, error: astroErr } = await admin
      .from("astrologer_profiles")
      .select("id, approval_status")
      .eq("id", astrologerId)
      .maybeSingle();

    if (astroErr || !astro || astro.approval_status !== "approved") {
      return { success: false, error: "Astrologer is not eligible or cannot be found." };
    }

    // 2. Check if already favorited
    const { data: existing, error: checkErr } = await admin
      .from("customer_favorite_astrologers")
      .select("id")
      .eq("customer_id", user.id)
      .eq("astrologer_id", astrologerId)
      .maybeSingle();

    if (checkErr) {
      return { success: false, error: checkErr.message };
    }

    if (existing) {
      // Delete favorite
      const { error: delErr } = await admin
        .from("customer_favorite_astrologers")
        .delete()
        .eq("id", existing.id)
        .eq("customer_id", user.id); // Strict ownership

      if (delErr) {
        return { success: false, error: delErr.message };
      }

      revalidatePath("/customer/favorites");
      revalidatePath("/customer/astrologers");
      return { success: true, isFavorited: false };
    } else {
      // Insert favorite with unique constraint protection
      const { error: insErr } = await admin
        .from("customer_favorite_astrologers")
        .insert({
          customer_id: user.id,
          astrologer_id: astrologerId,
        });

      if (insErr) {
        // If race condition created it in parallel, treat as success
        if (insErr.code === "23505") {
          return { success: true, isFavorited: true };
        }
        return { success: false, error: insErr.message };
      }

      revalidatePath("/customer/favorites");
      revalidatePath("/customer/astrologers");
      return { success: true, isFavorited: true };
    }
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update favorites." };
  }
}

/**
 * Retrieves the authenticated customer's favorite astrologers with strict allowlisting.
 * NEVER leaks internal columns like review_notes, reviewed_by, reviewed_at, or private addresses.
 */
export async function getCustomerFavoriteAstrologers(): Promise<{
  success: boolean;
  data?: PublicFavoriteAstrologer[];
  error?: string;
}> {
  try {
    const user = await getCurrentUser();

    if (!user) return { success: true, data: [] };

    const admin = await createAdminClient("main");

    // Explicit public columns selection only - ZERO wildcard (*) selection
    const { data: favs, error } = await admin
      .from("customer_favorite_astrologers")
      .select(`
        id,
        astrologer_id,
        created_at,
        astrologer:astrologer_profiles!inner(
          id,
          display_name,
          slug,
          bio,
          profile_photo_url,
          experience_years,
          specializations,
          languages,
          consultation_fee,
          approval_status
        )
      `)
      .eq("customer_id", user.id)
      .eq("astrologer.approval_status", "approved")
      .order("created_at", { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    // Fetch review aggregates for the astrologers
    const astrologerIds = (favs || []).map((f: any) => f.astrologer_id);
    const reviewStatsMap: Record<string, { rating: number; total_reviews: number }> = {};

    if (astrologerIds.length > 0) {
      const { data: reviews } = await admin
        .from("consultation_reviews")
        .select("astrologer_id, rating")
        .in("astrologer_id", astrologerIds)
        .eq("is_published", true);

      if (reviews) {
        const counts: Record<string, { sum: number; count: number }> = {};
        for (const r of reviews) {
          if (!counts[r.astrologer_id]) counts[r.astrologer_id] = { sum: 0, count: 0 };
          counts[r.astrologer_id].sum += Number(r.rating) || 0;
          counts[r.astrologer_id].count += 1;
        }
        for (const [id, stats] of Object.entries(counts)) {
          reviewStatsMap[id] = {
            rating: Math.round((stats.sum / stats.count) * 10) / 10,
            total_reviews: stats.count,
          };
        }
      }
    }

    // Defensive sanitization transform layer
    const sanitized: PublicFavoriteAstrologer[] = (favs || []).map((f: any) => {
      const a = f.astrologer;
      const stats = reviewStatsMap[f.astrologer_id] || { rating: 5.0, total_reviews: 0 };
      return {
        id: f.id,
        astrologer_id: f.astrologer_id,
        created_at: f.created_at,
        astrologer: {
          id: a.id,
          display_name: a.display_name,
          slug: a.slug || null,
          bio: a.bio || null,
          profile_photo_url: a.profile_photo_url || null,
          experience_years: a.experience_years ?? 5,
          specializations: Array.isArray(a.specializations) ? a.specializations : [],
          languages: Array.isArray(a.languages) ? a.languages : [],
          consultation_fee: a.consultation_fee ?? 500,
          rating: stats.rating,
          total_reviews: stats.total_reviews,
        },
      };
    });

    return { success: true, data: sanitized };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to fetch favorites." };
  }
}

/**
 * Checks whether an astrologer is in the current user's favorites.
 */
export async function checkIsAstrologerFavorited(astrologerId: string): Promise<boolean> {
  try {
    const user = await getCurrentUser();

    if (!user || !astrologerId) return false;

    const admin = await createAdminClient("main");
    const { data } = await admin
      .from("customer_favorite_astrologers")
      .select("id")
      .eq("customer_id", user.id)
      .eq("astrologer_id", astrologerId)
      .maybeSingle();

    return Boolean(data);
  } catch {
    return false;
  }
}
