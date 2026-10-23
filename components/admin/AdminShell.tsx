"use client";

import { useState, useEffect, type ReactNode } from "react";
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
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-100 text-zinc-900 antialiased dark:bg-black dark:text-zinc-50">
      <AdminHeader
        displayName={displayName}
        role={role}
        isSuperAdmin={isSuperAdmin}
        onMenuClick={() => setMenuOpen(true)}
      />
      <div className="flex-1 flex flex-col lg:flex-row">
        <AdminSidebar
          isSuperAdmin={isSuperAdmin}
          permissions={permissions}
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
        />
        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 overflow-y-auto max-w-7xl mx-auto w-full min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
