import { createAdminClient } from "@/lib/supabase/admin";
import {
  checkAvailability,
  type AvailabilityCheck,
  type AvailabilityRule,
  type TimeOffRange,
} from "@/lib/availability/slots";

interface DbError {
  code?: string;
  message?: string;
}

/** True when the availability tables do not exist yet (migration 027 not applied). */
export function isMissingTableError(error: DbError | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /could not find the table|does not exist/i.test(error.message ?? "")
  );
}

export interface LoadedAvailability {
  rules: AvailabilityRule[];
  timeOff: (TimeOffRange & { id: string; kind: string })[];
  /** false when migration 027 is not applied (calendar is then unrestricted) */
  tablesAvailable: boolean;
}

/** Loads an astrologer's weekly rules and upcoming/ongoing time off using the service role. */
export async function loadAstrologerAvailability(astrologerId: string): Promise<LoadedAvailability> {
  const admin = await createAdminClient("main");

  const { data: ruleRows, error: ruleErr } = await admin
    .from("astrologer_availability_rules")
    .select("weekday, start_time, end_time, kind")
    .eq("astrologer_id", astrologerId)
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });

  if (isMissingTableError(ruleErr)) return { rules: [], timeOff: [], tablesAvailable: false };
  if (ruleErr) throw new Error(`Failed to load availability: ${ruleErr.message}`);

  const { data: offRows, error: offErr } = await admin
    .from("astrologer_time_off")
    .select("id, starts_at, ends_at, kind, reason")
    .eq("astrologer_id", astrologerId)
    .gte("ends_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(200);

  if (isMissingTableError(offErr)) return { rules: [], timeOff: [], tablesAvailable: false };
  if (offErr) throw new Error(`Failed to load time off: ${offErr.message}`);

  return {
    tablesAvailable: true,
    rules: (ruleRows ?? []).map((r) => ({
      weekday: r.weekday as number,
      start: String(r.start_time).slice(0, 5),
      end: String(r.end_time).slice(0, 5) === "00:00" ? "24:00" : String(r.end_time).slice(0, 5),
      kind: r.kind as "working" | "break",
    })),
    timeOff: (offRows ?? []).map((o) => ({
      id: o.id as string,
      startsAt: o.starts_at as string,
      endsAt: o.ends_at as string,
      reason: (o.reason as string | null) ?? null,
      kind: o.kind as string,
    })),
  };
}

/**
 * Server-side booking guard.
 * Hardened to fail closed when availability tables are missing or when an error occurs,
 * and honors configured time-off even if recurring weekly rules are not yet specified.
 */
export async function assertAstrologerAvailable(
  astrologerId: string,
  start: Date,
  durationMinutes: number
): Promise<AvailabilityCheck> {
  const data = await loadAstrologerAvailability(astrologerId);
  if (!data.tablesAvailable) {
    return {
      available: false,
      reason: "Consultation scheduling is temporarily unavailable because availability services are offline.",
    };
  }
  return checkAvailability({ rules: data.rules, timeOff: data.timeOff, start, durationMinutes });
}
