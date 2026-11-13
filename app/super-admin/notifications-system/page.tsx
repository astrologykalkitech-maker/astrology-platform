import { AdminShell } from "@/components/admin/AdminShell";
import { SuperAdminNotificationDispatchClient } from "@/components/admin/SuperAdminNotificationDispatchClient";
import { requireSuperAdminPage } from "@/lib/auth/admin-guard";
import { getNotificationDeliveryMetrics } from "@/app/actions/enterprise-notifications";

export const metadata = {
  title: "Multi-Channel Notification Infrastructure | Super Admin",
  description: "Enterprise notification delivery monitoring, telemetry, and manual dispatch.",
};

export default async function SuperAdminNotificationsPage() {
  const { profile, permissions } = await requireSuperAdminPage();
  const res = await getNotificationDeliveryMetrics();

  return (
    <AdminShell
      displayName={profile.full_name || "Platform Owner"}
      role={profile.role}
      isSuperAdmin={true}
      permissions={permissions}
    >
      <SuperAdminNotificationDispatchClient
        stats={res.stats}
        recentFailures={res.stats?.recentFailures || []}
      />
    </AdminShell>
  );
}

