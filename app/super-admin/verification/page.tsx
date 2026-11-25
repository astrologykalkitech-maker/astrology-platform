import { SuperAdminVerificationReviewClient } from "@/components/admin/SuperAdminVerificationReviewClient";
import { requireSuperAdminPage } from "@/lib/auth/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = {
  title: "Astrologer Verification & Onboarding | Super Admin",
  description: "Comprehensive multi-stage verification for astrologer applicants.",
};

export default async function SuperAdminVerificationPage() {
  await requireSuperAdminPage();
  const admin = await createAdminClient("main");

  // Fetch astrologer profiles
  const { data: astrologers, error } = await admin
    .from("astrologer_profiles")
    .select(`
      id,
      user_id,
      slug,
      display_name,
      approval_status,
      specializations,
      experience_years,
      city,
      state,
      created_at
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[SuperAdminVerificationPage] Error fetching astrologers:", error);
  }

  // Hydrate with auth emails from profiles table safely
  const userIds = [...new Set((astrologers || []).map((a) => a.user_id).filter(Boolean))];
  const profileMap: Record<string, { full_name?: string | null; email?: string | null }> = {};

  if (userIds.length > 0) {
    const { data: userProfiles } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);

    if (userProfiles) {
      userProfiles.forEach((p) => {
        profileMap[p.id] = p;
      });
    }
  }

  const hydrated = (astrologers || []).map((a) => ({
    id: a.id,
    user_id: a.user_id,
    full_name: a.display_name || profileMap[a.user_id]?.full_name || "New Applicant",
    display_name: a.display_name || "New Applicant",
    email: profileMap[a.user_id]?.email || "Unverified email",
    approval_status: a.approval_status || "pending",
    is_approved: a.approval_status === "approved",
    specializations: a.specializations || [],
    experience_years: a.experience_years,
    city: a.city,
    state: a.state,
    created_at: a.created_at,
  }));

  return <SuperAdminVerificationReviewClient astrologers={hydrated} />;
}

