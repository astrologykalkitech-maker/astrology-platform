import type { ReactNode } from "react";
import { headers } from "next/headers";
import { AdminShell } from "@/components/admin/AdminShell";
import { requireSuperAdminPage } from "@/lib/auth/admin-guard";

export const metadata = {
  title: "Super Admin Command Center | Karmic Ascension",
  description: "Platform owner administration and management dashboard.",
};

export default async function SuperAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const headerList = await headers().catch(() => null);
  const pathname = headerList?.get("x-pathname") || "";

  // If this is the dedicated super-admin login page, do not require super-admin session
  if (pathname === "/super-admin/login") {
    return <>{children}</>;
  }

  const { user, profile, permissions } = await requireSuperAdminPage();

  return (
    <AdminShell
      userId={user.id}
      displayName={profile.full_name ?? "Platform Owner"}
      role={profile.role}
      isSuperAdmin={true}
      permissions={permissions}
    >
      {children}
    </AdminShell>
  );
}
