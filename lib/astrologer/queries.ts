// =====================================================
// PUBLIC ASTROLOGER QUERIES
// =====================================================

import { createClient } from "@/lib/supabase/server";
import type {
  PublicAstrologerProfile,
  PublicAstrologersQueryOptions,
} from "@/lib/types/astrologer.types";

// Explicit list of safe public fields to select (strictly omits address, user_id, internal timestamps)
const SAFE_PUBLIC_FIELDS =
  "id, slug, display_name, bio, experience_years, specializations, languages, city, state, consultation_fee, profile_photo_url, approval_status, is_featured, featured_until, ranking_priority";

/**
 * Retrieves a list of approved astrologer profiles for the public directory.
 * Guaranteed to return ONLY profiles with approval_status = 'approved'.
 * Applies the canonical owner-controlled ranking:
 * 1. Active featured placement (is_featured = true)
 * 2. Highest ranking priority score (ranking_priority DESC)
 * 3. Recent creation timestamp (created_at DESC)
 */
export async function getPublicApprovedAstrologers(
  options?: PublicAstrologersQueryOptions
): Promise<PublicAstrologerProfile[]> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from("astrologer_profiles")
      .select(SAFE_PUBLIC_FIELDS)
      .eq("approval_status", "approved")
      .order("is_featured", { ascending: false })
      .order("ranking_priority", { ascending: false })
      .order("created_at", { ascending: false });

    // Filter by specialization if requested
    if (options?.specialization && options.specialization.trim().length > 0) {
      query = query.contains("specializations", [options.specialization.trim()]);
    }

    // Filter by language if requested
    if (options?.language && options.language.trim().length > 0) {
      query = query.contains("languages", [options.language.trim()]);
    }

    // Filter by city if requested
    if (options?.city && options.city.trim().length > 0) {
      query = query.ilike("city", options.city.trim());
    }

    // Apply pagination
    const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);
    const offset = Math.max(options?.offset ?? 0, 0);

    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error || !data) {
      console.error("[Public Query Error: getPublicApprovedAstrologers]", error?.message);
      return [];
    }

    return data as unknown as PublicAstrologerProfile[];
  } catch (err) {
    console.error("[Public Query Exception: getPublicApprovedAstrologers]", err);
    return [];
  }
}

/**
 * Retrieves a single public astrologer profile by slug.
 * Returns null if the profile does not exist or has not been approved yet.
 */
export async function getPublicApprovedAstrologerBySlug(
  slug: string
): Promise<PublicAstrologerProfile | null> {
  if (!slug || typeof slug !== "string" || slug.trim().length === 0) {
    return null;
  }

  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("astrologer_profiles")
      .select(SAFE_PUBLIC_FIELDS)
      .eq("slug", slug.trim().toLowerCase())
      .eq("approval_status", "approved")
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return data as unknown as PublicAstrologerProfile;
  } catch (err) {
    console.error("[Public Query Exception: getPublicApprovedAstrologerBySlug]", err);
    return null;
  }
}
