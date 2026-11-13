"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";

export interface PrivacyConsentRecord {
  purpose: string;
  is_granted: boolean;
  version: string;
  revoked_at?: string | null;
  created_at: string;
}

/**
 * Fetches the currently authenticated customer's privacy consent records.
 */
export async function getCustomerPrivacyConsentsAction(): Promise<{
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
 * Records or revokes user consent for a specific processing purpose.
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

/**
 * Initiates an authorized Customer Data Export request (GDPR/DPDP compliance).
 */
export async function requestCustomerDataExportAction() {
  try {
    const user = await getCurrentUser();

    if (!user) return { success: false, error: "Authentication required" };

    const admin = await createAdminClient("main");

    // Gather exportable customer payload
    const [profileRes, bookingsRes, pujasRes, kundlisRes] = await Promise.all([
      admin.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      admin.from("customer_bookings").select("*").eq("customer_id", user.id),
      admin.from("puja_bookings").select("*").eq("customer_id", user.id),
      admin.from("kundlis").select("*").eq("user_id", user.id),
    ]);

    const exportPackage = {
      exportTimestamp: new Date().toISOString(),
      userId: user.id,
      profile: profileRes.data || null,
      consultations: bookingsRes.data || [],
      pujaBookings: pujasRes.data || [],
      savedKundlis: kundlisRes.data || [],
    };

    const { data: request, error: insErr } = await admin
      .from("customer_data_export_requests")
      .insert({
        customer_id: user.id,
        status: "ready",
        download_url: `data:application/json;charset=utf-8,${encodeURIComponent(
          JSON.stringify(exportPackage, null, 2)
        )}`,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        completed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insErr) return { success: false, error: insErr.message };

    return { success: true, request, exportPackage };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to request data export" };
  }
}

/**
 * Submits an authenticated account deletion request with grace period.
 */
export async function requestAccountDeletionAction(reason?: string) {
  try {
    const user = await getCurrentUser();

    if (!user) return { success: false, error: "Authentication required" };

    const admin = await createAdminClient("main");
    const scheduledDeletion = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await admin.from("account_deletion_requests").insert({
      user_id: user.id,
      reason: reason?.trim() || "User requested account closure",
      status: "grace_period",
      scheduled_deletion_at: scheduledDeletion,
    });

    if (error) return { success: false, error: error.message };

    return { success: true, scheduledDeletionAt: scheduledDeletion };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to request account deletion" };
  }
}

