"use server";

import { requireAstrologer } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAstrologerCRMAggregate,
  type AstrologerCRMAggregateData,
} from "@/lib/astrologer/crm/aggregation";

export async function getAstrologerCRMDataAction(): Promise<{
  success: boolean;
  data?: AstrologerCRMAggregateData;
  error?: string;
}> {
  try {
    const { user } = await requireAstrologer();
    const admin = await createAdminClient("main");

    // 1. Resolve astrologer profile from auth.user.id
    const { data: astroProfile, error: astroErr } = await admin
      .from("astrologer_profiles")
      .select("id, display_name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (astroErr) {
      console.error("[getAstrologerCRMDataAction] astrologer_profiles lookup error:", astroErr);
      return { success: false, error: "Database error resolving astrologer profile." };
    }

    if (!astroProfile) {
      return { success: false, error: "Astrologer profile not found for this account." };
    }

    // 2. Fetch aggregated CRM data
    const result = await getAstrologerCRMAggregate(
      admin,
      astroProfile.id,
      astroProfile.display_name || "Astrologer"
    );

    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load CRM data.";
    console.error("[getAstrologerCRMDataAction] unexpected error:", err);
    return { success: false, error: message };
  }
}

