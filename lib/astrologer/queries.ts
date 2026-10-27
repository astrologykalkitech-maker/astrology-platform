// =====================================================
// PUBLIC ASTROLOGER QUERIES
// =====================================================

import { createClient } from "@/lib/supabase/server";
import type {
  PublicAstrologerProfile,
  PublicAstrologersQueryOptions,
} from "@/lib/types/astrologer.types";
import {
  AUTHORITATIVE_SAFE_PUBLIC_FIELDS,
  CORE_SAFE_PUBLIC_FIELDS,
  PUBLIC_VISIBLE_APPROVAL_STATUS,
  isAstrologerPubliclyVisible,
  isCurrentlyFeaturedAstrologer,
} from "./visibility";

/**
 * Retrieves a list of approved astrologer profiles for the public directory.
 * Guaranteed to return ONLY profiles with approval_status = 'approved'.
 */
export async function getPublicApprovedAstrologers(
  options?: PublicAstrologersQueryOptions
): Promise<PublicAstrologerProfile[]> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from("astrologer_profiles")
      .select(AUTHORITATIVE_SAFE_PUBLIC_FIELDS)
      .eq("approval_status", PUBLIC_VISIBLE_APPROVAL_STATUS)
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

    let { data, error } = await query;

    // Resilient fallback: if database 1 does not have extended ranking columns, select core safe fields
    if (error && error.message.includes("does not exist")) {
      const fallbackQuery = supabase
        .from("astrologer_profiles")
        .select(CORE_SAFE_PUBLIC_FIELDS)
        .eq("approval_status", PUBLIC_VISIBLE_APPROVAL_STATUS)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      const fallbackRes = await fallbackQuery;
      data = fallbackRes.data;
      error = fallbackRes.error;
    }

    if (error || !data) {
      console.error("[Public Query Error: getPublicApprovedAstrologers]", error?.message);
      return [];
    }

    // Enforce authoritative visibility check across returned items
    const rawItems = (data as unknown as PublicAstrologerProfile[]).filter((item) =>
      isAstrologerPubliclyVisible(item)
    );
    const now = Date.now();

    // Sort by: 1. Active featured (desc), 2. Priority score (desc), 3. created_at (desc)
    rawItems.sort((a, b) => {
      const aFeatured = isCurrentlyFeaturedAstrologer(a, now);
      const bFeatured = isCurrentlyFeaturedAstrologer(b, now);
      if (aFeatured !== bFeatured) return aFeatured ? -1 : 1;
      const aPriority = a.ranking_priority ?? 0;
      const bPriority = b.ranking_priority ?? 0;
      if (aPriority !== bPriority) return bPriority - aPriority;
      return 0;
    });

    return rawItems;
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
      .select(AUTHORITATIVE_SAFE_PUBLIC_FIELDS)
      .eq("slug", slug.trim().toLowerCase())
      .eq("approval_status", PUBLIC_VISIBLE_APPROVAL_STATUS)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const profile = data as unknown as PublicAstrologerProfile;
    if (!isAstrologerPubliclyVisible(profile)) {
      return null;
    }

    return profile;
  } catch (err) {
    console.error("[Public Query Exception: getPublicApprovedAstrologerBySlug]", err);
    return null;
  }
}

