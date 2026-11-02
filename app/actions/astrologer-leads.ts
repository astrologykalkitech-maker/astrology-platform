"use server";

// =====================================================
// ASTROLOGER LEAD MANAGEMENT SERVER ACTIONS (Phase 4)
// =====================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin/audit";
import { requireAstrologer } from "@/lib/auth/session";
import { toUuidOrNull } from "@/lib/security/postgrest";
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
import { createInAppNotification } from "@/lib/notifications";

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
    const { user } = await requireAstrologer();

    // 2. Validate filter options
    const filterValidation = validateAstrologerLeadsFilterOptions(rawOptions);
    if (!filterValidation.valid) {
      return {
        success: false,
        error: filterValidation.error ?? "Invalid lead filters.",
      };
    }

    const admin = await createAdminClient("main");

    // 3. Resolve astrologer_profiles ID for current user
    const { data: profile, error: profError } = await admin
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
      admin,
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
    const { user } = await requireAstrologer();

    // 2. Validate assignment ID
    if (!isValidUUID(rawAssignmentId)) {
      return {
        success: false,
        error: "Invalid assignment ID: must be a valid UUID.",
      };
    }

    const assignmentId = (rawAssignmentId as string).trim().toLowerCase();
    const admin = await createAdminClient("main");

    // 3. Resolve astrologer_profiles ID
    const { data: profile, error: profError } = await admin
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
      admin,
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

          if (targetStatus === "closed") {
            try {
              const { data: leadCustomer } = await db1Client
                .from("leads")
                .select("customer_id, subject")
                .eq("id", leadId)
                .maybeSingle();

              if (leadCustomer?.customer_id) {
                await createInAppNotification({
                  recipientUserId: leadCustomer.customer_id,
                  title: "Consultation Query Concluded",
                  message: `Your consultation "${leadCustomer.subject.slice(0, 40)}" has been completed and closed by the astrologer.`,
                  linkUrl: `/customer/enquiries/${leadId}`,
                  eventType: "lead_closed",
                  metadata: { lead_id: leadId },
                });
              }
            } catch {
              // Non-blocking notification
            }
          }
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
        // 7c. Record in admin audit trail so astrologer action is immediately visible on Super Admin dashboard & audit logs
        try {
          await logAdminAction({
            actorId: user.id,
            actorRole: "astrologer",
            action: `lead.assignment.${targetStatus}`,
            targetType: "lead",
            targetId: leadId,
            reason: `Astrologer updated lead assignment status to ${targetStatus}`,
            beforeState: {
              assignment_id,
              status: existing.status,
            },
            afterState: {
              assignment_id,
              status: targetStatus,
              lead_status: targetLeadStatus,
            },
            outcome: "success",
          });
        } catch (auditErr) {
          console.error("[updateAssignmentStatus] Audit log error:", auditErr);
        }
      }
    } catch (syncErr) {
      console.error("[updateAssignmentStatus] Lead sync warning:", syncErr);
    }

    // 8. Revalidate customer, astrologer, and admin paths so all dashboards update immediately
    revalidatePath(`/customer/enquiries/${existing.lead.id}`, "page");
    revalidatePath(`/astrologer/leads/${existing.lead.id}`, "page");
    revalidatePath("/customer", "page");
    revalidatePath("/customer/enquiries", "page");
    revalidatePath("/customer/notification", "page");
    revalidatePath("/astrologer/leads", "page");
    revalidatePath("/astrologer/dashboard", "page");
    revalidatePath("/super-admin", "page");
    revalidatePath("/super-admin/leads", "page");
    revalidatePath("/super-admin/analytics", "page");
    revalidatePath("/super-admin/audit-logs", "page");
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

/**
 * Loads messages for an assigned lead in the astrologer workspace.
 */
export async function getAstrologerLeadMessages(leadId: string) {
  try {
    const { user } = await requireAstrologer();
    const cleanLeadId = toUuidOrNull(leadId);
    if (!cleanLeadId) {
      return { success: false, error: "Invalid lead identifier." };
    }
    const admin = await createAdminClient("main");

    // Verify astrologer profile exists
    const { data: profile } = await admin
      .from("astrologer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) {
      return { success: false, error: "Astrologer profile not found." };
    }

    // Verify access either by assignment or direct lead match
    const { data: assignment } = await admin
      .from("lead_assignments")
      .select("id, lead_id")
      .or(`lead_id.eq.${cleanLeadId},id.eq.${cleanLeadId}`)
      .eq("astrologer_id", profile.id)
      .maybeSingle();

    let resolvedActualLeadId = assignment?.lead_id || cleanLeadId;
    let hasAccess = Boolean(assignment);

    if (!hasAccess) {
      const { data: directLead } = await admin
        .from("leads")
        .select("id")
        .eq("id", cleanLeadId)
        .eq("astrologer_id", profile.id)
        .maybeSingle();
      if (directLead) {
        hasAccess = true;
        resolvedActualLeadId = directLead.id;
      }
    }

    if (!hasAccess) {
      return { success: false, error: "Access denied to this lead." };
    }

    const { data: messages, error } = await admin
      .from("consultation_messages")
      .select("*")
      .eq("lead_id", resolvedActualLeadId)
      .order("created_at", { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: messages || [] };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load messages.",
    };
  }
}

/**
 * Sends a written reply or official prediction from the assigned astrologer.
 */
export async function sendAstrologerPredictionAction(payload: {
  leadId: string;
  message: string;
  predictionTitle?: string;
  isOfficialPrediction?: boolean;
}) {
  try {
    const { user } = await requireAstrologer();
    const cleanLeadId = toUuidOrNull(payload.leadId);
    if (!cleanLeadId) {
      return { success: false, error: "Invalid lead identifier." };
    }
    if ((payload.message || "").trim().length > 4000) {
      return { success: false, error: "Message must not exceed 4000 characters." };
    }
    const admin = await createAdminClient("main");

    const { data: profile } = await admin
      .from("astrologer_profiles")
      .select("id, display_name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) {
      return { success: false, error: "Astrologer profile not found." };
    }

    // Verify assignment or direct lead
    const { data: assignment } = await admin
      .from("lead_assignments")
      .select("id, lead_id")
      .or(`lead_id.eq.${cleanLeadId},id.eq.${cleanLeadId}`)
      .eq("astrologer_id", profile.id)
      .maybeSingle();

    let resolvedActualLeadId = assignment?.lead_id || cleanLeadId;
    let hasAccess = Boolean(assignment);

    if (!hasAccess) {
      const { data: directLead } = await admin
        .from("leads")
        .select("id")
        .eq("id", cleanLeadId)
        .eq("astrologer_id", profile.id)
        .maybeSingle();
      if (directLead) {
        hasAccess = true;
        resolvedActualLeadId = directLead.id;
      }
    }

    if (!hasAccess) {
      return { success: false, error: "You are not assigned to this consultation." };
    }

    // Insert prediction / message into consultation_messages using privileged admin client
    const { data: inserted, error } = await admin
      .from("consultation_messages")
      .insert({
        lead_id: resolvedActualLeadId,
        sender_id: user.id,
        sender_role: "astrologer",
        message: payload.message.trim(),
        prediction_title: payload.predictionTitle?.trim() || null,
        is_official_prediction: Boolean(payload.isOfficialPrediction),
      })
      .select("*")
      .single();

    if (error || !inserted) {
      return { success: false, error: error?.message || "Failed to post prediction." };
    }

    // Notify the customer reliably using service role client
    try {
      const { data: lead } = await admin
        .from("leads")
        .select("customer_id, subject")
        .eq("id", resolvedActualLeadId)
        .maybeSingle();

      if (lead?.customer_id) {
        await createInAppNotification({
          recipientUserId: lead.customer_id,
          title: payload.isOfficialPrediction
            ? "Astrological Prediction Received"
            : "New Message from Astrologer",
          message: `${profile.display_name} has provided written guidance: "${lead.subject.slice(0, 40)}"`,
          linkUrl: `/customer/enquiries/${resolvedActualLeadId}`,
          eventType: "consultation_message",
          metadata: { lead_id: resolvedActualLeadId, astrologer_id: profile.id },
        });
      }
    } catch (notifErr) {
      console.error("[sendAstrologerPredictionAction Notification Warning]", notifErr);
    }

    revalidatePath(`/astrologer/leads/${cleanLeadId}`, "page");
    revalidatePath(`/astrologer/leads/${resolvedActualLeadId}`, "page");
    revalidatePath("/astrologer/leads", "page");
    revalidatePath("/astrologer/dashboard", "page");
    revalidatePath(`/customer/enquiries/${resolvedActualLeadId}`, "page");
    revalidatePath("/customer/enquiries", "page");
    revalidatePath("/customer/notification", "page");
    revalidatePath("/customer", "page");

    return { success: true, data: inserted };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to send prediction.",
    };
  }
}


