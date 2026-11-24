import React from "react";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { getSuperAdminConsultationsAction } from "@/app/actions/super-admin-consultations";
import { SuperAdminConsultationsClient } from "@/components/admin/SuperAdminConsultationsClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Consultation Control Center & Billing Audit | Karmic Ascension Super Admin",
  description: "Exhaustive visibility across Chat, Voice, and Video consultations, per-minute billing, commission, and earnings.",
};

export default async function SuperAdminConsultationsPage() {
  await requireSuperAdmin();
  const res = await getSuperAdminConsultationsAction();

  const overview = res.success && res.data ? res.data : {
    totalConsultations: 0,
    chatConsultations: 0,
    voiceConsultations: 0,
    videoConsultations: 0,
    completedConsultations: 0,
    cancelledConsultations: 0,
    activeConsultations: 0,
    totalGrossRevenueInr: 0,
    totalCommissionInr: 0,
    totalAstrologerEarningsInr: 0,
    totalBillableMinutes: 0,
    records: [],
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6">
      <SuperAdminConsultationsClient initialData={overview} />
    </div>
  );
}
