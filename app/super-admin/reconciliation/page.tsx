import React from "react";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { getSuperAdminReconciliations } from "@/app/actions/super-admin-reconciliation";
import { SuperAdminReconciliationClient } from "@/components/admin/SuperAdminReconciliationClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Financial Reconciliation Management | JyotishSetu Super Admin",
  description: "Reconcile payment orders, gateway references, and audit discrepancy logs.",
};

export default async function SuperAdminReconciliationPage() {
  await requireSuperAdmin();
  const res = await getSuperAdminReconciliations();
  const { runs, orders } = res.success ? res.data : { runs: [], orders: [] };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6">
      <div>
        <CardTitle>Financial Reconciliation & Exception Management</CardTitle>
        <p className="text-xs text-muted">
          Reconcile platform payment orders with Instamojo gateway settlements, verify discrepancies, and log audit notes.
        </p>
      </div>

      <SuperAdminReconciliationClient initialRuns={runs} initialOrders={orders} />
    </div>
  );
}

