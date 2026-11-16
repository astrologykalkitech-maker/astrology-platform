import { SuperAdminPrivacyRequestsClient } from "@/components/admin/SuperAdminPrivacyRequestsClient";
import { requireSuperAdminPage } from "@/lib/auth/admin-guard";
import { getSuperAdminAccountDeletionRequests } from "@/app/actions/privacy-retention";

export const metadata = {
  title: "Account Deletions & Privacy Governance | Super Admin",
  description: "Monitor, review, approve, and execute statutory 30-day account deletion requests for customers and astrologers.",
};

export default async function SuperAdminPrivacyRequestsPage() {
  await requireSuperAdminPage();
  const res = await getSuperAdminAccountDeletionRequests({ limit: 100 });

  return (
    <SuperAdminPrivacyRequestsClient
      initialRequests={res.success ? res.requests : []}
      totalCount={res.total || 0}
    />
  );
}
