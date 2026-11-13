import React from "react";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { getSuperAdminPujaCatalog } from "@/app/actions/super-admin-pujas";
import { SuperAdminPujasClient } from "@/components/admin/SuperAdminPujasClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Puja Catalogue Management | JyotishSetu Super Admin",
  description: "Create, configure, and maintain authentic Vedic Pujas and rituals.",
};

export default async function SuperAdminPujasPage() {
  await requireSuperAdmin();
  const res = await getSuperAdminPujaCatalog();
  const pujas = res.success ? res.data : [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6">
      <div>
        <CardTitle>Vedic Puja & Ritual Catalogue Management</CardTitle>
        <p className="text-xs text-muted">
          Manage consecrated Vedic rituals, duration parameters, dakshina fees, and seeker catalogue visibility.
        </p>
      </div>

      <SuperAdminPujasClient initialPujas={pujas} />
    </div>
  );
}

