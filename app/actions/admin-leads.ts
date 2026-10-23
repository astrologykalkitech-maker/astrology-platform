"use server";

// =====================================================
// ADMIN CENTRAL LEADS MANAGEMENT SERVER ACTIONS
// =====================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminPermission, requireAdminAccess } from "@/lib/auth/admin-guard";
import { logAdminAction } from "@/lib/admin/audit";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Lead,
  LeadAssignmentHistory,
  LeadInternalNote,
  LeadPriority,
  LeadQualificationStatus,
  LeadStatus,
} from "@/lib/types/database.types";
import type { AuthResult } from "@/lib/types/auth.types";
import {
  validateLeadAssignmentInput,
  VALID_QUALIFICATION_STATUSES,
} from "@/lib/validations/admin";
import { isValidUUID } from "@/lib/validations/lead";

export interface AdminLeadsFilter {
  status?: LeadStatus | "all";
  sourceType?: string;
  priority?: LeadPriority | "all";
  qualificationStatus?: LeadQualificationStatus | "all";
  search?: string;
  unassignedOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface AdminLeadItem extends Lead {
  customer_name?: string | null;
  customer_email?: string | null;
  assigned_astrologer_name?: string | null;
  assigned_astrologer_id?: string | null;
}

export interface AdminLeadsResultData {
  leads: AdminLeadItem[];
  totalCount: number;
}

export interface LeadFullDetails {
  lead: AdminLeadItem;
  assignmentHistory: LeadAssignmentHistory[];
  notes: LeadInternalNote[];
}

/**
 * Fetch central platform leads with search, filters, and pagination.
 * Scoped by permission: lead.read.all sees all leads; lead.read.assigned sees only assigned leads.
 */
export async function getAdminLeads(
  filter: AdminLeadsFilter = {}
): Promise<AuthResult<AdminLeadsResultData>> {
  try {
    const { user, permissions, isSuperAdmin } = await requireAdminAccess();
    const canReadAll = isSuperAdmin || permissions.includes("lead.read.all");
    const canReadAssigned = permissions.includes("lead.read.assigned");

    if (!canReadAll && !canReadAssigned) {
      return { success: false, error: "Access denied: insufficient lead permissions." };
    }

    const supabase = await createAdminClient();
    const limit = Math.min(Math.max(filter.limit ?? 25, 1), 100);
    const offset = Math.max(filter.offset ?? 0, 0);

    let query = supabase.from("leads").select("*", { count: "exact" });

    // Scope check: if user cannot read all, restrict to leads assigned to them or their astrologer profile
    if (!canReadAll && canReadAssigned) {
      // Find astrologer profile id for this user if exists
      const { data: ap } = await supabase
        .from("astrologer_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (ap) {
        query = query.or(`assigned_to.eq.${user.id},astrologer_id.eq.${ap.id}`);
      } else {
        query = query.eq("assigned_to", user.id);
      }
    }

    if (filter.status && filter.status !== "all") {
      query = query.eq("status", filter.status);
    }

    if (filter.sourceType && filter.sourceType !== "all") {
      query = query.eq("source_type", filter.sourceType);
    }

    if (filter.priority && filter.priority !== "all") {
      query = query.eq("priority", filter.priority);
    }

    if (filter.qualificationStatus && filter.qualificationStatus !== "all") {
      query = query.eq("qualification_status", filter.qualificationStatus);
    }

    if (filter.unassignedOnly) {
      query = query.is("assigned_to", null).is("astrologer_id", null);
    }

    if (filter.search && filter.search.trim()) {
      const term = `%${filter.search.trim()}%`;
      query = query.or(`subject.ilike.${term},message.ilike.${term},customer_name.ilike.${term},contact_email.ilike.${term}`);
    }

    query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

    const { data: rawLeads, count, error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    const leads: AdminLeadItem[] = (rawLeads as Lead[]).map((l) => ({
      ...l,
      customer_name: l.customer_name ?? "Direct Customer",
    }));

    return {
      success: true,
      data: {
        leads,
        totalCount: count ?? 0,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load leads.",
    };
  }
}


/**
 * Helper to verify that the calling admin has legitimate record-level access to a given lead.
 * - Super Admins and users with 'lead.read.all' have platform-wide access.
 * - Consultant Admins with 'lead.read.assigned' can access only if the lead is assigned to their user ID
 *   or to their astrologer profile ID.
 */
async function verifyLeadAccess(
  lead: Lead,
  user: { id: string },
  isSuperAdmin: boolean,
  permissions: string[],
  supabase: SupabaseClient
): Promise<boolean> {
  if (isSuperAdmin || permissions.includes("lead.read.all")) {
    return true;
  }

  if (!permissions.includes("lead.read.assigned")) {
    return false;
  }

  // Check direct assignment
  if (lead.assigned_to === user.id) {
    return true;
  }

  // Check if assigned to user's linked astrologer profile
  if (lead.astrologer_id) {
    const { data: ap } = await supabase
      .from("astrologer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (ap && ap.id === lead.astrologer_id) {
      return true;
    }
  }

  return false;
}

/**
 * Get comprehensive lead details including assignment history and internal notes.
 * Enforces record-level scope check before returning lead, history, and notes.
 */
export async function getLeadDetailsWithHistory(
  leadId: string
): Promise<AuthResult<LeadFullDetails>> {
  try {
    if (!isValidUUID(leadId)) {
      return { success: false, error: "Invalid lead ID." };
    }

    const { user, permissions, isSuperAdmin } = await requireAdminAccess();
    const supabase = await createAdminClient();

    // Fetch lead
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (leadErr || !lead) {
      return { success: false, error: "Lead not found." };
    }

    // Record-level scope check
    const hasAccess = await verifyLeadAccess(lead, user, isSuperAdmin, permissions, supabase);
    if (!hasAccess) {
      return {
        success: false,
        error: "Access denied: you do not have permission to view this lead record.",
      };
    }

    // Fetch assignment history
    const { data: history } = await supabase
      .from("lead_assignment_history")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });

    // Fetch internal notes
    const { data: notes } = await supabase
      .from("lead_internal_notes")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });

    return {
      success: true,
      data: {
        lead: lead as AdminLeadItem,
        assignmentHistory: (history as LeadAssignmentHistory[]) ?? [],
        notes: (notes as LeadInternalNote[]) ?? [],
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to fetch lead details.",
    };
  }
}

export interface BatchAssignItemResult {
  leadId: string;
  success: boolean;
  newStatus?: LeadStatus;
  error?: string;
}

export interface BatchAssignSummary {
  assignedCount: number;
  failureCount: number;
  results: BatchAssignItemResult[];
}

/**
 * Assign, reassign, or unassign a single lead.
 * Verifies recipient eligibility, checks approval_status, and executes transactional assignment.
 */
export async function assignLead(
  rawInput: unknown
): Promise<AuthResult<{ leadId: string; newStatus: LeadStatus }>> {
  try {
    const { user } = await requireAdminPermission("lead.assign");

    const validation = validateLeadAssignmentInput(rawInput);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const { leadId, astrologerId, reason } = validation.data;
    const supabase = await createAdminClient();

    // Verify recipient astrologer exists and is approved (if assigning)
    if (astrologerId !== null) {
      const { data: targetAstro, error: astroErr } = await supabase
        .from("astrologer_profiles")
        .select("id, approval_status")
        .eq("id", astrologerId)
        .maybeSingle();

      if (astroErr || !targetAstro) {
        return { success: false, error: "Target astrologer listing not found." };
      }

      if (targetAstro.approval_status !== "approved") {
        return {
          success: false,
          error: `Cannot assign lead to astrologer with status '${targetAstro.approval_status}'. Astrologer must be approved.`,
        };
      }
    }

    // Execute canonical atomic transactional lead assignment RPC.
    // The RPC handles:
    // - FOR UPDATE row-level locking on public.leads
    // - Verification of recipient eligibility (approval_status = 'approved')
    // - Authorization check (super_admin or lead.assign permission)
    // - Atomic update of leads, lead_assignments, lead_assignment_history, and admin_audit_logs
    const { data: rpcData, error: rpcError } = await supabase.rpc("perform_atomic_lead_assignment", {
      p_lead_id: leadId,
      p_target_astrologer_id: astrologerId,
      p_reason: reason ?? null,
      p_caller_id: user.id,
    });

    if (rpcError) {
      console.error("[Atomic Lead Assignment RPC Error]", {
        leadId,
        astrologerId,
        error: rpcError.message,
        code: rpcError.code,
      });

      return {
        success: false,
        error: rpcError.message || "Failed to assign lead via atomic transaction.",
      };
    }

    if (!rpcData || !rpcData.success) {
      return {
        success: false,
        error: "Atomic lead assignment transaction failed to commit.",
      };
    }

    // Mirror assignment to DB1 so Astrologer dashboard reflects it immediately
    try {
      const db1Client = await createAdminClient("main");
      if (astrologerId) {
        await db1Client.from("lead_assignments").upsert({
          lead_id: leadId,
          astrologer_id: astrologerId,
          status: "assigned",
        });
        await db1Client.from("leads").update({
          astrologer_id: astrologerId,
          status: "assigned",
        }).eq("id", leadId);
      } else {
        await db1Client.from("lead_assignments").delete().eq("lead_id", leadId);
        await db1Client.from("leads").update({
          astrologer_id: null,
          status: "new",
        }).eq("id", leadId);
      }
    } catch (syncErr) {
      console.warn("[Lead Assignment DB1 Sync Warning]", syncErr);
    }

    return {
      success: true,
      data: {
        leadId,
        newStatus: rpcData.status as LeadStatus,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to assign lead.",
    };
  }
}

/**
 * Bulk assign multiple leads to an eligible astrologer.
 * Returns detailed per-lead success and failure reports with atomic per-item execution.
 */
export async function batchAssignLeads(
  leadIds: string[],
  astrologerId: string,
  reason?: string
): Promise<AuthResult<BatchAssignSummary>> {
  try {
    const { user, profile } = await requireAdminPermission("lead.assign");

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return { success: false, error: "Please select at least one lead to assign." };
    }

    if (!isValidUUID(astrologerId)) {
      return { success: false, error: "Valid target astrologer is required." };
    }

    const results: BatchAssignItemResult[] = [];
    let assignedCount = 0;
    let failureCount = 0;

    for (const id of leadIds) {
      if (!isValidUUID(id)) {
        failureCount++;
        results.push({
          leadId: id,
          success: false,
          error: "Invalid UUID format.",
        });
        continue;
      }

      const res = await assignLead({
        leadId: id,
        astrologerId,
        reason: reason ? `[Batch] ${reason}` : "[Batch Assignment]",
      });

      if (res.success) {
        assignedCount++;
        results.push({
          leadId: id,
          success: true,
          newStatus: res.data.newStatus,
        });
      } else {
        failureCount++;
        results.push({
          leadId: id,
          success: false,
          error: res.error,
        });
      }
    }

    await logAdminAction({
      actorId: user.id,
      actorRole: profile.role,
      action: "lead.batch_assign",
      targetType: "lead_batch",
      targetId: `success:${assignedCount},fail:${failureCount}`,
      reason,
      outcome: failureCount === 0 ? "success" : "failure",
    });

    return {
      success: true,
      data: {
        assignedCount,
        failureCount,
        results,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Batch assignment failed.",
    };
  }
}

/**
 * Qualify or categorize a lead (e.g. mark qualified, duplicate, invalid).
 * Enforces record scope: caller must have platform-wide authority or have the lead assigned to them.
 */
export async function updateLeadQualification(
  leadId: string,
  qualificationStatus: LeadQualificationStatus,
  reason?: string
): Promise<AuthResult<void>> {
  try {
    const { user, profile, permissions, isSuperAdmin } = await requireAdminAccess();

    if (!isValidUUID(leadId)) {
      return { success: false, error: "Invalid lead ID." };
    }

    if (!VALID_QUALIFICATION_STATUSES.has(qualificationStatus)) {
      return { success: false, error: "Invalid qualification status." };
    }

    const supabase = await createAdminClient();

    // Fetch lead to verify record-level scope
    const { data: lead, error: fetchErr } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (fetchErr || !lead) {
      return { success: false, error: "Lead not found." };
    }

    const hasAccess = await verifyLeadAccess(lead, user, isSuperAdmin, permissions, supabase);
    if (!hasAccess) {
      return {
        success: false,
        error: "Access denied: you do not have permission to modify this lead record.",
      };
    }

    const { error } = await supabase
      .from("leads")
      .update({
        qualification_status: qualificationStatus,
        status: qualificationStatus === "invalid" || qualificationStatus === "duplicate" ? qualificationStatus : undefined,
        override_reason: reason ?? null,
      })
      .eq("id", leadId);

    if (error) {
      return { success: false, error: error.message };
    }

    await logAdminAction({
      actorId: user.id,
      actorRole: profile.role,
      action: `lead.qualify.${qualificationStatus}`,
      targetType: "lead",
      targetId: leadId,
      reason,
      outcome: "success",
    });

    return { success: true, data: undefined };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update lead qualification.",
    };
  }
}

/**
 * Add an internal note to a lead.
 * Enforces record scope: caller must have access to the lead before adding internal notes.
 */
export async function addLeadInternalNote(
  leadId: string,
  note: string,
  outcome?: string
): Promise<AuthResult<LeadInternalNote>> {
  try {
    const { user, permissions, isSuperAdmin } = await requireAdminAccess();

    if (!isValidUUID(leadId)) {
      return { success: false, error: "Invalid lead ID." };
    }

    if (!note || !note.trim()) {
      return { success: false, error: "Note content cannot be empty." };
    }

    const supabase = await createAdminClient();

    // Fetch lead to verify record-level scope
    const { data: lead, error: fetchErr } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (fetchErr || !lead) {
      return { success: false, error: "Lead not found." };
    }

    const hasAccess = await verifyLeadAccess(lead, user, isSuperAdmin, permissions, supabase);
    if (!hasAccess) {
      return {
        success: false,
        error: "Access denied: you do not have permission to add notes to this lead.",
      };
    }

    const { data, error } = await supabase
      .from("lead_internal_notes")
      .insert({
        lead_id: leadId,
        author_id: user.id,
        note: note.trim(),
        outcome: outcome?.trim() ?? null,
      })
      .select("*")
      .single();

    if (error || !data) {
      return { success: false, error: error?.message ?? "Failed to save note." };
    }

    return { success: true, data: data as LeadInternalNote };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to add internal note.",
    };
  }
}
