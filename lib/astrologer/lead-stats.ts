import { getMyAssignedLeads } from "@/app/actions/astrologer-leads";

export type LeadCounts = { all: number; assigned: number; contacted: number; closed: number };

/** Uses totalCount from limit-1 queries, so no lead rows are transferred. */
export async function getLeadCounts(): Promise<LeadCounts | null> {
  const results = await Promise.all(
    (["all", "assigned", "contacted", "closed"] as const).map((status) =>
      getMyAssignedLeads({ status, limit: 1 })
    )
  );
  if (results.some((r) => !r.success)) return null;
  const n = (i: number) => {
    const r = results[i];
    return r.success ? (r.data.totalCount ?? 0) : 0;
  };
  return { all: n(0), assigned: n(1), contacted: n(2), closed: n(3) };
}
