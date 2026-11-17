import { SuperAdminNotificationDispatchClient } from "@/components/admin/SuperAdminNotificationDispatchClient";
import { requireSuperAdminPage } from "@/lib/auth/admin-guard";
import {
  getNotificationDeliveryMetrics,
  getEligibleAstrologerRecipients,
} from "@/app/actions/enterprise-notifications";

export const metadata = {
  title: "Multi-Channel Notification Infrastructure | Super Admin",
  description: "Enterprise notification delivery monitoring, telemetry, and manual dispatch.",
};

export default async function SuperAdminNotificationsPage() {
  await requireSuperAdminPage();
  const [metricsRes, astrosRes] = await Promise.all([
    getNotificationDeliveryMetrics(),
    getEligibleAstrologerRecipients(),
  ]);

  return (
    <SuperAdminNotificationDispatchClient
      stats={metricsRes.stats}
      recentDeliveries={metricsRes.stats?.recentDeliveries || []}
      recentFailures={metricsRes.stats?.recentFailures || []}
      astrologers={astrosRes.success ? astrosRes.data : []}
    />
  );
}

