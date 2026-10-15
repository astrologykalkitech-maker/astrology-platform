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
    } | {
      id: string;
      full_name: string | null;
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
    } | {
      id: string;
      full_name: string | null;
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
      full_name
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
    const { data, error } = await supabase
      .from("lead_assignments")
      .select(NESTED_ASSIGNMENT_SELECT)
      .eq("id", assignmentId)
      .eq("astrologer_id", astrologerProfileId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch assigned lead: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    return mapRawAssignmentToLeadItem(data as unknown as RawAssignmentRow);
  } catch (err) {
    throw err;
  }
}
