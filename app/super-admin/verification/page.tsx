import { AdminShell } from "@/components/admin/AdminShell";
import { SuperAdminVerificationReviewClient } from "@/components/admin/SuperAdminVerificationReviewClient";
import { requireSuperAdminPage } from "@/lib/auth/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = {
  title: "Astrologer Verification & Onboarding | Super Admin",
  description: "Comprehensive multi-stage verification for astrologer applicants.",
};

export default async function SuperAdminVerificationPage() {
  const { profile, permissions } = await requireSuperAdminPage();
  const admin = await createAdminClient("main");

  const { data: astrologers } = await admin
    .from("astrologer_profiles")
    .select("id, full_name, email, is_approved, specializations, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <AdminShell
      displayName={profile.full_name || "Platform Owner"}
      role={profile.role}
      isSuperAdmin={true}
      permissions={permissions}
    >
      <SuperAdminVerificationReviewClient astrologers={astrologers || []} />
    </AdminShell>
  );
}

