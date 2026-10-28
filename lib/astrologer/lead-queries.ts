// =====================================================
// ASTROLOGER LEAD QUERIES (Phase 4)
// =====================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AstrologerLeadItem,
  AstrologerLeadsFilterOptions,
} from "@/lib/types/lead.types";

interface RawAssignmentRow {
  id: string;
  lead_id: string;
  astrologer_id: string;
  status: string;
  created_at: string;
  lead: {
    id: string;
    subject: string;
    message: string;
    status: string;
    created_at: string;
    customer: {
      id: string;
      full_name: string | null;
      phone?: string | null;
      date_of_birth?: string | null;
      time_of_birth?: string | null;
      birthplace?: string | null;
      gender?: string | null;
      avatar_url?: string | null;
    } | {
      id: string;
      full_name: string | null;
      phone?: string | null;
      date_of_birth?: string | null;
      time_of_birth?: string | null;
      birthplace?: string | null;
      gender?: string | null;
      avatar_url?: string | null;
    }[] | null;
  } | {
    id: string;
    subject: string;
    message: string;
    status: string;
    created_at: string;
    customer: {
      id: string;
      full_name: string | null;
      phone?: string | null;
      date_of_birth?: string | null;
      time_of_birth?: string | null;
      birthplace?: string | null;
      gender?: string | null;
      avatar_url?: string | null;
    } | {
      id: string;
      full_name: string | null;
      phone?: string | null;
      date_of_birth?: string | null;
      time_of_birth?: string | null;
      birthplace?: string | null;
      gender?: string | null;
      avatar_url?: string | null;
    }[] | null;
  }[] | null;
}

/**
 * Normalizes Supabase relational query output into a typed AstrologerLeadItem.
 */
function mapRawAssignmentToLeadItem(row: RawAssignmentRow): AstrologerLeadItem {
  const leadData = Array.isArray(row.lead) ? row.lead[0] : row.lead;

  let customerInfo = null;
  if (leadData && leadData.customer) {
    const rawCustomer = Array.isArray(leadData.customer)
      ? leadData.customer[0]
      : leadData.customer;
    if (rawCustomer) {
      customerInfo = {
        id: rawCustomer.id,
        full_name: rawCustomer.full_name ?? null,
        phone: rawCustomer.phone ?? null,
        date_of_birth: rawCustomer.date_of_birth ?? null,
        time_of_birth: rawCustomer.time_of_birth ?? null,
        birthplace: rawCustomer.birthplace ?? null,
        gender: (rawCustomer.gender as "male" | "female" | "other" | null) ?? null,
        avatar_url: rawCustomer.avatar_url ?? null,
      };
    }
  }

  return {
    id: row.id,
    lead_id: row.lead_id,
    astrologer_id: row.astrologer_id,
    status: row.status as AstrologerLeadItem["status"],
    created_at: row.created_at,
    lead: {
      id: leadData?.id ?? row.lead_id,
      subject: leadData?.subject ?? "",
      message: leadData?.message ?? "",
      status: (leadData?.status as AstrologerLeadItem["lead"]["status"]) ?? "new",
      created_at: leadData?.created_at ?? row.created_at,
      customer: customerInfo,
    },
  };
}

/**
 * Nested relational select query for lead assignments.
 * Relies on actual PostgreSQL foreign keys:
 * - lead_assignments.lead_id -> leads(id)
 * - leads.customer_id -> profiles(id)
 */
const NESTED_ASSIGNMENT_SELECT = `
  id,
  lead_id,
  astrologer_id,
  status,
  created_at,
  lead:leads!lead_assignments_lead_id_fkey (
    id,
    subject,
    message,
    status,
    created_at,
    customer:profiles!leads_customer_id_fkey (
      id,
      full_name,
      phone,
      date_of_birth,
      time_of_birth,
      birthplace,
      gender,
      avatar_url
    )
  )
`;

/**
 * Fetches assigned leads for the specified astrologer profile with status filtering & pagination.
 * Applies ownership filter (astrologer_id = astrologerProfileId) in addition to RLS defense in depth.
 */
export async function getAstrologerAssignedLeads(
  supabase: SupabaseClient,
  astrologerProfileId: string,
  options?: AstrologerLeadsFilterOptions
): Promise<{ leads: AstrologerLeadItem[]; totalCount: number }> {
  try {
    // Defense-in-depth: Ensure any direct leads targeting this astrologer have an assignment record
    try {
      const { data: directLeads } = await supabase
        .from("leads")
        .select("id, status, created_at")
        .eq("astrologer_id", astrologerProfileId);

      if (directLeads && directLeads.length > 0) {
        const { data: existingAssignments } = await supabase
          .from("lead_assignments")
          .select("lead_id")
          .eq("astrologer_id", astrologerProfileId);

        const assignedSet = new Set((existingAssignments || []).map((a) => a.lead_id));
        const missingAssignments = directLeads.filter((l) => !assignedSet.has(l.id));

        if (missingAssignments.length > 0) {
          const toInsert = missingAssignments.map((l) => ({
            lead_id: l.id,
            astrologer_id: astrologerProfileId,
            status: l.status === "closed" ? "closed" : l.status === "contacted" ? "contacted" : "assigned",
            created_at: l.created_at,
          }));
          await supabase.from("lead_assignments").insert(toInsert);
        }
      }
    } catch {
      // Non-blocking self-healing fallback
    }

    let query = supabase
      .from("lead_assignments")
      .select(NESTED_ASSIGNMENT_SELECT, { count: "exact" })
      .eq("astrologer_id", astrologerProfileId)
      .order("created_at", { ascending: false });

    // Apply optional status filter
    if (options?.status && options.status !== "all") {
      query = query.eq("status", options.status);
    }

    // Apply pagination
    const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);
    const offset = Math.max(options?.offset ?? 0, 0);

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to fetch assigned leads: ${error.message}`);
    }

    if (!data) {
      return { leads: [], totalCount: 0 };
    }

    const mapped = (data as unknown as RawAssignmentRow[]).map(mapRawAssignmentToLeadItem);

    return {
      leads: mapped,
      totalCount: count ?? mapped.length,
    };
  } catch (err) {
    throw err;
  }
}

/**
 * Fetches a single assigned lead by assignment ID for the specified astrologer profile.
 * Verifies that the assignment belongs strictly to this astrologer.
 */
export async function getAstrologerAssignedLeadById(
  supabase: SupabaseClient,
  astrologerProfileId: string,
  assignmentId: string
): Promise<AstrologerLeadItem | null> {
  try {
    // 1. Try resolving by assignment id or lead_id
    const { data, error } = await supabase
      .from("lead_assignments")
      .select(NESTED_ASSIGNMENT_SELECT)
      .eq("astrologer_id", astrologerProfileId)
      .or(`id.eq.${assignmentId},lead_id.eq.${assignmentId}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch assigned lead: ${error.message}`);
    }

    if (data) {
      return mapRawAssignmentToLeadItem(data as unknown as RawAssignmentRow);
    }

    // 2. Self-healing fallback: Check if a direct lead exists with id = assignmentId
    const { data: directLead } = await supabase
      .from("leads")
      .select("id, status, created_at")
      .eq("id", assignmentId)
      .eq("astrologer_id", astrologerProfileId)
      .maybeSingle();

    if (directLead) {
      const { data: newAssignment } = await supabase
        .from("lead_assignments")
        .insert({
          lead_id: directLead.id,
          astrologer_id: astrologerProfileId,
          status: directLead.status === "closed" ? "closed" : directLead.status === "contacted" ? "contacted" : "assigned",
        })
        .select(NESTED_ASSIGNMENT_SELECT)
        .single();

      if (newAssignment) {
        return mapRawAssignmentToLeadItem(newAssignment as unknown as RawAssignmentRow);
      }
    }

    return null;
  } catch (err) {
    throw err;
  }
}

