"use server";

// =====================================================
// ADMIN LISTING MANAGEMENT SERVER ACTIONS
// =====================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminPermission, requireSuperAdmin } from "@/lib/auth/admin-guard";
import { logAdminAction } from "@/lib/admin/audit";
import { sanitizeFilterTerm } from "@/lib/security/postgrest";
import { revalidatePath } from "next/cache";
import type {
  ApprovalStatus,
  AstrologerProfile,
} from "@/lib/types/database.types";
import type { AuthResult } from "@/lib/types/auth.types";
import {
  validateListingModerationInput,
  validateListingRankingInput,
} from "@/lib/validations/admin";
import { isValidUUID } from "@/lib/validations/lead";

export interface AdminListingsFilter {
  status?: ApprovalStatus | "all";
  search?: string;
  limit?: number;
  offset?: number;
}

export interface AdminListingsResultData {
  listings: AstrologerProfile[];
  totalCount: number;
}

/**
 * Fetch listings for admin review with filtering, search, and pagination.
 */
export async function getAdminListings(
  filter: AdminListingsFilter = {}
): Promise<AuthResult<AdminListingsResultData>> {
  try {
    await requireAdminPermission("listing.read");
    const supabase = await createAdminClient("main");
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    const offset = Math.max(filter.offset ?? 0, 0);

    let query = supabase
      .from("astrologer_profiles")
      .select("*", { count: "exact" });

    if (filter.status && filter.status !== "all") {
      query = query.eq("approval_status", filter.status);
    }

    const safeSearch = filter.search ? sanitizeFilterTerm(filter.search) : "";
    if (safeSearch) {
      const term = `%${safeSearch}%`;
      query = query.or(`display_name.ilike.${term},city.ilike.${term},slug.ilike.${term}`);
    }

    // Order by featured, ranking priority, then recent
    query = query
      .order("is_featured", { ascending: false })
      .order("ranking_priority", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: {
        listings: (data as AstrologerProfile[]) ?? [],
        totalCount: count ?? 0,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load listings.",
    };
  }
}

/**
 * Update listing approval status (approve, reject, request corrections, suspend, restore).
 */
export async function updateListingModerationStatus(
  rawInput: unknown
): Promise<AuthResult<AstrologerProfile>> {
  try {
    const validation = validateListingModerationInput(rawInput);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const { listingId, status, reviewNotes, reason } = validation.data;

    // Changes requested can be performed by listing.review; full approval/rejection/suspension requires listing.approve
    const requiredPermission = status === "changes_requested" ? "listing.review" : "listing.approve";
    const { user, profile } = await requireAdminPermission(requiredPermission);

    // Authoritative platform store is DB1 ("main")
    const supabase = await createAdminClient("main");

    // Fetch before-state
    const { data: beforeListing, error: fetchErr } = await supabase
      .from("astrologer_profiles")
      .select("*")
      .eq("id", listingId)
      .single();

    if (fetchErr || !beforeListing) {
      return { success: false, error: "Listing not found." };
    }

    const updatePayload: Record<string, unknown> = {
      approval_status: status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (reviewNotes !== undefined) {
      updatePayload.review_notes = reviewNotes;
    }

    const { data: updated, error: updateErr } = await supabase
      .from("astrologer_profiles")
      .update(updatePayload)
      .eq("id", listingId)
      .select("*")
      .single();

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    // Also mirror to secondary admin client (DB2) if available
    try {
      const adminClient = await createAdminClient("admin");
      const targetSlug = updated?.slug || beforeListing.slug;

      const { data: adminMatched } = await adminClient
        .from("astrologer_profiles")
        .select("id")
        .or(`id.eq.${listingId},slug.eq.${targetSlug}`)
        .maybeSingle();

      if (adminMatched?.id) {
        await adminClient
          .from("astrologer_profiles")
          .update(updatePayload)
          .eq("id", adminMatched.id);
      }
    } catch (syncErr) {
      console.warn("[Listing Moderation Admin DB Sync Warning]", syncErr);
    }

    // Revalidate customer directory, astrologer views, and admin listings instantly
    revalidatePath("/customer/astrologers", "layout");
    revalidatePath("/customer/astrologers", "page");
    if (updated?.slug) {
      revalidatePath(`/customer/astrologers/${updated.slug}`, "page");
    }
    if (beforeListing.slug && beforeListing.slug !== updated?.slug) {
      revalidatePath(`/customer/astrologers/${beforeListing.slug}`, "page");
    }
    revalidatePath("/customer/enquiries/new", "page");
    revalidatePath("/customer/bookings", "page");
    revalidatePath("/customer", "layout");
    revalidatePath("/customer", "page");
    revalidatePath("/astrologer/profile", "page");
    revalidatePath("/super-admin/listings", "page");
    revalidatePath("/super-admin/verification", "page");
    revalidatePath("/super-admin/listings/ranking", "page");
    revalidatePath("/super-admin/leads/distribution", "page");
    revalidatePath("/super-admin", "page");

    // Record audit event
    await logAdminAction({
      actorId: user.id,
      actorRole: profile.role,
      action: `listing.status_change.${status}`,
      targetType: "listing",
      targetId: listingId,
      reason: reason ?? reviewNotes,
      beforeState: { approval_status: beforeListing.approval_status },
      afterState: { approval_status: status },
      outcome: "success",
    });

    return {
      success: true,
      data: updated as AstrologerProfile,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update listing status.",
    };
  }
}

/**
 * Updates ranking priority and featured placement (Owner Super Admin only).
 */
export async function updateListingRankingAndFeatured(
  rawInput: unknown
): Promise<AuthResult<AstrologerProfile>> {
  try {
    const { user, profile } = await requireSuperAdmin();

    const validation = validateListingRankingInput(rawInput);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const { listingId, rankingPriority, isFeatured, featuredUntil, reason } = validation.data;
    const supabase = await createAdminClient("main");

    const { data: beforeListing, error: fetchErr } = await supabase
      .from("astrologer_profiles")
      .select("ranking_priority, is_featured, featured_until")
      .eq("id", listingId)
      .single();

    if (fetchErr || !beforeListing) {
      return { success: false, error: "Listing not found." };
    }

    const { data: updated, error: updateErr } = await supabase
      .from("astrologer_profiles")
      .update({
        ranking_priority: rankingPriority,
        is_featured: isFeatured,
        featured_until: featuredUntil,
        updated_at: new Date().toISOString(),
      })
      .eq("id", listingId)
      .select("*")
      .single();

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    // Mirror to secondary admin DB if present
    try {
      const adminDb = await createAdminClient("admin");
      await adminDb
        .from("astrologer_profiles")
        .update({
          ranking_priority: rankingPriority,
          is_featured: isFeatured,
          featured_until: featuredUntil,
          updated_at: new Date().toISOString(),
        })
        .eq("id", listingId);
    } catch {
      // Best-effort secondary mirror
    }

    await logAdminAction({
      actorId: user.id,
      actorRole: profile.role,
      action: "listing.ranking_update",
      targetType: "listing",
      targetId: listingId,
      reason,
      beforeState: beforeListing,
      afterState: { ranking_priority: rankingPriority, is_featured: isFeatured, featured_until: featuredUntil },
      outcome: "success",
    });

    revalidatePath("/super-admin/listings/ranking");
    revalidatePath("/super-admin/listings");
    revalidatePath("/customer/astrologers");
    revalidatePath("/");

    return {
      success: true,
      data: updated as AstrologerProfile,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update listing ranking.",
    };
  }
}

/**
 * Get listing by ID with complete profile data for admin review.
 */
export async function getListingDetailsForAdmin(
  listingId: string
): Promise<AuthResult<AstrologerProfile>> {
  try {
    await requireAdminPermission("listing.read");

    if (!isValidUUID(listingId)) {
      return { success: false, error: "Invalid listing ID format." };
    }

    const supabase = await createAdminClient("main");
    const { data, error } = await supabase
      .from("astrologer_profiles")
      .select("*")
      .eq("id", listingId)
      .single();

    if (error || !data) {
      return { success: false, error: "Listing not found." };
    }

    return { success: true, data: data as AstrologerProfile };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load listing details.",
    };
  }
}
