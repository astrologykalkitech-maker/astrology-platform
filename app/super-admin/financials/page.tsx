import React from "react";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { getSuperAdminFinancialMetrics } from "@/app/actions/super-admin-financials";
import { getSuperAdminPayoutRequestsAction } from "@/app/actions/astrologer-withdrawals";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { SuperAdminFinancialsClient } from "@/components/admin/SuperAdminFinancialsClient";
import { SuperAdminPayoutQueueCard } from "@/components/admin/SuperAdminPayoutQueueCard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Financial Ledger & Payout Management | Karmic Ascension Super Admin",
  description: "Monitor Instamojo collections, marketplace commissions, payouts, and double-entry ledger accounts.",
};

export default async function SuperAdminFinancialsPage() {
  await requireSuperAdmin();
  const [res, payoutsRes] = await Promise.all([
    getSuperAdminFinancialMetrics(),
    getSuperAdminPayoutRequestsAction(),
  ]);
  const metrics =
    res.success && res.data
      ? res.data
      : {
        totalGrossCollectionsPaise: 0,
        platformCommissionRevenuePaise: 0,
        subscriptionRevenuePaise: 0,
        astrologerPayableLiabilityPaise: 0,
        accounts: [],
        recentPayments: [],
        refundRequests: [],
      };
  const payouts = payoutsRes.success && payoutsRes.data ? payoutsRes.data : [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6">
      <div>
        <CardTitle>Financial Platform Management & Double-Entry Ledger</CardTitle>
        <p className="text-xs text-muted">
          Authoritative oversight of Instamojo clearing funds, consultant settlements, refund desks, and chart of accounts.
        </p>
      </div>

      <SuperAdminPayoutQueueCard payouts={payouts} />
      <SuperAdminFinancialsClient metrics={metrics} />
    </div>
  );
}

