"use server";

// =====================================================
// ASTROLOGER PROFILE SERVER ACTIONS
// =====================================================

import { createClient } from "@/lib/supabase/server";
import { requireAstrologer } from "@/lib/auth/session";
import type { AstrologerProfile } from "@/lib/types/database.types";
import type {
  AstrologerProfileResult,
  OptionalAstrologerProfileResult,
} from "@/lib/types/astrologer.types";
import {
  validateCreateAstrologerProfileInput,
  validateUpdateAstrologerProfileInput,
} from "@/lib/validations/astrologer";

/**
 * Handle PostgreSQL unique violation (code 23505) and format friendly error messages.
 */
function handleDatabaseError(error: { code?: string; message: string; details?: string }): string {
  if (error.code === "23505" || error.message.includes("23505") || error.message.toLowerCase().includes("unique constraint")) {
    if (error.message.includes("astrologer_profiles_slug_key") || (error.details && error.details.includes("slug"))) {
      return "The chosen slug is already taken. Please choose a different unique slug.";
    }
    if (error.message.includes("astrologer_profiles_user_id_key") || (error.details && error.details.includes("user_id"))) {
      return "An astrologer profile already exists for this account.";
    }
    return "A unique constraint violation occurred. Please check your unique fields.";
  }
  return error.message;
}

/**
 * Creates an astrologer profile for the currently authenticated astrologer.
 * Enforces approval_status = 'pending' and user_id = auth.uid().
 */
export async function createAstrologerProfile(
  rawInput: unknown
): Promise<AstrologerProfileResult> {
  try {
    // 1. Enforce authentication and astrologer role
    const { user, target } = await requireAstrologer();

    // 2. Validate input at runtime
    const validation = validateCreateAstrologerProfileInput(rawInput);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const input = validation.data;
    const supabase = await createClient(target);

    // 3. Check if user already has an astrologer profile
    const { data: existing, error: checkError } = await supabase
      .from("astrologer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (checkError) {
      return { success: false, error: checkError.message };
    }

    if (existing) {
      return {
        success: false,
        error: "An astrologer profile already exists for this account.",
      };
    }

    // 4. Insert profile record (approval_status is forced to 'pending')
    const insertPayload = {
      user_id: user.id,
      display_name: input.display_name,
      slug: input.slug,
      bio: input.bio ?? null,
      experience_years: input.experience_years ?? null,
      consultation_fee: input.consultation_fee ?? null,
      specializations: input.specializations ?? [],
      languages: input.languages ?? [],
      city: input.city ?? null,
      state: input.state ?? null,
      address: input.address ?? null,
      upi_vpa: input.upi_vpa ?? null,
      profile_photo_url: input.profile_photo_url ?? null,
      approval_status: "pending" as const,
    };

    const { data, error } = await supabase
      .from("astrologer_profiles")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      const friendlyMessage = handleDatabaseError(error);
      return { success: false, error: friendlyMessage };
    }

    return {
      success: true,
      data: data as AstrologerProfile,
    };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "An unexpected error occurred while creating profile.",
    };
  }
}

/**
 * Updates an astrologer profile for the currently authenticated astrologer.
 * Preserves current approval_status and strictly blocks user_id / approval_status modification.
 */
export async function updateAstrologerProfile(
  rawInput: unknown
): Promise<AstrologerProfileResult> {
  try {
    // 1. Enforce authentication and astrologer role
    const { user, target } = await requireAstrologer();

    // 2. Validate update payload (rejects unknown and protected fields)
    const validation = validateUpdateAstrologerProfileInput(rawInput);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const updatePayload = validation.data;
    const supabase = await createClient(target);

    // 3. Verify that the profile exists for this user
    const { data: existing, error: fetchError } = await supabase
      .from("astrologer_profiles")
      .select("id, approval_status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    if (!existing) {
      return {
        success: false,
        error: "Astrologer profile not found. Please create your profile first.",
      };
    }

    // 4. Execute update
    // Note: approval_status is NOT included in updatePayload, preserving current status
    const { data, error } = await supabase
      .from("astrologer_profiles")
      .update(updatePayload)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      const friendlyMessage = handleDatabaseError(error);
      return { success: false, error: friendlyMessage };
    }

    return {
      success: true,
      data: data as AstrologerProfile,
    };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "An unexpected error occurred while updating profile.",
    };
  }
}

/**
 * Fetches the currently authenticated astrologer's own profile.
 * Returns null if the astrologer has not created a profile yet.
 */
export async function getMyAstrologerProfile(): Promise<OptionalAstrologerProfileResult> {
  try {
    // 1. Enforce authentication and astrologer role
    const { user, target } = await requireAstrologer();

    const supabase = await createClient(target);

    // 2. Query astrologer_profiles for user_id
    const { data, error } = await supabase
      .from("astrologer_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: (data as AstrologerProfile) ?? null,
    };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "An unexpected error occurred while fetching profile.",
    };
  }
}

/**
 * Public action helper to verify if an astrologer profile is publicly visible.
 * Calls getPublicApprovedAstrologerBySlug (returns data ONLY if approval_status = 'approved').
 */
export async function checkPublicAstrologerBySlug(slug: string) {
  try {
    const { getPublicApprovedAstrologerBySlug } = await import(
      "@/lib/astrologer/queries"
    );
    const profile = await getPublicApprovedAstrologerBySlug(slug);
    return {
      success: true,
      data: profile,
    };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "An unexpected error occurred while querying public profile.",
    };
  }
}
