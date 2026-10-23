import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { requireSuperAdminPage } from "@/lib/auth/admin-guard";

export const metadata = {
  title: "Super Admin Command Center | JyotishSetu",
  description: "Platform owner administration and management dashboard.",
};

export default async function SuperAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { profile, permissions } = await requireSuperAdminPage();

  return (
    <AdminShell
      displayName={profile.full_name ?? "Platform Owner"}
      role={profile.role}
      isSuperAdmin={true}
      permissions={permissions}
    >
      {children}
    </AdminShell>
  );
}
