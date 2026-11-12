"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth, requireAstrologer } from "@/lib/auth/session";
import type { AuthResult } from "@/lib/types/auth.types";
import { RITUAL_CATALOG } from "@/lib/astrology/protection-rituals-catalog";

export interface ProtectionRitual {
  id: string;
  slug?: string;
  title: string;
  category: "evil_eye" | "negative_energy" | "spiritual" | "home" | "personal" | "vedic";
  purpose: string;
  description: string;
  traditional_background?: string;
  eligibility?: string;
  instructions: string[];
  duration_minutes: number;
  required_materials: string[];
  precautions?: string;
  contraindications?: string;
  alternative?: string;
  frequency: string;
  is_saved?: boolean;
  completion_count?: number;
  last_completed_at?: string;
  has_reminder?: boolean;
  reminder_time?: string;
  reminder_schedule_type?: string;
}

export interface AstrologerRecommendationPayload {
  customerId: string;
  ritualId: string;
  bookingId?: string;
  recommendedFrequency?: string;
  customGuidance?: string;
}

/**
 * Ensures the comprehensive ritual catalog is seeded and up to date in Supabase.
 */
async function ensureRitualCatalogSeeded(admin: any) {
  try {
    const { count } = await admin
      .from("protection_rituals")
      .select("id", { count: "exact", head: true });

    // If fewer than the catalog length, perform upsert
    if (!count || count < RITUAL_CATALOG.length) {
      const records = RITUAL_CATALOG.map((r) => ({
        title: r.title,
        slug: r.slug,
        category: r.category,
        purpose: r.purpose,
        description: r.description,
        traditional_background: r.traditional_background || null,
        eligibility: r.eligibility || null,
        instructions: r.instructions,
        duration_minutes: r.duration_minutes,
        required_materials: r.required_materials,
        precautions: r.precautions || null,
        contraindications: r.contraindications || null,
        alternative: r.alternative || null,
        frequency: r.frequency,
        is_active: true,
      }));

      for (const rec of records) {
        await admin
          .from("protection_rituals")
          .upsert(rec, { onConflict: "title" });
      }
    }
  } catch (err) {
    console.error("[ensureRitualCatalogSeeded] Error:", err);
  }
}

/**
 * Retrieves all active protection rituals for a Customer.
 * Resolves customer favorites, completion tracking, and active reminder schedules.
 */
export async function getCustomerProtectionRitualsAction(): Promise<AuthResult<ProtectionRitual[]>> {
  try {
    const { user } = await requireAuth();
    const admin = await createAdminClient("main");

    await ensureRitualCatalogSeeded(admin);

    // 1. Fetch all active rituals
    const { data: dbRituals, error: ritualErr } = await admin
      .from("protection_rituals")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (ritualErr || !dbRituals || dbRituals.length === 0) {
      // Fallback to memory catalog if table empty or query failed
      return {
        success: true,
        data: RITUAL_CATALOG.map((r) => ({
          ...r,
          instructions: r.instructions || [],
          required_materials: r.required_materials || [],
          is_saved: false,
          completion_count: 0,
        })),
      };
    }

    // 2. Fetch customer's saved favorites
    const { data: saved } = await admin
      .from("customer_saved_rituals")
      .select("ritual_id")
      .eq("customer_id", user.id);

    const savedSet = new Set((saved || []).map((s: any) => s.ritual_id));

    // 3. Fetch customer's completion history
    const { data: progress } = await admin
      .from("customer_ritual_progress")
      .select("ritual_id, completed_at")
      .eq("customer_id", user.id)
      .order("completed_at", { ascending: false });

    const completionMap: Record<string, { count: number; lastDate: string }> = {};
    if (progress) {
      for (const p of progress) {
        if (!completionMap[p.ritual_id]) {
          completionMap[p.ritual_id] = { count: 0, lastDate: p.completed_at };
        }
        completionMap[p.ritual_id].count += 1;
      }
    }

    // 4. Fetch customer's active ritual schedules / reminders
    let scheduleMap: Record<string, { time: string; type: string }> = {};
    try {
      const { data: schedules } = await admin
        .from("customer_ritual_schedules")
        .select("ritual_id, preferred_time, schedule_type, is_active")
        .eq("customer_id", user.id)
        .eq("is_active", true);

      if (schedules) {
        for (const s of schedules) {
          scheduleMap[s.ritual_id] = { time: s.preferred_time, type: s.schedule_type };
        }
      }
    } catch {
      // Table may not yet be active on old migration instances
    }

    const result: ProtectionRitual[] = dbRituals.map((r: any) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      category: r.category,
      purpose: r.purpose,
      description: r.description,
      traditional_background: r.traditional_background,
      eligibility: r.eligibility,
      instructions: Array.isArray(r.instructions) ? r.instructions : [],
      duration_minutes: r.duration_minutes,
      required_materials: Array.isArray(r.required_materials) ? r.required_materials : [],
      precautions: r.precautions,
      contraindications: r.contraindications,
      alternative: r.alternative,
      frequency: r.frequency,
      is_saved: savedSet.has(r.id),
      completion_count: completionMap[r.id]?.count || 0,
      last_completed_at: completionMap[r.id]?.lastDate,
      has_reminder: Boolean(scheduleMap[r.id]),
      reminder_time: scheduleMap[r.id]?.time,
      reminder_schedule_type: scheduleMap[r.id]?.type,
    }));

    return { success: true, data: result };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load protection rituals.",
    };
  }
}

/**
 * Retrieves all protection rituals for an Astrologer.
 * Resolves astrologer's personal saved library & previously recommended rituals.
 */
export async function getAstrologerProtectionRitualsAction(): Promise<
  AuthResult<{ rituals: ProtectionRitual[]; astrologerProfileId: string }>
> {
  try {
    const { user } = await requireAstrologer();
    const admin = await createAdminClient("main");

    await ensureRitualCatalogSeeded(admin);

    // 1. Resolve astrologer profile
    const { data: astroProfile, error: astroErr } = await admin
      .from("astrologer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (astroErr || !astroProfile) {
      return { success: false, error: "Astrologer profile not found" };
    }

    // 2. Fetch all active rituals
    const { data: dbRituals, error: ritualErr } = await admin
      .from("protection_rituals")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (ritualErr || !dbRituals) {
      return { success: false, error: ritualErr?.message || "Failed to load rituals" };
    }

    // 3. Fetch astrologer's saved rituals
    let savedSet = new Set<string>();
    try {
      const { data: astroSaved } = await admin
        .from("astrologer_saved_rituals")
        .select("ritual_id")
        .eq("astrologer_id", astroProfile.id);

      if (astroSaved) {
        savedSet = new Set(astroSaved.map((s: any) => s.ritual_id));
      }
    } catch {
      // Table fallback
    }

    const rituals: ProtectionRitual[] = dbRituals.map((r: any) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      category: r.category,
      purpose: r.purpose,
      description: r.description,
      traditional_background: r.traditional_background,
      eligibility: r.eligibility,
      instructions: Array.isArray(r.instructions) ? r.instructions : [],
      duration_minutes: r.duration_minutes,
      required_materials: Array.isArray(r.required_materials) ? r.required_materials : [],
      precautions: r.precautions,
      contraindications: r.contraindications,
      alternative: r.alternative,
      frequency: r.frequency,
      is_saved: savedSet.has(r.id),
    }));

    return {
      success: true,
      data: { rituals, astrologerProfileId: astroProfile.id },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load astrologer rituals.",
    };
  }
}

/**
 * Toggles saving/favoriting a protection ritual for a Customer.
 */
export async function toggleSaveRitualAction(ritualId: string): Promise<AuthResult<{ isSaved: boolean }>> {
  try {
    const { user } = await requireAuth();
    const admin = await createAdminClient("main");

    const { data: existing } = await admin
      .from("customer_saved_rituals")
      .select("id")
      .eq("customer_id", user.id)
      .eq("ritual_id", ritualId)
      .maybeSingle();

    if (existing) {
      await admin
        .from("customer_saved_rituals")
        .delete()
        .eq("customer_id", user.id)
        .eq("ritual_id", ritualId);

      revalidatePath("/customer/protection-rituals");
      return { success: true, data: { isSaved: false } };
    } else {
      await admin
        .from("customer_saved_rituals")
        .insert({ customer_id: user.id, ritual_id: ritualId });

      revalidatePath("/customer/protection-rituals");
      return { success: true, data: { isSaved: true } };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update saved ritual.",
    };
  }
}

/**
 * Toggles saving/favoriting a protection ritual for an Astrologer's personal library.
 */
export async function toggleAstrologerSaveRitualAction(ritualId: string): Promise<AuthResult<{ isSaved: boolean }>> {
  try {
    const { user } = await requireAstrologer();
    const admin = await createAdminClient("main");

    const { data: astroProfile } = await admin
      .from("astrologer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!astroProfile) {
      return { success: false, error: "Astrologer profile not found." };
    }

    const { data: existing } = await admin
      .from("astrologer_saved_rituals")
      .select("id")
      .eq("astrologer_id", astroProfile.id)
      .eq("ritual_id", ritualId)
      .maybeSingle();

    if (existing) {
      await admin
        .from("astrologer_saved_rituals")
        .delete()
        .eq("astrologer_id", astroProfile.id)
        .eq("ritual_id", ritualId);

      revalidatePath("/astrologer/protection-rituals");
      return { success: true, data: { isSaved: false } };
    } else {
      await admin
        .from("astrologer_saved_rituals")
        .insert({ astrologer_id: astroProfile.id, ritual_id: ritualId });

      revalidatePath("/astrologer/protection-rituals");
      return { success: true, data: { isSaved: true } };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update astrologer saved ritual.",
    };
  }
}

/**
 * Records completion of a protection ritual for the authenticated customer.
 */
export async function recordRitualCompletionAction(
  ritualId: string,
  notes?: string
): Promise<AuthResult<{ completedAt: string }>> {
  try {
    const { user } = await requireAuth();
    const admin = await createAdminClient("main");

    const completedAt = new Date().toISOString();
    const { error } = await admin.from("customer_ritual_progress").insert({
      customer_id: user.id,
      ritual_id: ritualId,
      completed_at: completedAt,
      notes: notes?.trim() || null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/customer/protection-rituals");
    return { success: true, data: { completedAt } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to record completion.",
    };
  }
}

/**
 * Creates or updates an optional ritual schedule / reminder for the customer.
 */
export async function setCustomerRitualScheduleAction(
  ritualId: string,
  preferredTime: string,
  scheduleType: "daily" | "weekly" | "selected_days" = "daily",
  selectedDays: string[] = []
): Promise<AuthResult<{ active: boolean }>> {
  try {
    const { user } = await requireAuth();
    const admin = await createAdminClient("main");

    const { error } = await admin.from("customer_ritual_schedules").upsert(
      {
        customer_id: user.id,
        ritual_id: ritualId,
        preferred_time: preferredTime,
        schedule_type: scheduleType,
        selected_days: selectedDays,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "customer_id,ritual_id" }
    );

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/customer/protection-rituals");
    return { success: true, data: { active: true } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to configure schedule.",
    };
  }
}

/**
 * Removes or pauses a customer's ritual schedule.
 */
export async function removeCustomerRitualScheduleAction(ritualId: string): Promise<AuthResult<{ active: boolean }>> {
  try {
    const { user } = await requireAuth();
    const admin = await createAdminClient("main");

    await admin
      .from("customer_ritual_schedules")
      .delete()
      .eq("customer_id", user.id)
      .eq("ritual_id", ritualId);

    revalidatePath("/customer/protection-rituals");
    return { success: true, data: { active: false } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to remove schedule.",
    };
  }
}

/**
 * Astrologer prescribes / recommends a protection ritual to a client.
 */
export async function prescribeRitualToClientAction(
  payload: AstrologerRecommendationPayload
): Promise<AuthResult<{ success: boolean }>> {
  try {
    const { user } = await requireAstrologer();
    const admin = await createAdminClient("main");

    const { data: astroProfile } = await admin
      .from("astrologer_profiles")
      .select("id, display_name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!astroProfile) {
      return { success: false, error: "Astrologer profile not found" };
    }

    // Persist recommendation
    const { error } = await admin.from("astrologer_ritual_recommendations").insert({
      astrologer_id: astroProfile.id,
      customer_id: payload.customerId,
      ritual_id: payload.ritualId,
      booking_id: payload.bookingId || null,
      recommended_frequency: payload.recommendedFrequency || null,
      custom_guidance: payload.customGuidance?.trim() || null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    // Send customer notification via existing notification system
    try {
      await admin.from("customer_notifications").insert({
        customer_id: payload.customerId,
        title: "Protection Ritual Recommended",
        message: `${astroProfile.display_name || "Your Astrologer"} has recommended a sacred protection ritual for your consultation.`,
        type: "ritual_recommendation",
        is_read: false,
      });
    } catch {
      // Non-blocking notification delivery
    }

    return { success: true, data: { success: true } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to prescribe ritual.",
    };
  }
}

// Deprecated alias for backwards compatibility
export const getProtectionRitualsAction = getCustomerProtectionRitualsAction;
