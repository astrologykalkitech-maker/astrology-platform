// =====================================================
// CENTRALIZED AUTHORITATIVE ASTROLOGER VISIBILITY & ELIGIBILITY
// =====================================================

import type { AstrologerProfile, ApprovalStatus } from "@/lib/types/database.types";
import type { PublicAstrologerProfile } from "@/lib/types/astrologer.types";

/**
 * The authoritative approval status required for public listing and discovery.
 */
export const PUBLIC_VISIBLE_APPROVAL_STATUS: ApprovalStatus = "approved";

/**
 * Core safe public fields present across all database versions
 * Strictly omits user_id, address, review_notes, reviewed_by, reviewed_at, and sensitive data.
 */
export const CORE_SAFE_PUBLIC_FIELDS =
  "id, slug, display_name, bio, experience_years, specializations, languages, city, state, consultation_fee, voice_price_per_minute, chat_price_per_minute, video_price_per_minute, voice_enabled, chat_enabled, video_enabled, profile_photo_url, approval_status, created_at";

/**
 * Extended safe columns including optional ranking metadata
 */
export const EXTENDED_SAFE_PUBLIC_FIELDS =
  "id, slug, display_name, bio, experience_years, specializations, languages, city, state, consultation_fee, voice_price_per_minute, chat_price_per_minute, video_price_per_minute, voice_enabled, chat_enabled, video_enabled, profile_photo_url, approval_status, is_featured, featured_until, ranking_priority, created_at";

export const AUTHORITATIVE_SAFE_PUBLIC_FIELDS = CORE_SAFE_PUBLIC_FIELDS;

export interface AstrologerEligibilityCheckOptions {
  now?: number;
}

/**
 * Authoritative backend check: determines whether an astrologer profile
 * is currently visible and discoverable to customers on public surfaces.
 * 
 * Rules:
 * 1. Profile must not be null/undefined.
 * 2. Profile approval_status must be strictly 'approved'.
 *    - 'draft', 'pending', 'changes_requested', 'rejected', 'suspended', 'archived' are NEVER publicly visible.
 * 3. Profile must possess a non-empty display name.
 */
export function isAstrologerPubliclyVisible(
  astrologer: Partial<AstrologerProfile | PublicAstrologerProfile> | null | undefined
): boolean {
  if (!astrologer) return false;

  // Strict approval status check
  if (astrologer.approval_status !== PUBLIC_VISIBLE_APPROVAL_STATUS) {
    return false;
  }

  // Must have a valid display name
  if (!astrologer.display_name || typeof astrologer.display_name !== "string" || !astrologer.display_name.trim()) {
    return false;
  }

  return true;
}

/**
 * Authoritative booking & consultation eligibility check:
 * Validates whether an astrologer can receive new customer consultation requests,
 * enquiries, or bookings.
 */
export function isAstrologerEligibleForBooking(
  astrologer: Partial<AstrologerProfile | PublicAstrologerProfile> | null | undefined
): { eligible: boolean; reason?: string } {
  if (!astrologer) {
    return { eligible: false, reason: "Astrologer listing was not found." };
  }

  if (astrologer.approval_status !== PUBLIC_VISIBLE_APPROVAL_STATUS) {
    const status = astrologer.approval_status ?? "unknown";
    return {
      eligible: false,
      reason: `Astrologer is currently not eligible for new bookings (status: ${status}).`,
    };
  }

  if (!isAstrologerPubliclyVisible(astrologer)) {
    return { eligible: false, reason: "Astrologer profile is currently not available." };
  }

  return { eligible: true };
}

/**
 * Helper to determine whether an astrologer's featured placement is actively valid.
 */
export function isCurrentlyFeaturedAstrologer(
  astrologer: { is_featured?: boolean | null; featured_until?: string | null },
  nowMs: number = Date.now()
): boolean {
  if (!astrologer.is_featured) return false;
  if (!astrologer.featured_until) return true; // Permanent until revoked
  const expiry = new Date(astrologer.featured_until).getTime();
  return !Number.isNaN(expiry) && expiry > nowMs;
}
