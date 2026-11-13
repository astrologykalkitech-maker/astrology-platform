import { SuperAdminCommissionDashboardClient } from "@/components/admin/SuperAdminCommissionDashboardClient";
import { requireSuperAdminPage } from "@/lib/auth/admin-guard";
import { getSuperAdminCommissionAnalytics } from "@/app/actions/commission-management";

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
          Real-time double-entry ledger for the 10% booking commission model, consultant negative balance liabilities, and settlements.
        </p>
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
