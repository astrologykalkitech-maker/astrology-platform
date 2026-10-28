import { createAdminClient } from "@/lib/supabase/admin";
import { requireAstrologer } from "@/lib/auth/session";

export type LeadCounts = { all: number; assigned: number; contacted: number; closed: number };

/**
 * Fetches accurate lead statistics in a single consolidated query
 * instead of 4 separate server actions, joins, and database round-trips.
 */
export async function getLeadCounts(profileId?: string): Promise<LeadCounts | null> {
  try {
    const admin = await createAdminClient("main");
    let targetProfileId = profileId;

    if (!targetProfileId) {
      const { user } = await requireAstrologer();
      const { data: profile } = await admin
        .from("astrologer_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!profile) return null;
      targetProfileId = profile.id;
    }

    const { data: assignments, error } = await admin
      .from("lead_assignments")
      .select("status")
      .eq("astrologer_id", targetProfileId);

    if (error || !assignments) {
      return { all: 0, assigned: 0, contacted: 0, closed: 0 };
    }

    let assigned = 0;
    let contacted = 0;
    let closed = 0;

    for (const a of assignments) {
      if (a.status === "assigned") assigned++;
      else if (a.status === "contacted") contacted++;
      else if (a.status === "closed") closed++;
    }

    return {
      all: assignments.length,
      assigned,
      contacted,
      closed,
    };
  } catch (err) {
    console.error("[getLeadCounts Error]", err);
    return null;
  }
}
