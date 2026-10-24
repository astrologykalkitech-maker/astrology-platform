"use server";

// =====================================================
// ASTROLOGER LEAD MANAGEMENT SERVER ACTIONS (Phase 4)
// =====================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAstrologer } from "@/lib/auth/session";
import type {
  AstrologerLeadsResult,
  AstrologerLeadDetailResult,
  UpdateAssignmentStatusResult,
  AssignmentStatus,
} from "@/lib/types/lead.types";
import {
  isValidUUID,
  validateUpdateAssignmentStatusInput,
  validateStatusTransition,
  validateAstrologerLeadsFilterOptions,
} from "@/lib/validations/lead";
import {
  getAstrologerAssignedLeads,
  getAstrologerAssignedLeadById,
} from "@/lib/astrologer/lead-queries";

/**
 * Formats PostgreSQL trigger and RLS errors into clean, friendly error messages.
 */
function handleDatabaseError(error: { code?: string; message: string }): string {
  if (error.code === "42501") {
    // Insufficient privilege / Trigger rejection
    if (error.message.includes("Closed lead assignments are terminal")) {
      return "Closed lead assignments are terminal and cannot be modified.";
    }
    if (error.message.includes("Invalid status transition")) {
      return error.message;
    }
    if (error.message.includes("Assignment status must change")) {
      return "Assignment status must change to a valid next state.";
    }
    if (error.message.includes("immutable")) {
      return "Structural fields on lead assignments are immutable.";
    }
    return "Permission denied: you cannot modify this assignment.";
  }

  if (error.code === "23514") {
    return "Invalid assignment status provided.";
  }

  return error.message;
}

/**
 * Fetches all leads assigned to the currently authenticated astrologer.
 * Enforces astrologer role, resolves profile ID, and filters strictly by astrologer_id.
 */
export async function getMyAssignedLeads(
  rawOptions?: unknown
): Promise<AstrologerLeadsResult> {
  try {
    // 1. Enforce authentication and astrologer role
    const { user, target } = await requireAstrologer();

    // 2. Validate filter options
    const filterValidation = validateAstrologerLeadsFilterOptions(rawOptions);
    if (!filterValidation.valid) {
      return {
        success: false,
        error: filterValidation.error ?? "Invalid lead filters.",
      };
    }

    const supabase = await createClient(target);

    // 3. Resolve astrologer_profiles ID for current user
    const { data: profile, error: profError } = await supabase
      .from("astrologer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profError) {
      return { success: false, error: profError.message };
    }

    if (!profile) {
      return {
        success: false,
        error: "Astrologer profile not found. Please create your profile first.",
      };
    }

    // 4. Query assigned leads
    const { leads, totalCount } = await getAstrologerAssignedLeads(
      supabase,
      profile.id,
      filterValidation.data
    );

    return {
      success: true,
      data: { leads, totalCount },
    };
  } catch {
    return {
      success: false,
      error:
        "An unexpected error occurred while fetching assigned leads.",
    };
  }
}

/**
 * Fetches a single assigned lead by its assignment ID for the authenticated astrologer.
 */
export async function getMyAssignedLeadById(
  rawAssignmentId: unknown
): Promise<AstrologerLeadDetailResult> {
  try {
    // 1. Enforce authentication and astrologer role
    const { user, target } = await requireAstrologer();

    // 2. Validate assignment ID
    if (!isValidUUID(rawAssignmentId)) {
      return {
        success: false,
        error: "Invalid assignment ID: must be a valid UUID.",
      };
    }

    const assignmentId = (rawAssignmentId as string).trim().toLowerCase();
    const supabase = await createClient(target);

    // 3. Resolve astrologer_profiles ID
    const { data: profile, error: profError } = await supabase
      .from("astrologer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profError) {
      return { success: false, error: profError.message };
    }

    if (!profile) {
      return {
        success: false,
        error: "Astrologer profile not found. Please create your profile first.",
      };
    }

    // 4. Query lead detail verifying ownership
    const leadItem = await getAstrologerAssignedLeadById(
      supabase,
      profile.id,
      assignmentId
    );

    if (!leadItem) {
      return {
        success: false,
        error: "Assigned lead not found or access denied.",
      };
    }

    return {
      success: true,
      data: leadItem,
    };
  } catch {
    return {
      success: false,
      error:
        "An unexpected error occurred while fetching lead detail.",
    };
  }
}

/**
 * Updates the status of an assigned lead.
 * Enforces allowed status transitions (assigned -> contacted -> closed)
 * and guarantees that another astrologer's assignment cannot be modified.
 */
export async function updateAssignmentStatus(
  rawInput: unknown
): Promise<UpdateAssignmentStatusResult> {
  try {
    // 1. Enforce authentication and astrologer role
    const { user, target } = await requireAstrologer();

    // 2. Validate input at runtime
    const validation = validateUpdateAssignmentStatusInput(rawInput);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const { assignment_id, status: targetStatus } = validation.data;
    const supabase = await createClient(target);

    // 3. Resolve astrologer_profiles ID
    const { data: profile, error: profError } = await supabase
      .from("astrologer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profError) {
      return { success: false, error: profError.message };
    }

    if (!profile) {
      return {
        success: false,
        error: "Astrologer profile not found. Please create your profile first.",
      };
    }

    // 4. Fetch current assignment to verify existence and validate transition
    const existing = await getAstrologerAssignedLeadById(
      supabase,
      profile.id,
      assignment_id
    );

    if (!existing) {
      return {
        success: false,
        error: "Assigned lead not found or access denied.",
      };
    }

    // 5. Enforce strict status state machine
    const transitionCheck = validateStatusTransition(
      existing.status,
      targetStatus
    );
    if (!transitionCheck.valid) {
      return {
        success: false,
        error: transitionCheck.error ?? "Invalid status transition.",
      };
    }

    // 6. Execute update on lead_assignments
    // Both RLS and explicit query filter ensure ownership
    const { data, error } = await supabase
      .from("lead_assignments")
      .update({ status: targetStatus })
      .eq("id", assignment_id)
      .eq("astrologer_id", profile.id)
      .select("id, status, lead_id")
      .single();

    if (error) {
      const friendlyMessage = handleDatabaseError(error);
      return { success: false, error: friendlyMessage };
    }

    // 7. Synchronize public.leads status across both DB1 and DB2 (ensures customer dashboard, enquiries, and admin panels reflect immediately)
    try {
      const targetLeadStatus =
        targetStatus === "closed"
          ? "closed"
          : targetStatus === "contacted"
          ? "contacted"
          : undefined;

      if (targetLeadStatus) {
        const leadId = existing.lead.id;
        const now = new Date().toISOString();

        // 7a. Update DB1 (Authoritative Customer Database)
        try {
          const db1Client = await createAdminClient("main");
          await db1Client
            .from("leads")
            .update({ status: targetLeadStatus })
            .eq("id", leadId);
        } catch (db1Err) {
          console.error("[updateAssignmentStatus] DB1 lead sync error:", db1Err);
        }

        // 7b. Update DB2 (Super Admin Database) with closure/contact timestamps
        try {
          const db2Client = await createAdminClient("admin");
          const db2Payload: Record<string, unknown> = {
            status: targetLeadStatus,
          };
          if (targetLeadStatus === "closed") {
            db2Payload.closed_at = now;
          } else if (targetLeadStatus === "contacted") {
            db2Payload.first_contacted_at = now;
          }

          await db2Client
            .from("leads")
            .update(db2Payload)
            .eq("id", leadId);
        } catch (db2Err) {
          console.error("[updateAssignmentStatus] DB2 lead sync error:", db2Err);
        }
      }
    } catch (syncErr) {
      console.error("[updateAssignmentStatus] Lead sync warning:", syncErr);
    }

    // 8. Revalidate customer, astrologer, and admin paths so all dashboards update immediately
    revalidatePath("/customer", "page");
    revalidatePath("/customer/enquiries", "page");
    revalidatePath("/astrologer/leads", "page");
    revalidatePath("/astrologer/dashboard", "page");
    revalidatePath("/super-admin", "page");
    revalidatePath("/super-admin/leads", "page");
    revalidatePath("/super-admin/analytics", "page");
    revalidatePath("/admin", "page");
    revalidatePath("/admin/leads", "page");

    return {
      success: true,
      data: {
        assignment_id: data.id,
        status: data.status as AssignmentStatus,
      },
    };
  } catch {
    return {
      success: false,
      error:
        "An unexpected error occurred while updating assignment status.",
    };
  }
}
