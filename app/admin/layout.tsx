import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { requireConsultantAdminPage } from "@/lib/auth/admin-guard";

export const metadata = {
  title: "Consultant Admin Portal | JyotishSetu",
  description: "Consultant operations and assigned lead management portal.",
};

export default async function ConsultantAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, profile, permissions } = await requireConsultantAdminPage();

  return (
    <AdminShell
      userId={user.id}
      displayName={profile.full_name ?? "Consultant Admin"}
      role={profile.role}
      isSuperAdmin={false}
      permissions={permissions}
    >
      {children}
    </AdminShell>
  );
}
