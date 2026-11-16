"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { getCurrentUser, requireCustomer, requireAuth } from "@/lib/auth/session";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { logAdminAction } from "@/lib/admin/audit";

export type DeletionStatus =
  | "NONE"
  | "REQUESTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "SCHEDULED"
  | "CANCELLED"
  | "REJECTED"
  | "COMPLETED"
  | "grace_period" // Legacy compatibility
  | "processing";

export interface AccountDeletionRecord {
  id: string;
  user_id: string;
  user_type?: "customer" | "astrologer";
  reason: string | null;
  status: DeletionStatus;
  scheduled_deletion_at: string;
  completed_at?: string | null;
  cancelled_at?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  rejection_reason?: string | null;
  admin_notes?: string | null;
  created_at: string;
  updated_at?: string;
  user?: {
    id: string;
    full_name: string;
    email?: string;
    role: string;
    phone?: string;
  } | null;
}

export interface PrivacyConsentRecord {
  purpose: string;
  is_granted: boolean;
  version: string;
  revoked_at?: string | null;
  created_at: string;
}

/**
 * Normalizes legacy and standard database status values into standard UI states.
 */
function normalizeDeletionStatus(rawStatus?: string | null): DeletionStatus {
  if (!rawStatus) return "NONE";
  const s = rawStatus.toUpperCase();
  if (s === "GRACE_PERIOD" || s === "REQUESTED") return "SCHEDULED";
  if (s === "PROCESSING" || s === "UNDER_REVIEW") return "UNDER_REVIEW";
  if (s === "APPROVED") return "APPROVED";
  if (s === "SCHEDULED") return "SCHEDULED";
  if (s === "CANCELLED") return "CANCELLED";
  if (s === "REJECTED") return "REJECTED";
  if (s === "COMPLETED") return "COMPLETED";
  return "REQUESTED";
}

// ============================================================================
// 1. USER PRIVACY & CONSENT ACTIONS (Customer & Astrologer)
// ============================================================================

/**
 * Fetches user consent records. Works for both authenticated customers and astrologers.
 */
export async function getUserPrivacyConsentsAction(): Promise<{
  success: boolean;
  consents?: PrivacyConsentRecord[];
  error?: string;
}> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Authentication required" };

    const admin = await createAdminClient("main");
    const { data, error } = await admin
      .from("privacy_consents")
      .select("purpose, is_granted, version, revoked_at, created_at")
      .eq("user_id", user.id);

    if (error) return { success: false, error: error.message };

    return {
      success: true,
      consents: data || [],
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to load consents" };
  }
}

/**
 * Backwards compatible alias for getCustomerPrivacyConsentsAction
 */
export async function getCustomerPrivacyConsentsAction() {
  return getUserPrivacyConsentsAction();
}

/**
 * Records or updates user consent for a specific processing purpose.
 */
export async function updateUserConsentAction({
  purpose,
  isGranted,
  version = "1.0",
}: {
  purpose: string;
  isGranted: boolean;
  version?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Authentication required" };

    const admin = await createAdminClient("main");
    const { error } = await admin.from("privacy_consents").upsert(
      {
        user_id: user.id,
        purpose,
        version,
        is_granted: isGranted,
        revoked_at: isGranted ? null : new Date().toISOString(),
      },
      { onConflict: "user_id,purpose,version" }
    );

    if (error) return { success: false, error: error.message };

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update consent" };
  }
}

// ============================================================================
// 2. ACCOUNT DELETION WORKFLOW (Database-Backed with Status Synchronization)
// ============================================================================

/**
 * Retrieves the authenticated user's active or latest account deletion request directly from Supabase.
 */
export async function getActiveAccountDeletionRequestAction(): Promise<{
  success: boolean;
  request: AccountDeletionRecord | null;
  normalizedStatus: DeletionStatus;
  canCancel: boolean;
  error?: string;
}> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, request: null, normalizedStatus: "NONE", canCancel: false, error: "Authentication required" };
    }

    const admin = await createAdminClient("main");
    const { data, error } = await admin
      .from("account_deletion_requests")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      return { success: false, request: null, normalizedStatus: "NONE", canCancel: false, error: error.message };
    }

    const rawReq = data?.[0] as AccountDeletionRecord | undefined;
    if (!rawReq) {
      return { success: true, request: null, normalizedStatus: "NONE", canCancel: false };
    }

    const norm = normalizeDeletionStatus(rawReq.status);
    // Can cancel if in grace period, requested, or under review before execution
    const isLive = norm === "SCHEDULED" || norm === "REQUESTED" || norm === "UNDER_REVIEW";
    const canCancel = isLive && new Date(rawReq.scheduled_deletion_at).getTime() > Date.now();

    return {
      success: true,
      request: rawReq,
      normalizedStatus: norm,
      canCancel,
    };
  } catch (err: any) {
    return {
      success: false,
      request: null,
      normalizedStatus: "NONE",
      canCancel: false,
      error: err.message || "Failed to check deletion status",
    };
  }
}

/**
 * Submits an authenticated account deletion request with a 30-day grace period,
 * notifications to Super Admin, and audit logging.
 */
export async function requestAccountDeletionAction(reason?: string): Promise<{
  success: boolean;
  request?: AccountDeletionRecord;
  scheduledDeletionAt?: string;
  error?: string;
}> {
  try {
    const { user, profile } = await requireAuth();
    if (!user) return { success: false, error: "Authentication required" };

    const admin = await createAdminClient("main");

    // Check if an active deletion request already exists
    const { data: existing } = await admin
      .from("account_deletion_requests")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["requested", "grace_period", "REQUESTED", "UNDER_REVIEW", "SCHEDULED", "APPROVED"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (existing && existing.length > 0) {
      const activeReq = existing[0];
      return {
        success: true,
        request: activeReq,
        scheduledDeletionAt: activeReq.scheduled_deletion_at,
      };
    }

    const scheduledDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const userRole = profile?.role === "astrologer" ? "astrologer" : "customer";
    const userFullName = profile?.full_name || user.email || "Valued User";

    const insertPayload: any = {
      user_id: user.id,
      reason: reason?.trim() || "User requested permanent account closure",
      status: "SCHEDULED",
      scheduled_deletion_at: scheduledDate,
    };

    // Attempt insert with user_type
    try {
      insertPayload.user_type = userRole;
    } catch {}

    const { data: newRecord, error } = await admin
      .from("account_deletion_requests")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) {
      // Fallback for previous legacy check constraint if migration 059 is still completing
      if (error.message.includes("check constraint")) {
        insertPayload.status = "grace_period";
        delete insertPayload.user_type;
        const fallback = await admin.from("account_deletion_requests").insert(insertPayload).select("*").single();
        if (fallback.error) return { success: false, error: fallback.error.message };
        return { success: true, request: fallback.data as AccountDeletionRecord, scheduledDeletionAt: scheduledDate };
      }
      return { success: false, error: error.message };
    }

    // Notify Super Admin through in-app notification channel
    try {
      const { data: superAdmins } = await admin
        .from("profiles")
        .select("id")
        .eq("role", "super_admin");

      if (superAdmins && superAdmins.length > 0) {
        for (const sa of superAdmins) {
          await admin.from("customer_notifications").insert({
            customer_id: sa.id,
            title: "New Account Deletion Request",
            message: `${userRole === "astrologer" ? "Astrologer" : "Customer"} ${userFullName} has requested permanent account deletion (30-day grace period).`,
            link_url: `/super-admin/privacy-requests?id=${newRecord.id}`,
            event_type: "privacy_deletion_request",
            metadata: {
              requestId: newRecord.id,
              userId: user.id,
              userRole,
              userFullName,
            },
            is_read: false,
          });
        }
      }
    } catch (notifErr) {
      console.warn("[requestAccountDeletionAction] Super admin alert dispatch notice:", notifErr);
    }

    // Record audit log
    await logAdminAction({
      actorId: user.id,
      actorRole: userRole,
      action: "account.deletion_requested",
      targetType: "account_deletion_request",
      targetId: newRecord.id,
      reason: reason || "User requested deletion",
      afterState: { id: newRecord.id, scheduled_deletion_at: scheduledDate, status: newRecord.status },
    });

    revalidatePath("/customer/privacy");
    revalidatePath("/astrologer/privacy");
    revalidatePath("/super-admin/privacy-requests");

    return {
      success: true,
      request: newRecord as AccountDeletionRecord,
      scheduledDeletionAt: scheduledDate,
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to request account deletion" };
  }
}

/**
 * Cancels a pending account deletion request during the 30-day grace period.
 */
export async function cancelAccountDeletionAction(requestId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Authentication required" };

    const admin = await createAdminClient("main");

    // Fetch the request and ensure user ownership
    const { data: request, error: fetchErr } = await admin
      .from("account_deletion_requests")
      .select("*")
      .eq("id", requestId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchErr || !request) {
      return { success: false, error: "Deletion request not found or unauthorized." };
    }

    const norm = normalizeDeletionStatus(request.status);
    if (norm === "CANCELLED") {
      return { success: true };
    }
    if (norm === "COMPLETED") {
      return { success: false, error: "This account has already been permanently deleted." };
    }

    const { error: updateErr } = await admin
      .from("account_deletion_requests")
      .update({
        status: "CANCELLED",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (updateErr) {
      // Fallback for legacy lowercase check constraint
      if (updateErr.message.includes("check constraint")) {
        await admin.from("account_deletion_requests").update({ status: "cancelled" }).eq("id", requestId);
      } else {
        return { success: false, error: updateErr.message };
      }
    }

    // Audit log
    await logAdminAction({
      actorId: user.id,
      actorRole: "user",
      action: "account.deletion_cancelled",
      targetType: "account_deletion_request",
      targetId: requestId,
      reason: "User cancelled account deletion during grace period",
      beforeState: { status: request.status },
      afterState: { status: "CANCELLED" },
    });

    revalidatePath("/customer/privacy");
    revalidatePath("/astrologer/privacy");
    revalidatePath("/super-admin/privacy-requests");

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to cancel account deletion" };
  }
}

// ============================================================================
// 3. PERSONAL DATA EXPORT (Right to Portability)
// ============================================================================

/**
 * Initiates an authorized Customer Data Export package.
 */
export async function requestCustomerDataExportAction() {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Authentication required" };

    const admin = await createAdminClient("main");

    const [profileRes, bookingsRes, pujasRes, kundlisRes, consentRes] = await Promise.all([
      admin.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      admin.from("customer_bookings").select("*").eq("customer_id", user.id),
      admin.from("puja_bookings").select("*").eq("customer_id", user.id),
      admin.from("kundlis").select("*").eq("user_id", user.id),
      admin.from("privacy_consents").select("*").eq("user_id", user.id),
    ]);

    const exportPackage = {
      exportTimestamp: new Date().toISOString(),
      userId: user.id,
      accountType: "customer",
      profile: profileRes.data || null,
      consultations: bookingsRes.data || [],
      pujaBookings: pujasRes.data || [],
      savedKundlis: kundlisRes.data || [],
      consentHistory: consentRes.data || [],
    };

    return { success: true, exportPackage };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to generate customer data export" };
  }
}

/**
 * Initiates an authorized Astrologer Personal Data Export package.
 */
export async function requestAstrologerDataExportAction() {
  try {
    const { user, profile } = await requireAuth();
    if (!user) return { success: false, error: "Authentication required" };

    const admin = await createAdminClient("main");

    const [profileRes, astroProfileRes, bookingsRes, pujasRes, reviewsRes, consentRes] = await Promise.all([
      admin.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      admin.from("astrologer_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      admin.from("customer_bookings").select("id, scheduled_at, status, consultation_mode, duration_minutes, fee_amount, created_at").eq("astrologer_id", user.id),
      admin.from("puja_bookings").select("id, preferred_date, time_slot, status, created_at").eq("astrologer_id", user.id),
      admin.from("astrologer_reviews").select("id, rating, review_text, created_at").eq("astrologer_id", user.id),
      admin.from("privacy_consents").select("*").eq("user_id", user.id),
    ]);

    const exportPackage = {
      exportTimestamp: new Date().toISOString(),
      userId: user.id,
      accountType: "astrologer",
      profile: profileRes.data || null,
      professionalDetails: astroProfileRes.data || null,
      consultationRecords: bookingsRes.data || [],
      pujaAssignments: pujasRes.data || [],
      reviewsAndRatings: reviewsRes.data || [],
      consentHistory: consentRes.data || [],
    };

    return { success: true, exportPackage };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to generate astrologer data export" };
  }
}

// ============================================================================
// 4. SUPER ADMIN PRIVACY & ACCOUNT DELETION MANAGEMENT
// ============================================================================

export interface SuperAdminDeletionListFilter {
  userType?: "all" | "customer" | "astrologer";
  status?: string;
  limit?: number;
  offset?: number;
}

/**
 * Super Admin: Lists all privacy and account deletion requests with user details and filtering.
 */
export async function getSuperAdminAccountDeletionRequests(filter?: SuperAdminDeletionListFilter): Promise<{
  success: boolean;
  requests: AccountDeletionRecord[];
  total: number;
  error?: string;
}> {
  try {
    await requireSuperAdmin();
    const admin = await createAdminClient("main");

    const limit = Math.min(Math.max(filter?.limit || 50, 1), 100);
    const offset = Math.max(filter?.offset || 0, 0);

    let query = admin
      .from("account_deletion_requests")
      .select("*, user:profiles(id, full_name, role, phone)", { count: "exact" })
      .order("created_at", { ascending: false });

    if (filter?.status && filter.status !== "all") {
      const s = filter.status.toUpperCase();
      if (s === "SCHEDULED") {
        query = query.in("status", ["SCHEDULED", "grace_period", "requested"]);
      } else if (s === "UNDER_REVIEW") {
        query = query.in("status", ["UNDER_REVIEW", "processing"]);
      } else {
        query = query.ilike("status", filter.status);
      }
    }

    const { data, count, error } = await query.range(offset, offset + limit - 1);

    if (error) return { success: false, requests: [], total: 0, error: error.message };

    // Format and filter by userType in memory if column user_type is being populated
    let records = (data || []).map((row: any) => {
      const norm = normalizeDeletionStatus(row.status);
      const inferredRole = row.user_type || row.user?.role || "customer";
      return {
        ...row,
        status: norm,
        user_type: inferredRole,
      } as AccountDeletionRecord;
    });

    if (filter?.userType && filter.userType !== "all") {
      records = records.filter((r) => r.user_type === filter.userType);
    }

    return {
      success: true,
      requests: records,
      total: count || records.length,
    };
  } catch (err: any) {
    return { success: false, requests: [], total: 0, error: err.message || "Failed to load deletion requests" };
  }
}

/**
 * Super Admin: Updates deletion request status (Approve, Reject, Cancel, Execute).
 */
export async function updateSuperAdminAccountDeletionStatusAction({
  requestId,
  action,
  notes,
  rejectionReason,
}: {
  requestId: string;
  action: "APPROVE" | "REJECT" | "CANCEL" | "EXECUTE_NOW";
  notes?: string;
  rejectionReason?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { user: adminUser } = await requireSuperAdmin();
    const admin = await createAdminClient("main");

    const { data: request, error: fetchErr } = await admin
      .from("account_deletion_requests")
      .select("*, user:profiles(id, full_name, role)")
      .eq("id", requestId)
      .maybeSingle();

    if (fetchErr || !request) {
      return { success: false, error: "Request not found." };
    }

    let newStatus: string = "SCHEDULED";
    const updateFields: any = {
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
      admin_notes: notes || null,
    };

    if (action === "APPROVE") {
      newStatus = "APPROVED";
      updateFields.status = "APPROVED";
    } else if (action === "REJECT") {
      newStatus = "REJECTED";
      updateFields.status = "REJECTED";
      updateFields.rejection_reason = rejectionReason || "Request rejected by administration.";
    } else if (action === "CANCEL") {
      newStatus = "CANCELLED";
      updateFields.status = "CANCELLED";
      updateFields.cancelled_at = new Date().toISOString();
    } else if (action === "EXECUTE_NOW") {
      newStatus = "COMPLETED";
      updateFields.status = "COMPLETED";
      updateFields.completed_at = new Date().toISOString();

      // EXECUTE ANONYMIZATION / DATA PURGE IN COMPLIANCE WITH FINANCIAL LAWS:
      // Anonymize personal profile fields while preserving payment / ledger integrity
      await admin.from("profiles").update({
        full_name: "Deactivated User",
        phone: null,
        date_of_birth: null,
        time_of_birth: null,
        birthplace: null,
        avatar_url: null,
      }).eq("id", request.user_id);
    }

    const { error: updateErr } = await admin
      .from("account_deletion_requests")
      .update(updateFields)
      .eq("id", requestId);

    if (updateErr) return { success: false, error: updateErr.message };

    // Record audit log
    await logAdminAction({
      actorId: adminUser.id,
      actorRole: "super_admin",
      action: `account_deletion.${action.toLowerCase()}`,
      targetType: "account_deletion_request",
      targetId: requestId,
      reason: notes || rejectionReason || `Super admin ${action}`,
      beforeState: { status: request.status },
      afterState: { status: newStatus },
    });

    revalidatePath("/super-admin/privacy-requests");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update deletion request" };
  }
}

/**
 * Automated Deletion Worker:
 * Processes eligible scheduled deletion requests past their 30-day grace period.
 * Anonymizes personal records while preserving financial ledger and transaction integrity.
 */
export async function processScheduledAccountDeletions(): Promise<{
  success: boolean;
  processedCount: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let processedCount = 0;

  try {
    const admin = await createAdminClient("main");
    const nowIso = new Date().toISOString();

    // Query active scheduled requests past grace period
    const { data: eligibleRequests, error: fetchErr } = await admin
      .from("account_deletion_requests")
      .select("*")
      .in("status", ["SCHEDULED", "grace_period", "requested", "APPROVED"])
      .lte("scheduled_deletion_at", nowIso)
      .limit(50);

    if (fetchErr) {
      return { success: false, processedCount: 0, errors: [fetchErr.message] };
    }

    if (!eligibleRequests || eligibleRequests.length === 0) {
      return { success: true, processedCount: 0, errors: [] };
    }

    for (const req of eligibleRequests) {
      try {
        // Re-check cancellation status immediately before deletion
        const { data: freshReq } = await admin
          .from("account_deletion_requests")
          .select("status, cancelled_at")
          .eq("id", req.id)
          .single();

        if (!freshReq || freshReq.status === "CANCELLED" || freshReq.cancelled_at) {
          continue;
        }

        // 1. Anonymize personal profile fields while preserving payment / ledger integrity
        await admin.from("profiles").update({
          full_name: "Deactivated User",
          phone: null,
          date_of_birth: null,
          time_of_birth: null,
          birthplace: null,
          avatar_url: null,
          gender: null,
        }).eq("id", req.user_id);

        // 2. If astrologer, suspend / mark profile closed
        if (req.user_type === "astrologer") {
          await admin.from("astrologer_profiles").update({
            approval_status: "suspended",
            display_name: "Deactivated Astrologer",
            phone: null,
            email: null,
            profile_photo_url: null,
            bio: "This account has been deactivated upon user request.",
          }).eq("user_id", req.user_id);
        }

        // 3. Mark deletion request as COMPLETED
        await admin.from("account_deletion_requests").update({
          status: "COMPLETED",
          completed_at: new Date().toISOString(),
          admin_notes: "Processed automatically by scheduled deletion worker.",
        }).eq("id", req.id);

        // 4. Record audit event
        await logAdminAction({
          actorId: "system-worker",
          actorRole: "super_admin",
          action: "account_deletion.automated_execution",
          targetType: "account_deletion_request",
          targetId: req.id,
          reason: "30-day grace period expired without cancellation",
          beforeState: { status: req.status },
          afterState: { status: "COMPLETED" },
        });

        processedCount++;
      } catch (itemErr: any) {
        errors.push(`Request ${req.id}: ${itemErr.message || itemErr}`);
      }
    }

    return {
      success: errors.length === 0,
      processedCount,
      errors,
    };
  } catch (err: any) {
    return {
      success: false,
      processedCount,
      errors: [err.message || "Failed to process scheduled account deletions"],
    };
  }
}
