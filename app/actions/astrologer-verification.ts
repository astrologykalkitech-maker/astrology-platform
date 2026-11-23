"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveAdminSession, requireSuperAdmin } from "@/lib/auth/admin-guard";
import { logAdminAction, isRpcNotInstalledError } from "@/lib/admin/audit";
import { sanitizeLogMessage } from "@/lib/security/redact";
import { createInAppNotification } from "@/lib/notifications";
import type { ApprovalStatus } from "@/lib/types/database.types";

export type VerificationStageName =
  | "registration"
  | "personal_info"
  | "qualifications"
  | "certifications"
  | "experience"
  | "identity"
  | "documents"
  | "interview"
  | "test_consultation"
  | "probation"
  | "final_review";

export type VerificationStatus =
  | "not_started"
  | "pending"
  | "submitted"
  | "under_review"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "expired"
  | "failed";

const ALL_VERIFICATION_STAGES: readonly VerificationStageName[] = [
  "registration",
  "personal_info",
  "qualifications",
  "certifications",
  "experience",
  "identity",
  "documents",
  "interview",
  "test_consultation",
  "probation",
  "final_review",
] as const;

export interface VerificationStageRecord {
  id: string;
  astrologer_id: string;
  stage_name: VerificationStageName;
  status: VerificationStatus;
  reviewer_id?: string | null;
  reviewer_notes?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  metadata?: Record<string, unknown>;
}

export interface VerificationDocumentRecord {
  id: string;
  astrologer_id: string;
  document_type: string;
  title: string;
  file_path: string;
  file_size_bytes?: number | null;
  mime_type?: string | null;
  verification_status: "pending" | "under_review" | "verified" | "rejected" | "expired";
  rejection_reason?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  expires_at?: string | null;
}

type AdminClientType = Awaited<ReturnType<typeof createAdminClient>>;

/**
 * Helper to resolve the astrologer's profile and user profile ID.
 */
export async function resolveAstrologerTarget(
  admin: AdminClientType,
  astrologerId: string
) {
  // Check astrologer_profiles by id or user_id
  const { data: profile } = await admin
    .from("astrologer_profiles")
    .select("id, user_id, slug, display_name, approval_status, consultation_fee, city, state")
    .or(`id.eq.${astrologerId},user_id.eq.${astrologerId}`)
    .maybeSingle();

  if (profile) {
    return {
      astrologerProfileId: profile.id,
      userId: profile.user_id,
      slug: profile.slug,
      displayName: profile.display_name,
      approvalStatus: profile.approval_status as ApprovalStatus,
      consultationFee: profile.consultation_fee,
      city: profile.city,
      state: profile.state,
    };
  }

  // Check if astrologerId is public.profiles id directly
  const { data: userProfile } = await admin
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", astrologerId)
    .maybeSingle();

  if (userProfile) {
    return {
      astrologerProfileId: astrologerId,
      userId: userProfile.id,
      slug: null,
      displayName: userProfile.full_name,
      approvalStatus: "pending" as ApprovalStatus,
      consultationFee: null,
      city: null,
      state: null,
    };
  }

  return null;
}

/**
 * Retrieves all verification stages and documents for an astrologer.
 */
export async function getAstrologerVerificationOverview(targetAstrologerId?: string) {
  try {
    const adminSession = await resolveAdminSession();
    let callerUserId: string | null = adminSession ? adminSession.user.id : null;

    if (!callerUserId) {
      const user = await getCurrentUser();
      if (!user) {
        return { success: false, error: "Authentication required", data: null };
      }
      callerUserId = user.id;
    }

    const admin = await createAdminClient("main");
    let resolvedUserId = callerUserId;

    // Check if admin is inspecting another astrologer
    if (targetAstrologerId && targetAstrologerId !== callerUserId) {
      if (!adminSession) {
        return { success: false, error: "Unauthorized access to verification records", data: null };
      }
      const target = await resolveAstrologerTarget(admin, targetAstrologerId);
      if (target) {
        resolvedUserId = target.userId;
      } else {
        resolvedUserId = targetAstrologerId;
      }
    }

    const [stagesRes, docsRes, interviewsRes, probationsRes] = await Promise.all([
      admin
        .from("astrologer_verification_stages")
        .select("*")
        .eq("astrologer_id", resolvedUserId)
        .order("created_at", { ascending: true }),
      admin
        .from("astrologer_verification_documents")
        .select("*")
        .eq("astrologer_id", resolvedUserId)
        .order("created_at", { ascending: false }),
      admin
        .from("astrologer_interviews")
        .select("*")
        .eq("astrologer_id", resolvedUserId)
        .order("scheduled_at", { ascending: false }),
      admin
        .from("astrologer_probations")
        .select("*")
        .eq("astrologer_id", resolvedUserId)
        .maybeSingle(),
    ]);

    return {
      success: true,
      data: {
        stages: (stagesRes.data || []) as VerificationStageRecord[],
        documents: (docsRes.data || []) as VerificationDocumentRecord[],
        interviews: interviewsRes.data || [],
        probation: probationsRes.data || null,
      },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to load verification overview";
    return { success: false, error: errorMsg, data: null };
  }
}

/**
 * Astrologer submits a verification stage with metadata.
 */
export async function submitVerificationStageAction(
  stageName: VerificationStageName,
  metadata: Record<string, unknown> = {}
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return { success: false, error: "Authentication required" };
    }

    const admin = await createAdminClient("main");
    const { error } = await admin
      .from("astrologer_verification_stages")
      .upsert(
        {
          astrologer_id: user.id,
          stage_name: stageName,
          status: "submitted",
          submitted_at: new Date().toISOString(),
          metadata,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "astrologer_id,stage_name" }
      );

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/astrologer/profile");
    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to submit verification stage";
    return { success: false, error: errorMsg };
  }
}

/**
 * Super Admin or Consultant Admin reviews and updates an individual verification stage.
 */
export async function updateVerificationStageReviewAction({
  astrologerId,
  stageName,
  status,
  reviewerNotes,
}: {
  astrologerId: string;
  stageName: VerificationStageName;
  status: VerificationStatus;
  reviewerNotes?: string;
}): Promise<{ success: boolean; error?: string; code?: string }> {
  try {
    const adminSession = await resolveAdminSession();
    if (!adminSession) {
      return {
        success: false,
        error: "Authentication required: Super Admin privileges are required to review verification stages.",
      };
    }

    const admin = await createAdminClient("main");
    const target = await resolveAstrologerTarget(admin, astrologerId);

    if (!target) {
      return { success: false, error: "Astrologer profile not found" };
    }

    // BUSINESS RULE CHECK:
    // If the astrologer is already verified/approved, duplicate approval is strictly prohibited.
    if (status === "approved" && target.approvalStatus === "approved") {
      return {
        success: false,
        code: "ALREADY_VERIFIED",
        error: "ALREADY_VERIFIED: This astrologer has already been approved and verified. Duplicate approval is not permitted.",
      };
    }

    // For rejection or requesting edits, require a reason/reviewer notes
    if ((status === "changes_requested" || status === "rejected") && (!reviewerNotes || !reviewerNotes.trim())) {
      return {
        success: false,
        error: `Please provide reviewer notes explaining why this stage is being ${
          status === "rejected" ? "rejected" : "returned for edits"
        }.`,
      };
    }

    // Pre-mutation audit record (Attempt): Ensures audit pipeline is operational before stage review mutation
    const attemptAuditRes = await logAdminAction({
      actorId: adminSession.user.id,
      actorRole: adminSession.profile.role,
      action: `verification.stage_${status}.attempt`,
      targetType: "astrologer_verification",
      targetId: target.userId,
      reason: reviewerNotes || `Stage '${stageName}' review attempt (${status})`,
      beforeState: { stageName, previousApprovalStatus: target.approvalStatus },
      afterState: { stageName, status },
      outcome: "success",
    });

    if (!attemptAuditRes.success) {
      console.error("[updateVerificationStageReviewAction] Pre-mutation audit record failed:", attemptAuditRes.error);
      return {
        success: false,
        error: "Mandatory audit record failed; verification stage review halted.",
      };
    }

    // 1. Update verification stage (astrologer_id in astrologer_verification_stages references public.profiles.id)
    const { error: stageError } = await admin
      .from("astrologer_verification_stages")
      .upsert(
        {
          astrologer_id: target.userId,
          stage_name: stageName,
          status,
          reviewer_id: adminSession.user.id,
          reviewer_notes: reviewerNotes ? reviewerNotes.trim() : null,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "astrologer_id,stage_name" }
      );

    if (stageError) {
      console.error("[updateVerificationStageReviewAction] Stage upsert error:", stageError);
      await logAdminAction({
        actorId: adminSession.user.id,
        actorRole: adminSession.profile.role,
        action: `verification.stage_${status}.failure`,
        targetType: "astrologer_verification",
        targetId: target.userId,
        reason: stageError.message,
        outcome: "failure",
      });
      return { success: false, error: stageError.message };
    }

    // 2. Synchronize astrologer_profiles approval_status when final_review or rejection/edits is acted upon
    let newApprovalStatus: string | null = null;
    if (status === "approved" && stageName === "final_review") {
      newApprovalStatus = "approved";
    } else if (status === "rejected") {
      newApprovalStatus = "rejected";
    } else if (status === "changes_requested") {
      newApprovalStatus = "changes_requested";
    }

    if (newApprovalStatus) {
      // Check if admin user exists in DB1 public.profiles to satisfy FK constraint
      const { data: profileCheck } = await admin
        .from("profiles")
        .select("id")
        .eq("id", adminSession.user.id)
        .maybeSingle();

      const validReviewedBy = profileCheck ? adminSession.user.id : null;

      // Update astrologer_profiles in DB1 ("main")
      await admin
        .from("astrologer_profiles")
        .update({
          approval_status: newApprovalStatus,
          review_notes: reviewerNotes ? reviewerNotes.trim() : null,
          reviewed_by: validReviewedBy,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .or(`id.eq.${target.astrologerProfileId},user_id.eq.${target.userId}`);

      // Mirror to DB2 if configured
      try {
        const admin2 = await createAdminClient("admin");
        const { data: db2ProfileCheck } = await admin2
          .from("profiles")
          .select("id")
          .eq("id", adminSession.user.id)
          .maybeSingle();

        const db2ReviewedBy = db2ProfileCheck ? adminSession.user.id : null;

        await admin2
          .from("astrologer_profiles")
          .update({
            approval_status: newApprovalStatus,
            review_notes: reviewerNotes ? reviewerNotes.trim() : null,
            reviewed_by: db2ReviewedBy,
            reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .or(`id.eq.${target.astrologerProfileId},user_id.eq.${target.userId}`);
      } catch {
        // secondary DB optional
      }

      // Notify astrologer in-app
      const notifTitle =
        newApprovalStatus === "approved"
          ? "Profile & Listing Approved!"
          : newApprovalStatus === "rejected"
          ? "Profile Verification Update"
          : "Profile Corrections Requested";

      const notifMsg =
        newApprovalStatus === "approved"
          ? "Congratulations! Your astrologer profile and listing have been verified and approved by the Super Admin."
          : newApprovalStatus === "rejected"
          ? `Your verification application has been rejected. Reason: ${reviewerNotes || "Credentials not approved."}`
          : `Revisions have been requested on your profile: ${reviewerNotes || "Please review and update your documents."}`;

      await createInAppNotification({
        recipientUserId: target.userId,
        title: notifTitle,
        message: notifMsg,
        linkUrl: "/astrologer/profile",
        eventType: `verification_${newApprovalStatus}`,
      });
    }

    // 3. Post-mutation audit confirmation (Completed)
    await logAdminAction({
      actorId: adminSession.user.id,
      actorRole: adminSession.profile.role,
      action: `verification.stage_${status}`,
      targetType: "astrologer_verification",
      targetId: target.userId,
      reason: reviewerNotes || `Stage '${stageName}' set to ${status}`,
      beforeState: { stageName, previousApprovalStatus: target.approvalStatus },
      afterState: { stageName, status, newApprovalStatus },
      outcome: "success",
    });

    revalidatePath("/super-admin/verification", "page");
    revalidatePath("/super-admin/listings", "page");
    revalidatePath("/customer/astrologers", "page");
    revalidatePath("/astrologer/profile", "page");

    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to review verification stage";
    return { success: false, error: errorMsg };
  }
}

/**
 * Performs full final verification and automatic listing approval synchronization.
 * Validates eligibility, marks all mandatory stages approved, updates authoritative profile,
 * mirrors to secondary admin store, dispatches notification, and records audit trail.
 */
export async function approveAstrologerWithSyncAction({
  astrologerId,
  notes,
}: {
  astrologerId: string;
  notes?: string;
}): Promise<{ success: boolean; error?: string; code?: string }> {
  try {
    const adminSession = await resolveAdminSession();
    if (!adminSession) {
      return {
        success: false,
        error: "Authentication required: Super Admin privileges are required to approve astrologers.",
      };
    }

    const admin = await createAdminClient("main");
    const target = await resolveAstrologerTarget(admin, astrologerId);

    if (!target) {
      return { success: false, error: "Astrologer profile not found" };
    }

    // Guard duplicate approval
    if (target.approvalStatus === "approved") {
      return {
        success: false,
        code: "ALREADY_VERIFIED",
        error: "ALREADY_VERIFIED: This astrologer has already been approved and verified. Duplicate approval is not permitted.",
      };
    }

    const nowIso = new Date().toISOString();

    // 1. Try single transactional RPC if installed (Migration 073)
    const { data: rpcData, error: rpcErr } = await admin.rpc("admin_approve_astrologer_with_sync", {
      p_admin_id: adminSession.user.id,
      p_target_user_id: target.userId,
      p_stages: ALL_VERIFICATION_STAGES,
      p_review_notes: notes || "Full multi-stage verification and listing synchronization approved.",
    });

    if (!rpcErr && rpcData && typeof rpcData === "object" && (rpcData as Record<string, unknown>).success === true) {
      // Revalidate and dispatch notification
      await createInAppNotification({
        recipientUserId: target.userId,
        title: "Profile & Listing Approved!",
        message:
          "Congratulations! Your astrologer credentials and profile listing have been approved and activated by the Super Admin.",
        linkUrl: "/astrologer/profile",
        eventType: "verification_approved",
      });

      revalidatePath("/super-admin/verification", "page");
      revalidatePath("/super-admin/listings", "page");
      revalidatePath("/super-admin/listings/ranking", "page");
      revalidatePath("/customer/astrologers", "page");
      revalidatePath("/customer/astrologers", "layout");
      revalidatePath("/astrologer/profile", "page");

      return { success: true };
    }

    // If RPC executed without transport error but returned explicit failure or malformed payload, fail closed immediately
    if (!rpcErr) {
      const sanitizedRpcMsg = sanitizeLogMessage(
        typeof (rpcData as Record<string, unknown> | null)?.error === "string"
          ? ((rpcData as Record<string, unknown>).error as string)
          : "RPC returned unsuccessful status or malformed response."
      );
      await logAdminAction({
        actorId: adminSession.user.id,
        actorRole: adminSession.profile.role,
        action: "verification.full_approval_and_sync.failure",
        targetType: "astrologer_listing",
        targetId: target.userId,
        reason: sanitizedRpcMsg,
        outcome: "failure",
      });
      return {
        success: false,
        error: "Astrologer verification and approval was rejected by the database.",
      };
    }

    // Fail closed on any real database/authorization error, constraint, timeout, or missing internal function.
    // Fall back ONLY if the exact RPC function positively does not exist in the database (Migration not installed).
    if (rpcErr && !isRpcNotInstalledError(rpcErr, "admin_approve_astrologer_with_sync")) {
      const sanitizedCode = sanitizeLogMessage(rpcErr.code || "UNKNOWN");
      const sanitizedMsg = sanitizeLogMessage(rpcErr.message || "RPC execution error");
      console.error(
        `[approveAstrologerWithSyncAction] RPC execution failed (fail closed): code=${sanitizedCode}, msg=${sanitizedMsg}`
      );
      await logAdminAction({
        actorId: adminSession.user.id,
        actorRole: adminSession.profile.role,
        action: "verification.full_approval_and_sync.failure",
        targetType: "astrologer_listing",
        targetId: target.userId,
        reason: sanitizeLogMessage(`Atomic RPC failed: ${sanitizedCode} - ${sanitizedMsg}`),
        outcome: "failure",
      });
      return {
        success: false,
        error: "Atomic approval and synchronization failed in database guard.",
      };
    }

    // 2. Fallback: Pre-mutation audit record (Attempt) before sequential REST mutations (Only if RPC is not installed)
    const attemptAuditRes = await logAdminAction({
      actorId: adminSession.user.id,
      actorRole: adminSession.profile.role,
      action: "verification.full_approval_and_sync.attempt",
      targetType: "astrologer_listing",
      targetId: target.userId,
      reason: notes || "Full multi-stage verification and listing synchronization attempt.",
      beforeState: { previousApprovalStatus: target.approvalStatus },
      afterState: { approval_status: "approved" },
      outcome: "success",
    });

    if (!attemptAuditRes.success) {
      console.error("[approveAstrologerWithSyncAction] Pre-mutation audit record failed:", attemptAuditRes.error);
      return {
        success: false,
        error: "Mandatory audit record failed; astrologer verification approval halted.",
      };
    }

    // Fetch previous stages state for rollback compensation if profile update fails
    const { data: previousStages } = await admin
      .from("astrologer_verification_stages")
      .select("stage_name, status, reviewer_notes, reviewer_id, reviewed_at")
      .eq("astrologer_id", target.userId);

    // 1. Batch upsert all verification stages to 'approved'
    const stageRecords = ALL_VERIFICATION_STAGES.map((s) => ({
      astrologer_id: target.userId,
      stage_name: s,
      status: "approved",
      reviewer_id: adminSession.user.id,
      reviewer_notes: notes ? notes.trim() : `Approved by Super Admin on ${new Date().toLocaleDateString()}`,
      reviewed_at: nowIso,
      updated_at: nowIso,
    }));

    const { error: stagesErr } = await admin
      .from("astrologer_verification_stages")
      .upsert(stageRecords, { onConflict: "astrologer_id,stage_name" });

    if (stagesErr) {
      console.error("[approveAstrologerWithSyncAction] Stages upsert error:", stagesErr);
      await logAdminAction({
        actorId: adminSession.user.id,
        actorRole: adminSession.profile.role,
        action: "verification.full_approval_and_sync.failure",
        targetType: "astrologer_listing",
        targetId: target.userId,
        reason: stagesErr.message,
        outcome: "failure",
      });
      return { success: false, error: `Failed to update verification stages: ${stagesErr.message}` };
    }

    // 2. Authoritative listing status update in DB1
    const { data: profileCheck } = await admin
      .from("profiles")
      .select("id")
      .eq("id", adminSession.user.id)
      .maybeSingle();

    const validReviewedBy = profileCheck ? adminSession.user.id : null;

    const { error: profileErr } = await admin
      .from("astrologer_profiles")
      .update({
        approval_status: "approved",
        review_notes: notes ? notes.trim() : "Approved through Verification Command Center.",
        reviewed_by: validReviewedBy,
        reviewed_at: nowIso,
        updated_at: nowIso,
      })
      .or(`id.eq.${target.astrologerProfileId},user_id.eq.${target.userId}`);

    if (profileErr) {
      // Rollback compensation: Restore previous stages state to avoid inconsistency
      let compensationFailed = false;
      if (previousStages && previousStages.length > 0) {
        const rollbackRecords = previousStages.map((ps) => ({
          astrologer_id: target.userId,
          stage_name: ps.stage_name,
          status: ps.status,
          reviewer_id: ps.reviewer_id,
          reviewer_notes: ps.reviewer_notes,
          reviewed_at: ps.reviewed_at,
          updated_at: new Date().toISOString(),
        }));
        const { error: rbErr } = await admin
          .from("astrologer_verification_stages")
          .upsert(rollbackRecords, { onConflict: "astrologer_id,stage_name" });
        if (rbErr) {
          compensationFailed = true;
          console.error("[approveAstrologerWithSyncAction] CRITICAL: Stages rollback compensation failed:", rbErr.message);
        }
      }

      await logAdminAction({
        actorId: adminSession.user.id,
        actorRole: adminSession.profile.role,
        action: "verification.full_approval_and_sync.failure",
        targetType: "astrologer_listing",
        targetId: target.userId,
        reason: compensationFailed
          ? `Listing update failed (${profileErr.message}) AND stages rollback failed. Verification stages may be inconsistent.`
          : `Listing update failed (${profileErr.message}); verification stages rolled back to previous state.`,
        outcome: "failure",
      });

      return {
        success: false,
        error: compensationFailed
          ? `Failed to update listing approval: ${profileErr.message}. CRITICAL: Verification stages could not be restored automatically.`
          : `Failed to update listing approval: ${profileErr.message}. Verification stages were rolled back to their previous state.`,
      };
    }

    // 3. Mirror to secondary admin database (DB2)
    try {
      const admin2 = await createAdminClient("admin");
      const { data: db2ProfileCheck } = await admin2
        .from("profiles")
        .select("id")
        .eq("id", adminSession.user.id)
        .maybeSingle();

      const db2ReviewedBy = db2ProfileCheck ? adminSession.user.id : null;

      await admin2
        .from("astrologer_profiles")
        .update({
          approval_status: "approved",
          review_notes: notes ? notes.trim() : "Approved through Verification Command Center.",
          reviewed_by: db2ReviewedBy,
          reviewed_at: nowIso,
          updated_at: nowIso,
        })
        .or(`id.eq.${target.astrologerProfileId},user_id.eq.${target.userId}`);
    } catch {
      // Secondary store mirror is best effort
    }

    // 4. Dispatch notification to astrologer
    await createInAppNotification({
      recipientUserId: target.userId,
      title: "Profile & Listing Approved!",
      message:
        "Congratulations! Your astrologer credentials and profile listing have been approved and activated by the Super Admin.",
      linkUrl: "/astrologer/profile",
      eventType: "verification_approved",
    });

    // 5. Post-mutation audit confirmation (Completed)
    await logAdminAction({
      actorId: adminSession.user.id,
      actorRole: adminSession.profile.role,
      action: "verification.full_approval_and_sync",
      targetType: "astrologer_listing",
      targetId: target.userId,
      reason: notes || "Full multi-stage verification and listing synchronization approved.",
      beforeState: { previousApprovalStatus: target.approvalStatus },
      afterState: { approval_status: "approved" },
      outcome: "success",
    });

    // 6. Instant cache revalidation across both admin and public routes
    revalidatePath("/super-admin/verification", "page");
    revalidatePath("/super-admin/listings", "page");
    revalidatePath("/super-admin/listings/ranking", "page");
    revalidatePath("/customer/astrologers", "page");
    revalidatePath("/customer/astrologers", "layout");
    revalidatePath("/astrologer/profile", "page");

    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to approve and synchronize astrologer.";
    return { success: false, error: errorMsg };
  }
}

/**
 * Automated reconciliation between verification stages and astrologer listing records.
 * Identifies any discrepancies and applies idempotent, non-destructive synchronization.
 */
export async function reconcileAstrologerVerificationAndListingsAction(): Promise<{
  success: boolean;
  reconciledCount: number;
  report: Array<{
    astrologerId: string;
    displayName: string;
    previousStatus: string;
    resolvedStatus: string;
    actionTaken: string;
  }>;
  error?: string;
}> {
  try {
    await requireSuperAdmin();
    const admin = await createAdminClient("main");

    // Fetch all astrologer profiles from authoritative DB1
    const { data: astros, error: fetchErr } = await admin
      .from("astrologer_profiles")
      .select("id, user_id, display_name, approval_status, slug");

    if (fetchErr) {
      return { success: false, reconciledCount: 0, report: [], error: fetchErr.message };
    }

    const report: Array<{
      astrologerId: string;
      displayName: string;
      previousStatus: string;
      resolvedStatus: string;
      actionTaken: string;
    }> = [];

    let reconciledCount = 0;

    for (const astro of astros || []) {
      // Query verification stages for this astrologer
      const { data: stages } = await admin
        .from("astrologer_verification_stages")
        .select("stage_name, status")
        .eq("astrologer_id", astro.user_id);

      const stageMap = new Map((stages || []).map((s) => [s.stage_name, s.status]));

      const isFinalApproved = stageMap.get("final_review") === "approved";
      const hasAnyRejected = Array.from(stageMap.values()).includes("rejected");
      const hasAnyChangesRequested = Array.from(stageMap.values()).includes("changes_requested");

      // Case 1: Final review is approved in verification stages, but listing is still pending
      if (isFinalApproved && astro.approval_status !== "approved") {
        await admin
          .from("astrologer_profiles")
          .update({
            approval_status: "approved",
            updated_at: new Date().toISOString(),
          })
          .eq("id", astro.id);

        report.push({
          astrologerId: astro.id,
          displayName: astro.display_name,
          previousStatus: astro.approval_status,
          resolvedStatus: "approved",
          actionTaken: "Listing synchronized to Approved based on completed verification final_review.",
        });
        reconciledCount++;
      }
      // Case 2: Listing is approved in DB1, but verification stages table has not been initialized for them
      else if (astro.approval_status === "approved" && (!stages || stages.length === 0)) {
        const nowIso = new Date().toISOString();
        const backfilledStages = ALL_VERIFICATION_STAGES.map((s) => ({
          astrologer_id: astro.user_id,
          stage_name: s,
          status: "approved",
          reviewer_notes: "Synchronized with historical approved listing.",
          reviewed_at: nowIso,
          updated_at: nowIso,
        }));

        await admin
          .from("astrologer_verification_stages")
          .upsert(backfilledStages, { onConflict: "astrologer_id,stage_name" });

        report.push({
          astrologerId: astro.id,
          displayName: astro.display_name,
          previousStatus: "uninitialized stages",
          resolvedStatus: "approved",
          actionTaken: "Verification checklist backfilled to Approved matching authoritative approved listing.",
        });
        reconciledCount++;
      }
      // Case 3: Stages contain rejection but listing is not rejected/suspended
      else if (hasAnyRejected && astro.approval_status === "approved") {
        await admin
          .from("astrologer_profiles")
          .update({
            approval_status: "rejected",
            updated_at: new Date().toISOString(),
          })
          .eq("id", astro.id);

        report.push({
          astrologerId: astro.id,
          displayName: astro.display_name,
          previousStatus: astro.approval_status,
          resolvedStatus: "rejected",
          actionTaken: "Listing revoked to Rejected based on rejected verification stages.",
        });
        reconciledCount++;
      }
      // Case 4: Changes requested in verification stages
      else if (hasAnyChangesRequested && astro.approval_status === "approved") {
        await admin
          .from("astrologer_profiles")
          .update({
            approval_status: "changes_requested",
            updated_at: new Date().toISOString(),
          })
          .eq("id", astro.id);

        report.push({
          astrologerId: astro.id,
          displayName: astro.display_name,
          previousStatus: astro.approval_status,
          resolvedStatus: "changes_requested",
          actionTaken: "Listing adjusted to Changes Requested based on verification checklist.",
        });
        reconciledCount++;
      }
    }

    revalidatePath("/super-admin/verification", "page");
    revalidatePath("/super-admin/listings", "page");

    return {
      success: true,
      reconciledCount,
      report,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to reconcile verification and listings.";
    return {
      success: false,
      reconciledCount: 0,
      report: [],
      error: errorMsg,
    };
  }
}

/**
 * Schedules an official evaluation interview with the applicant astrologer.
 */
export async function scheduleAstrologerInterviewAction({
  astrologerId,
  scheduledAt,
  meetingUrl,
  timezone = "Asia/Kolkata",
}: {
  astrologerId: string;
  scheduledAt: string;
  meetingUrl?: string;
  timezone?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const adminSession = await resolveAdminSession();
    if (!adminSession) {
      return {
        success: false,
        error: "Authentication required: Super Admin privileges are required to schedule interviews.",
      };
    }

    const admin = await createAdminClient("main");
    const target = await resolveAstrologerTarget(admin, astrologerId);

    if (!target) {
      return { success: false, error: "Astrologer profile not found" };
    }

    const { error } = await admin.from("astrologer_interviews").insert({
      astrologer_id: target.userId,
      interviewer_id: adminSession.user.id,
      scheduled_at: scheduledAt,
      timezone,
      meeting_url: meetingUrl || null,
      status: "scheduled",
    });

    if (error) return { success: false, error: error.message };

    // Update interview stage status
    await admin.from("astrologer_verification_stages").upsert(
      {
        astrologer_id: target.userId,
        stage_name: "interview",
        status: "under_review",
        reviewer_id: adminSession.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "astrologer_id,stage_name" }
    );

    try {
      await logAdminAction({
        actorId: adminSession.user.id,
        actorRole: adminSession.profile.role,
        action: "verification.interview_scheduled",
        targetType: "astrologer_verification",
        targetId: target.userId,
        reason: `Interview scheduled at ${scheduledAt}`,
        afterState: { scheduledAt, meetingUrl, timezone },
        outcome: "success",
      });
    } catch {
      // ignore audit logging error
    }

    revalidatePath("/super-admin/verification", "page");
    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to schedule interview";
    return { success: false, error: errorMsg };
  }
}

/**
 * Super Admin or Consultant Admin reviews and updates the verification status of an individual document.
 */
export async function updateVerificationDocumentReviewAction({
  documentId,
  verificationStatus,
  rejectionReason,
}: {
  documentId: string;
  verificationStatus: "verified" | "rejected" | "under_review";
  rejectionReason?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const adminSession = await resolveAdminSession();
    if (!adminSession) {
      return {
        success: false,
        error: "Authentication required: Super Admin privileges are required to review documents.",
      };
    }

    if (verificationStatus === "rejected" && (!rejectionReason || !rejectionReason.trim())) {
      return {
        success: false,
        error: "Rejection reason is required when rejecting a document.",
      };
    }

    const admin = await createAdminClient("main");

    const { data: doc, error: fetchErr } = await admin
      .from("astrologer_verification_documents")
      .select("id, astrologer_id, document_type, title, verification_status")
      .eq("id", documentId)
      .maybeSingle();

    if (fetchErr || !doc) {
      return { success: false, error: "Verification document not found." };
    }

    const { error: updateErr } = await admin
      .from("astrologer_verification_documents")
      .update({
        verification_status: verificationStatus,
        rejection_reason: verificationStatus === "rejected" ? rejectionReason?.trim() || null : null,
        reviewed_by: adminSession.user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    // Notify astrologer of document decision
    try {
      await createInAppNotification({
        recipientUserId: doc.astrologer_id,
        title: verificationStatus === "verified" ? "KYC Document Verified" : "KYC Document Update",
        message:
          verificationStatus === "verified"
            ? `Your document "${doc.title}" has been successfully verified.`
            : `Your document "${doc.title}" was rejected: ${rejectionReason || "Please re-upload a clear copy."}`,
        linkUrl: "/astrologer/profile",
        eventType: `doc_${verificationStatus}`,
        metadata: { document_id: documentId, document_type: doc.document_type },
      });
    } catch {
      // Non-blocking notification
    }

    // Audit log document review
    try {
      await logAdminAction({
        actorId: adminSession.user.id,
        actorRole: adminSession.profile.role,
        action: `verification.document_${verificationStatus}`,
        targetType: "astrologer_document",
        targetId: documentId,
        reason: rejectionReason || `Document marked as ${verificationStatus}`,
        beforeState: { status: doc.verification_status },
        afterState: { status: verificationStatus },
        outcome: "success",
      });
    } catch {
      // Non-blocking audit log
    }

    revalidatePath("/super-admin/verification", "page");
    revalidatePath("/astrologer/profile", "page");
    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to review document";
    return { success: false, error: errorMsg };
  }
}

