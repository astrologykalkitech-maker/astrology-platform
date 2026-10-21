import type { ReactNode } from "react";
import { AdminHeader } from "./AdminHeader";
import { AdminSidebar } from "./AdminSidebar";
import type { AdminPermissionKey, UserRole } from "@/lib/types/database.types";

interface AdminShellProps {
  children: ReactNode;
  displayName: string;
  role: UserRole;
  isSuperAdmin: boolean;
  permissions: AdminPermissionKey[];
}

export function AdminShell({
  children,
  displayName,
  role,
  isSuperAdmin,
  permissions,
}: AdminShellProps) {
  return (
    <div className="min-h-screen flex flex-col bg-zinc-100 text-zinc-900 antialiased dark:bg-black dark:text-zinc-50">
      <AdminHeader
        displayName={displayName}
        role={role}
        isSuperAdmin={isSuperAdmin}
      />
      <div className="flex-1 flex flex-col md:flex-row">
        <AdminSidebar isSuperAdmin={isSuperAdmin} permissions={permissions} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
