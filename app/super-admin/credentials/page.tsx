import { requireSuperAdminPage } from "@/lib/auth/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { SuperAdminCredentialsClient } from "@/components/admin/SuperAdminCredentialsClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Credential Verification | Super Admin",
  description: "Review and approve astrologer degrees, certifications, and celebrity badges.",
};

export default async function SuperAdminCredentialsPage() {
  await requireSuperAdminPage();
  const admin = await createAdminClient("main");

  const { data: credentials } = await admin
    .from("astrologer_credentials")
    .select(`
      *,
      astrologer:astrologer_profiles(id, display_name, slug)
    `)
    .order("created_at", { ascending: false })
    .limit(100);

  return <SuperAdminCredentialsClient initialCredentials={credentials || []} />;
}
