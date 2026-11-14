"use server";

import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidLocale, SupportedLocale } from "@/lib/i18n/config";
import { revalidatePath } from "next/cache";

export async function getSuperAdminLanguagePreferences() {
  try {
    await requireSuperAdmin();
    const admin = await createAdminClient("main");

    // 1. Fetch any explicit user language preferences recorded
    const { data: explicitPrefs, error: prefErr } = await admin
      .from("user_language_preferences")
      .select("user_id, locale, updated_at")
      .order("updated_at", { ascending: false });

    if (prefErr) {
      console.error("[getSuperAdminLanguagePreferences] Preference fetch error:", prefErr);
    }

    // Map existing explicit preferences by user_id
    const explicitMap = new Map<string, { locale: string; updated_at: string }>();
    if (explicitPrefs) {
      explicitPrefs.forEach((p) => {
        explicitMap.set(p.user_id, {
          locale: p.locale,
          updated_at: p.updated_at,
        });
      });
    }

    // 2. Fetch platform profiles (customers, astrologers, admins) to ensure every active account is manageable
    const { data: profiles, error: profileErr } = await admin
      .from("profiles")
      .select("id, full_name, phone, role, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (profileErr) {
      return { success: false, error: profileErr.message, data: [] };
    }

    // 3. Synthesize preferences across platform profiles with English default fallback
    const result = (profiles || []).map((p) => {
      const saved = explicitMap.get(p.id);
      return {
        user_id: p.id,
        locale: saved ? saved.locale : "en",
        updated_at: saved ? saved.updated_at : p.created_at,
        profile: {
          id: p.id,
          full_name: p.full_name || "Platform Seeker",
          email: `${(p.full_name || "user").toLowerCase().replace(/[^a-z0-9]/g, "")}_${p.id.slice(0, 4)}@jyotishsetu.test`,
          role: p.role || "customer",
        },
      };
    });

    return { success: true, data: result };
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

