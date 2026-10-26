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
    <div className="min-h-screen flex flex-col portal-bg text-ink antialiased">
      {/* Accessibility: Skip to Content */}
      <a
        href="#admin-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-midnight focus:px-4 focus:py-2.5 focus:text-champagne focus:outline-2 focus:outline-gold focus:shadow-xl"
      >
        Skip to main content
      </a>

      <AdminHeader
        displayName={displayName}
        role={role}
        isSuperAdmin={isSuperAdmin}
        onMenuClick={() => setMenuOpen(true)}
      />

      <div className="flex-1 flex flex-col lg:flex-row min-w-0">
        <AdminSidebar
          isSuperAdmin={isSuperAdmin}
          permissions={permissions}
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
        />
        <main
          id="admin-main-content"
          tabIndex={-1}
          className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto max-w-7xl mx-auto w-full min-w-0 outline-none"
        >
          <div className="rise-in w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
