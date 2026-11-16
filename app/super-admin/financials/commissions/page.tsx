import { SuperAdminCommissionDashboardClient } from "@/components/admin/SuperAdminCommissionDashboardClient";
import { requireSuperAdminPage } from "@/lib/auth/admin-guard";
import { getSuperAdminCommissionAnalytics } from "@/app/actions/commission-management";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Commission & Float Management | Super Admin Command Center",
  description: "Monitor 10% platform commission accruals, consultant dues ledger, and settlements.",
};

export default async function SuperAdminCommissionsPage() {
  await requireSuperAdminPage();
  const res = await getSuperAdminCommissionAnalytics();

  const data = res.success && res.data ? res.data : {
    metrics: {
      totalGrossPaise: 0,
      totalCommissionGeneratedPaise: 0,
      totalCommissionSettledPaise: 0,
      totalOutstandingDuesPaise: 0,
      activeConsultantsCount: 0,
    },
    consultantDues: [],
    settings: [],
    recentLedger: [],
  };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="font-display text-2xl font-bold text-midnight">
          Marketplace Commission & Float Management
        </h1>
        <p className="text-xs text-muted">
          Configured consultation commission, consultant liabilities, and manually verified settlements.
        </p>
        <Link
          href="/super-admin/financials/commissions/verifications"
          className="mt-3 inline-flex rounded-lg bg-midnight px-3 py-2 text-xs font-semibold text-white hover:bg-plum"
        >
          Review direct payments and settlements
        </Link>
      </div>

      <SuperAdminCommissionDashboardClient
        metrics={data.metrics}
        consultantDues={data.consultantDues}
        settings={data.settings}
        recentLedger={data.recentLedger}
      />
    </div>
  );
}
