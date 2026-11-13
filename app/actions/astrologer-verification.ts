"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { requireAdminAccess, resolveAdminSession, requireSuperAdmin } from "@/lib/auth/admin-guard";
import { logAdminAction } from "@/lib/admin/audit";
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

export const ALL_VERIFICATION_STAGES: readonly VerificationStageName[] = [
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
  metadata?: Record<string, any>;
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

/**
 * Helper to resolve the astrologer's profile and user profile ID.
 */
export async function resolveAstrologerTarget(admin: any, astrologerId: string) {
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
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load verification overview", data: null };
  }
}

/**
 * Astrologer submits a verification stage with metadata.
 */
export async function submitVerificationStageAction(
  stageName: VerificationStageName,
  metadata: Record<string, any> = {}
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
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to submit verification stage" };
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
      // Update astrologer_profiles in DB1 ("main")
      await admin
        .from("astrologer_profiles")
        .update({
          approval_status: newApprovalStatus,
          review_notes: reviewerNotes ? reviewerNotes.trim() : null,
          reviewed_by: adminSession.user.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .or(`id.eq.${target.astrologerProfileId},user_id.eq.${target.userId}`);

      // Mirror to DB2 if configured
      try {
        const admin2 = await createAdminClient("admin");
        await admin2
          .from("astrologer_profiles")
          .update({
            approval_status: newApprovalStatus,
            review_notes: reviewerNotes ? reviewerNotes.trim() : null,
            reviewed_by: adminSession.user.id,
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

    // 3. Log administrative audit action
    try {
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
    } catch (auditErr) {
      console.warn("[updateVerificationStageReviewAction] Failed to log admin action:", auditErr);
    }

    revalidatePath("/super-admin/verification", "page");
    revalidatePath("/super-admin/listings", "page");
    revalidatePath("/customer/astrologers", "page");
    revalidatePath("/astrologer/profile", "page");

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to review verification stage" };
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
    }

    // 2. Authoritative listing status update in DB1
    const { error: profileErr } = await admin
      .from("astrologer_profiles")
      .update({
        approval_status: "approved",
        review_notes: notes ? notes.trim() : "Approved through Verification Command Center.",
        reviewed_by: adminSession.user.id,
        reviewed_at: nowIso,
        updated_at: nowIso,
      })
      .or(`id.eq.${target.astrologerProfileId},user_id.eq.${target.userId}`);

    if (profileErr) {
      return { success: false, error: `Failed to update listing approval: ${profileErr.message}` };
    }

    // 3. Mirror to secondary admin database (DB2)
    try {
      const admin2 = await createAdminClient("admin");
      await admin2
        .from("astrologer_profiles")
        .update({
          approval_status: "approved",
          review_notes: notes ? notes.trim() : "Approved through Verification Command Center.",
          reviewed_by: adminSession.user.id,
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

    // 5. Immutable audit logging
    try {
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
    } catch (auditErr) {
      console.warn("[approveAstrologerWithSyncAction] Audit error:", auditErr);
    }

    // 6. Instant cache revalidation across both admin and public routes
    revalidatePath("/super-admin/verification", "page");
    revalidatePath("/super-admin/listings", "page");
    revalidatePath("/super-admin/listings/ranking", "page");
    revalidatePath("/customer/astrologers", "page");
    revalidatePath("/customer/astrologers", "layout");
    revalidatePath("/astrologer/profile", "page");

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to approve and synchronize astrologer." };
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
  } catch (err: any) {
    return {
      success: false,
      reconciledCount: 0,
      report: [],
      error: err.message || "Failed to reconcile verification and listings.",
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
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to schedule interview" };
  }
}
