"use server";

// =====================================================
// SUPER ADMIN CONSULTATION REVIEWS & MODERATION ACTIONS
// =====================================================

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminAccess } from "@/lib/auth/admin-guard";
import type { AuthResult } from "@/lib/types/auth.types";
import { isValidUUID } from "@/lib/validations/lead";

export interface AdminReviewItem {
  id: string;
  lead_id: string;
  customer_id: string;
  customer_name: string;
  customer_avatar: string | null;
  astrologer_id: string;
  astrologer_name: string;
  rating: number;
  review_text: string | null;
  is_published: boolean;
  created_at: string;
}

export interface AdminReviewsFilter {
  search?: string;
  rating?: number;
  status?: "all" | "published" | "hidden";
  limit?: number;
  offset?: number;
}

export interface AdminReviewsResult {
  reviews: AdminReviewItem[];
  totalCount: number;
  publishedCount: number;
  hiddenCount: number;
  averageRating: number;
}

export async function getAdminReviewsAction(
  filter: AdminReviewsFilter = {}
): Promise<AuthResult<AdminReviewsResult>> {
  try {
    await requireAdminAccess();

    const supabase = await createAdminClient("main");
    const limit = Math.min(Math.max(filter.limit ?? 50, 1), 100);
    const offset = Math.max(filter.offset ?? 0, 0);

    let query = supabase
      .from("consultation_reviews")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (filter.status === "published") {
      query = query.eq("is_published", true);
    } else if (filter.status === "hidden") {
      query = query.eq("is_published", false);
    }

    if (filter.rating && filter.rating >= 1 && filter.rating <= 5) {
      query = query.eq("rating", filter.rating);
    }

    query = query.range(offset, offset + limit - 1);

    const { data: rawReviews, count, error } = await query;
    if (error) {
      return { success: false, error: `Failed to load reviews: ${error.message}` };
    }

    const reviews = rawReviews || [];

    // Collect participant IDs for profile batch enrichment
    const customerIds = Array.from(new Set(reviews.map((r) => r.customer_id).filter(Boolean)));
    const astrologerIds = Array.from(new Set(reviews.map((r) => r.astrologer_id).filter(Boolean)));

    const [customersRes, astrologersRes] = await Promise.all([
      customerIds.length > 0
        ? supabase.from("profiles").select("id, full_name, avatar_url").in("id", customerIds)
        : { data: [] },
      astrologerIds.length > 0
        ? supabase.from("astrologer_profiles").select("id, display_name").in("id", astrologerIds)
        : { data: [] },
    ]);

    const customerMap = new Map((customersRes.data || []).map((c) => [c.id, c]));
    const astrologerMap = new Map((astrologersRes.data || []).map((a) => [a.id, a]));

    const enriched: AdminReviewItem[] = reviews.map((r) => {
      const cust = customerMap.get(r.customer_id);
      const astro = astrologerMap.get(r.astrologer_id);

      return {
        id: r.id,
        lead_id: r.lead_id,
        customer_id: r.customer_id,
        customer_name: cust?.full_name?.trim() || `Seeker #${r.customer_id.slice(0, 5)}`,
        customer_avatar: cust?.avatar_url || null,
        astrologer_id: r.astrologer_id,
        astrologer_name: astro?.display_name || "Assigned Astrologer",
        rating: r.rating || 5,
        review_text: r.review_text || null,
        is_published: Boolean(r.is_published),
        created_at: r.created_at,
      };
    });

    // Compute metrics
    const totalCount = count ?? enriched.length;
    const publishedCount = enriched.filter((r) => r.is_published).length;
    const hiddenCount = enriched.filter((r) => !r.is_published).length;
    const avgRating =
      enriched.length > 0
        ? Number(
            (
              enriched.reduce((acc, curr) => acc + (curr.rating || 5), 0) /
              enriched.length
            ).toFixed(1)
          )
        : 5.0;

    return {
      success: true,
      data: {
        reviews: enriched,
        totalCount,
        publishedCount,
        hiddenCount,
        averageRating: avgRating,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load reviews for admin moderation.",
    };
  }
}

export async function toggleReviewPublishedAction(
  reviewId: string,
  isPublished: boolean
): Promise<AuthResult<{ id: string; is_published: boolean }>> {
  try {
    await requireAdminAccess();

    if (!isValidUUID(reviewId)) {
      return { success: false, error: "Invalid review ID format." };
    }

    const supabase = await createAdminClient("main");

    const { error } = await supabase
      .from("consultation_reviews")
      .update({
        is_published: isPublished,
        updated_at: new Date().toISOString(),
      })
      .eq("id", reviewId);

    if (error) {
      return { success: false, error: `Failed to update review visibility: ${error.message}` };
    }

    revalidatePath("/super-admin/reviews");
    revalidatePath("/astrologer/reviews");
    return { success: true, data: { id: reviewId, is_published: isPublished } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to toggle review visibility.",
    };
  }
}

export async function deleteReviewAction(
  reviewId: string
): Promise<AuthResult<{ id: string; deleted: boolean }>> {
  try {
    await requireAdminAccess();

    if (!isValidUUID(reviewId)) {
      return { success: false, error: "Invalid review ID format." };
    }

    const supabase = await createAdminClient("main");

    const { error } = await supabase
      .from("consultation_reviews")
      .delete()
      .eq("id", reviewId);

    if (error) {
      return { success: false, error: `Failed to delete review: ${error.message}` };
    }

    revalidatePath("/super-admin/reviews");
    revalidatePath("/astrologer/reviews");
    return { success: true, data: { id: reviewId, deleted: true } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete review.",
    };
  }
}

