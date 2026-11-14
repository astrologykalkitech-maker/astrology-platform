"use server";

import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function getSuperAdminCredentials() {
  try {
    await requireSuperAdmin();
    const admin = await createAdminClient("main");

    const { data, error } = await admin
      .from("astrologer_credentials")
      .select("*, astrologer:astrologer_profiles(id, display_name)")
      .order("created_at", { ascending: false });

    if (error) return { success: false, error: error.message, data: [] };
    return { success: true, data: data || [] };
  } catch (err: any) {
    return { success: false, error: err.message, data: [] };
  }
}

export async function reviewCredential(
  credentialId: string,
  status: "approved" | "rejected",
  notes?: string
) {
  try {
    const { user } = await requireSuperAdmin();
    const admin = await createAdminClient("main");

    const { error } = await admin
      .from("astrologer_credentials")
      .update({
        verification_status: status,
        verified_by: user.id,
        verified_at: new Date().toISOString(),
        admin_review_notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", credentialId);

    if (error) return { success: false, error: error.message };
    revalidatePath("/super-admin/credentials");
    revalidatePath("/customer/astrologers");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function toggleCelebrityBadge(
  astrologerId: string,
  isCelebrity: boolean,
  celebrityTitle?: string
) {
  try {
    const { user } = await requireSuperAdmin();
    const admin = await createAdminClient("main");

    const { error } = await admin
      .from("astrologer_profiles")
      .update({
        is_celebrity: isCelebrity,
        celebrity_title: isCelebrity ? celebrityTitle || "Celebrity Vedic Mentor" : null,
        celebrity_assigned_by: isCelebrity ? user.id : null,
        celebrity_assigned_at: isCelebrity ? new Date().toISOString() : null,
      })
      .eq("id", astrologerId);

    if (error) return { success: false, error: error.message };
    revalidatePath("/super-admin/astrologers");
    revalidatePath("/customer/astrologers");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

