import React from "react";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { getSuperAdminLanguagePreferences } from "@/app/actions/super-admin-languages";
import { SuperAdminLanguagesClient } from "@/components/admin/SuperAdminLanguagesClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Language Preference Administration | Karmic Ascension Super Admin",
  description: "Monitor and manage user language preferences and multi-lingual adoption.",
};

export default async function SuperAdminLanguagesPage() {
  await requireSuperAdmin();
  const res = await getSuperAdminLanguagePreferences();
  const preferences = res.success ? res.data : [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6">
      <div>
        <CardTitle>Language Administration & Preference Management</CardTitle>
        <p className="text-xs text-muted">
          Manage user preferred locales, verify multi-lingual persistence, and audit system adoption.
        </p>
      </div>

      <SuperAdminLanguagesClient initialPreferences={preferences} />
    </div>
  );
}

