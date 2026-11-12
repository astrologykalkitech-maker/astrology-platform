import React from "react";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { getAllPaymentPlansAdmin } from "@/lib/financial/plans";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { SuperAdminPlanBuilderClient } from "@/components/admin/SuperAdminPlanBuilderClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Subscription Plan Builder | JyotishSetu Super Admin",
  description: "Configure dynamic membership tiers, lead quotas, commission fees, and features for astrologers.",
};

export default async function SuperAdminPlansPage() {
  await requireSuperAdmin();
  const plans = await getAllPaymentPlansAdmin();

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6">
      <div>
        <CardTitle>Astrologer Membership Tier Builder</CardTitle>
        <p className="text-xs text-muted">
          Design, price, and version dynamic subscription packages. Manage free and professional tiers with custom lead quotas and commission rates.
        </p>
      </div>

      <SuperAdminPlanBuilderClient initialPlans={plans} />
    </div>
  );
}

