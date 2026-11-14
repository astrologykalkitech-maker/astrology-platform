"use server";

import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getSuperAdminSubscriptionAuditLogs(limit: number = 100) {
  try {
    await requireSuperAdmin();
    const admin = await createAdminClient("main");

    const { data: audits, error } = await admin
      .from("subscription_audit_logs")
      .select("*, astrologer:astrologer_profiles(id, display_name), actor:profiles(id, full_name), previous_plan:payment_plans!subscription_audit_logs_previous_plan_id_fkey(name), new_plan:payment_plans!subscription_audit_logs_new_plan_id_fkey(name)")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[getSuperAdminSubscriptionAuditLogs] Query error:", error);
      return { success: false, error: error.message, data: [] };
    }

    // Hydrate actor display / email identifier safely
    const formatted = (audits || []).map((a) => ({
      ...a,
      actor: {
        id: a.actor?.id || a.actor_id,
        full_name: a.actor?.full_name || a.actor_role || "System",
        display_name: a.actor?.full_name || (a.actor_role === "super_admin" ? "Platform Owner" : a.actor_role),
      },
    }));

    return { success: true, data: formatted };
  } catch (err: any) {
    return { success: false, error: err.message, data: [] };
  }
}

