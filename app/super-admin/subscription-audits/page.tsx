import React from "react";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { getSuperAdminSubscriptionAuditLogs } from "@/app/actions/super-admin-subscription-audits";
import { SuperAdminSubscriptionAuditsClient } from "@/components/admin/SuperAdminSubscriptionAuditsClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Subscription Audit Logs | Karmic Ascension Super Admin",
  description: "Complete immutable audit trail of astrologer plan transitions, cancellations, and extensions.",
};

export default async function SuperAdminSubscriptionAuditsPage() {
  await requireSuperAdmin();
  const res = await getSuperAdminSubscriptionAuditLogs();
  const audits = res.success ? res.data : [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6">
      <div>
        <CardTitle>Subscription Lifecycle Audit Trail</CardTitle>
        <p className="text-xs text-muted">
          Immutable log of all plan changes, cancellations, extensions, and administrative overrides with full attribution.
        </p>
      </div>

      <SuperAdminSubscriptionAuditsClient initialAudits={audits} />
    </div>
  );
}

