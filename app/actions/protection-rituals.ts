"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/session";
import type { AuthResult } from "@/lib/types/auth.types";

export interface ProtectionRitual {
  id: string;
  title: string;
  category: "evil_eye" | "negative_energy" | "spiritual" | "home" | "personal" | "vedic";
  purpose: string;
  description: string;
  instructions: string[];
  duration_minutes: number;
  required_materials: string[];
  precautions?: string;
  frequency: string;
  is_saved?: boolean;
  completion_count?: number;
  last_completed_at?: string;
}

/**
 * Retrieves all active protection rituals along with the current customer's saved and completion state.
 */
export async function getProtectionRitualsAction(): Promise<AuthResult<ProtectionRitual[]>> {
  try {
    const { user } = await requireAuth();
    const admin = await createAdminClient("main");

    // 1. Fetch all active rituals
    const { data: rituals, error: ritualErr } = await admin
      .from("protection_rituals")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (ritualErr || !rituals) {
      return { success: false, error: ritualErr?.message || "Failed to load protection rituals." };
    }

    // 2. Fetch customer's saved favorites
    const { data: saved } = await admin
      .from("customer_saved_rituals")
      .select("ritual_id")
      .eq("customer_id", user.id);

    const savedSet = new Set((saved || []).map((s) => s.ritual_id));

    // 3. Fetch customer's completion progress
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

    const result: ProtectionRitual[] = rituals.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      purpose: r.purpose,
      description: r.description,
      instructions: Array.isArray(r.instructions) ? r.instructions : [],
      duration_minutes: r.duration_minutes,
      required_materials: Array.isArray(r.required_materials) ? r.required_materials : [],
      precautions: r.precautions,
      frequency: r.frequency,
      is_saved: savedSet.has(r.id),
      completion_count: completionMap[r.id]?.count || 0,
      last_completed_at: completionMap[r.id]?.lastDate,
    }));

    return { success: true, data: result };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load rituals.",
    };
  }
}

/**
 * Toggles saving/favoriting a protection ritual for the user.
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
 * Records completion of a protection ritual.
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

