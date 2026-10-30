"use server";

// =====================================================
// ASTROLOGER AVAILABILITY MANAGEMENT
// Weekly working hours, breaks, holidays and temporary unavailability.
// =====================================================

import { revalidatePath } from "next/cache";
import { requireAstrologer } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { toUuidOrNull } from "@/lib/security/postgrest";
import { parseSchedulingDateTime } from "@/lib/astrologer/format";
import { isMissingTableError, loadAstrologerAvailability } from "@/lib/availability/server";
import {
  generateSlots,
  validateWeeklyRules,
  type AvailabilityRule,
} from "@/lib/availability/slots";
import type { AuthResult } from "@/lib/types/auth.types";

export interface AvailabilitySnapshot {
  rules: AvailabilityRule[];
  timeOff: { id: string; startsAt: string; endsAt: string; kind: string; reason: string | null }[];
  /** false when migration 027 has not been applied to the database */
  tablesAvailable: boolean;
}

const MAX_TIME_OFF_ROWS = 100;
const MAX_TIME_OFF_SPAN_DAYS = 365;
const MIGRATION_MISSING_MESSAGE =
  "Availability management is not enabled on this database yet. Ask the platform owner to apply migration 027.";

async function resolveAstrologerId(userId: string): Promise<string | null> {
  const admin = await createAdminClient("main");
  const { data } = await admin.from("astrologer_profiles").select("id").eq("user_id", userId).maybeSingle();
  return data?.id ?? null;
}

/** Loads the authenticated astrologer's availability. */
export async function getMyAvailabilityAction(): Promise<AuthResult<AvailabilitySnapshot>> {
  try {
    const { user } = await requireAstrologer();
    const astrologerId = await resolveAstrologerId(user.id);
    if (!astrologerId) return { success: false, error: "Astrologer profile not found." };

    const data = await loadAstrologerAvailability(astrologerId);
    return {
      success: true,
      data: {
        tablesAvailable: data.tablesAvailable,
        rules: data.rules,
        timeOff: data.timeOff.map((t) => ({
          id: t.id,
          startsAt: t.startsAt,
          endsAt: t.endsAt,
          kind: t.kind,
          reason: t.reason ?? null,
        })),
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to load availability." };
  }
}

/**
 * Replaces the weekly schedule. New rows are inserted first and the old rows are removed only
 * afterwards, so a failure never leaves the astrologer with an empty (= unrestricted) calendar.
 */
export async function saveWeeklyAvailabilityAction(rawRules: unknown): Promise<AuthResult<{ saved: number }>> {
  try {
    const { user } = await requireAstrologer();

    const limit = checkRateLimit(`availability:${user.id}`, 20, 60_000);
    if (!limit.allowed) {
      return { success: false, error: `Too many changes. Please wait ${limit.retryAfterSeconds} seconds.` };
    }

    const validation = validateWeeklyRules(rawRules);
    if (!validation.valid) return { success: false, error: validation.error };

    const astrologerId = await resolveAstrologerId(user.id);
    if (!astrologerId) return { success: false, error: "Astrologer profile not found." };

    const admin = await createAdminClient("main");

    const { data: oldRows, error: oldErr } = await admin
      .from("astrologer_availability_rules")
      .select("id")
      .eq("astrologer_id", astrologerId);
    if (isMissingTableError(oldErr)) return { success: false, error: MIGRATION_MISSING_MESSAGE };
    if (oldErr) return { success: false, error: "Failed to read the current schedule." };

    const oldIds = (oldRows ?? []).map((r) => r.id as string);

    if (validation.rules.length > 0) {
      const { error: insertErr } = await admin.from("astrologer_availability_rules").insert(
        validation.rules.map((r) => ({
          astrologer_id: astrologerId,
          weekday: r.weekday,
          start_time: r.start,
          end_time: r.end,
          kind: r.kind,
        }))
      );
      if (insertErr) {
        console.error("[availability] insert failed:", insertErr.message);
        return { success: false, error: "Failed to save availability. Your previous schedule is unchanged." };
      }
    }

    if (oldIds.length > 0) {
      const { error: deleteErr } = await admin.from("astrologer_availability_rules").delete().in("id", oldIds);
      if (deleteErr) {
        console.error("[availability] cleanup of previous rules failed:", deleteErr.message);
        return {
          success: false,
          error: "Saved, but the previous schedule could not be removed. Please save again to avoid duplicates.",
        };
      }
    }

    revalidatePath("/astrologer/availability");
    return { success: true, data: { saved: validation.rules.length } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to save availability." };
  }
}

/** Adds a holiday or temporary-unavailability range. `from`/`to` are datetime-local strings (Asia/Kolkata). */
export async function addTimeOffAction(input: {
  from: string;
  to: string;
  kind?: "holiday" | "temporary";
  reason?: string;
}): Promise<AuthResult<{ id: string }>> {
  try {
    const { user } = await requireAstrologer();

    const limit = checkRateLimit(`availability:${user.id}`, 20, 60_000);
    if (!limit.allowed) {
      return { success: false, error: `Too many changes. Please wait ${limit.retryAfterSeconds} seconds.` };
    }

    const from = parseSchedulingDateTime(input?.from);
    const to = parseSchedulingDateTime(input?.to);
    if (!from || !to) return { success: false, error: "Please provide valid start and end date/times." };
    if (to.getTime() <= from.getTime()) return { success: false, error: "The end must be after the start." };
    if (to.getTime() <= Date.now()) return { success: false, error: "Time off must end in the future." };
    if (to.getTime() - from.getTime() > MAX_TIME_OFF_SPAN_DAYS * 86_400_000) {
      return { success: false, error: `Time off cannot exceed ${MAX_TIME_OFF_SPAN_DAYS} days.` };
    }

    const kind = input.kind === "temporary" ? "temporary" : "holiday";
    const reason = (input.reason ?? "").trim().slice(0, 200) || null;

    const astrologerId = await resolveAstrologerId(user.id);
    if (!astrologerId) return { success: false, error: "Astrologer profile not found." };

    const admin = await createAdminClient("main");

    const { count, error: countErr } = await admin
      .from("astrologer_time_off")
      .select("id", { count: "exact", head: true })
      .eq("astrologer_id", astrologerId)
      .gte("ends_at", new Date().toISOString());
    if (isMissingTableError(countErr)) return { success: false, error: MIGRATION_MISSING_MESSAGE };
    if ((count ?? 0) >= MAX_TIME_OFF_ROWS) {
      return { success: false, error: "You have reached the maximum number of upcoming time-off entries." };
    }

    const { data, error } = await admin
      .from("astrologer_time_off")
      .insert({
        astrologer_id: astrologerId,
        starts_at: from.toISOString(),
        ends_at: to.toISOString(),
        kind,
        reason,
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("[availability] time-off insert failed:", error?.message);
      return { success: false, error: "Failed to save time off." };
    }

    revalidatePath("/astrologer/availability");
    return { success: true, data: { id: data.id as string } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to save time off." };
  }
}

/** Removes one of the caller's own time-off entries (ownership enforced in the query). */
export async function removeTimeOffAction(timeOffId: string): Promise<AuthResult<{ removed: boolean }>> {
  try {
    const { user } = await requireAstrologer();
    const id = toUuidOrNull(timeOffId);
    if (!id) return { success: false, error: "Invalid time-off identifier." };

    const astrologerId = await resolveAstrologerId(user.id);
    if (!astrologerId) return { success: false, error: "Astrologer profile not found." };

    const admin = await createAdminClient("main");
    const { data, error } = await admin
      .from("astrologer_time_off")
      .delete()
      .eq("id", id)
      .eq("astrologer_id", astrologerId)
      .select("id");

    if (isMissingTableError(error)) return { success: false, error: MIGRATION_MISSING_MESSAGE };
    if (error) return { success: false, error: "Failed to remove time off." };
    if (!data || data.length === 0) return { success: false, error: "Time-off entry not found." };

    revalidatePath("/astrologer/availability");
    return { success: true, data: { removed: true } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to remove time off." };
  }
}

/** Previews the bookable slots the platform will accept on a given day (YYYY-MM-DD, Asia/Kolkata). */
export async function previewMySlotsAction(
  date: string,
  durationMinutes: number
): Promise<AuthResult<{ restricted: boolean; slots: string[] }>> {
  try {
    const { user } = await requireAstrologer();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { success: false, error: "Invalid date." };
    const duration = Number(durationMinutes);
    if (!Number.isInteger(duration) || duration < 10 || duration > 180) {
      return { success: false, error: "Duration must be between 10 and 180 minutes." };
    }

    const astrologerId = await resolveAstrologerId(user.id);
    if (!astrologerId) return { success: false, error: "Astrologer profile not found." };

    const data = await loadAstrologerAvailability(astrologerId);
    const dayStart = parseSchedulingDateTime(`${date}T00:00`);
    if (!dayStart) return { success: false, error: "Invalid date." };

    const admin = await createAdminClient("main");
    const { data: bookings, error } = await admin
      .from("customer_bookings")
      .select("scheduled_at, duration_minutes")
      .eq("astrologer_id", astrologerId)
      .in("status", ["pending", "confirmed"])
      .gte("scheduled_at", new Date(dayStart.getTime() - 181 * 60_000).toISOString())
      .lt("scheduled_at", new Date(dayStart.getTime() + 86_400_000).toISOString());
    if (error) return { success: false, error: "Failed to read existing bookings." };

    const result = generateSlots({
      rules: data.rules,
      timeOff: data.timeOff,
      bookings: (bookings ?? []).map((b) => ({
        scheduledAt: b.scheduled_at as string,
        durationMinutes: b.duration_minutes as number,
      })),
      date,
      durationMinutes: duration,
    });

    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to preview slots." };
  }
}
