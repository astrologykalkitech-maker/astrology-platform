"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";

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
 * Retrieves all verification stages and documents for an astrologer.
 */
export async function getAstrologerVerificationOverview(targetAstrologerId?: string) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return { success: false, error: "Authentication required", data: null };
    }

    const admin = await createAdminClient("main");
    let resolvedAstrologerId = user.id;

    // Check if privileged admin is inspecting another astrologer
    if (targetAstrologerId && targetAstrologerId !== user.id) {
      const { data: profile } = await admin
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile || (profile.role !== "super_admin" && profile.role !== "consultant_admin")) {
        return { success: false, error: "Unauthorized access to verification records", data: null };
      }
      resolvedAstrologerId = targetAstrologerId;
    }

    const [stagesRes, docsRes, interviewsRes, probationsRes] = await Promise.all([
      admin
        .from("astrologer_verification_stages")
        .select("*")
        .eq("astrologer_id", resolvedAstrologerId)
        .order("created_at", { ascending: true }),
      admin
        .from("astrologer_verification_documents")
        .select("*")
        .eq("astrologer_id", resolvedAstrologerId)
        .order("created_at", { ascending: false }),
      admin
        .from("astrologer_interviews")
        .select("*")
        .eq("astrologer_id", resolvedAstrologerId)
        .order("scheduled_at", { ascending: false }),
      admin
        .from("astrologer_probations")
        .select("*")
        .eq("astrologer_id", resolvedAstrologerId)
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
 * Super Admin or Consultant Admin reviews and updates a verification stage.
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
}): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return { success: false, error: "Authentication required" };
    }

    const admin = await createAdminClient("main");
    const { data: reviewerProfile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!reviewerProfile || (reviewerProfile.role !== "super_admin" && reviewerProfile.role !== "consultant_admin")) {
      return { success: false, error: "Unauthorized: Admin privileges required" };
    }

    const { error } = await admin
      .from("astrologer_verification_stages")
      .upsert(
        {
          astrologer_id: astrologerId,
          stage_name: stageName,
          status,
          reviewer_id: user.id,
          reviewer_notes: reviewerNotes || null,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "astrologer_id,stage_name" }
      );

    if (error) {
      return { success: false, error: error.message };
    }

    // If final review is approved, update the astrologer's listing approval flag
    if (stageName === "final_review" && status === "approved") {
      await admin
        .from("astrologer_profiles")
        .update({
          is_approved: true,
          verification_badge: "Verified Master Astrologer",
          updated_at: new Date().toISOString(),
        })
        .eq("id", astrologerId);
    }

    revalidatePath("/super-admin/listings");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to review verification stage" };
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
    const user = await getCurrentUser();

    if (!user) return { success: false, error: "Authentication required" };

    const admin = await createAdminClient("main");
    const { data: reviewerProfile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!reviewerProfile || (reviewerProfile.role !== "super_admin" && reviewerProfile.role !== "consultant_admin")) {
      return { success: false, error: "Unauthorized: Admin privileges required" };
    }

    const { error } = await admin.from("astrologer_interviews").insert({
      astrologer_id: astrologerId,
      interviewer_id: user.id,
      scheduled_at: scheduledAt,
      timezone,
      meeting_url: meetingUrl || null,
      status: "scheduled",
    });

    if (error) return { success: false, error: error.message };

    // Update interview stage status
    await admin.from("astrologer_verification_stages").upsert(
      {
        astrologer_id: astrologerId,
        stage_name: "interview",
        status: "under_review",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "astrologer_id,stage_name" }
    );

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to schedule interview" };
  }
}

