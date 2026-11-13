"use server";

import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidLocale, SupportedLocale } from "@/lib/i18n/config";
import { revalidatePath } from "next/cache";

export async function getSuperAdminLanguagePreferences() {
  try {
    await requireSuperAdmin();
    const admin = await createAdminClient("main");

    const { data, error } = await admin
      .from("user_language_preferences")
      .select("*, profile:profiles(id, full_name, email, role)")
      .order("updated_at", { ascending: false });

    if (error) return { success: false, error: error.message, data: [] };
    return { success: true, data: data || [] };
  } catch (err: any) {
    return { success: false, error: err.message, data: [] };
  }
}

export async function updateSuperAdminUserLanguage(userId: string, newLocale: SupportedLocale) {
  try {
    await requireSuperAdmin();
    if (!isValidLocale(newLocale)) {
      return { success: false, error: "Invalid locale code" };
    }

    const admin = await createAdminClient("main");
    const { error } = await admin
      .from("user_language_preferences")
      .upsert({
        user_id: userId,
        locale: newLocale,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (error) return { success: false, error: error.message };
    revalidatePath("/super-admin/languages");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update user language." };
  }
}

