"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Inbox,
  GitBranch,
  Users2,
  Award,
  UserCog,
  BarChart3,
  ScrollText,
  Sliders,
  User,
  X,
} from "lucide-react";
import type { AdminPermissionKey } from "@/lib/types/database.types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: AdminPermissionKey;
  superAdminOnly?: boolean;
}

interface AdminSidebarProps {
  isSuperAdmin: boolean;
  permissions: AdminPermissionKey[];
  open?: boolean;
  onClose?: () => void;
}

export function AdminSidebar({
  isSuperAdmin,
  permissions,
  open = false,
  onClose,
}: AdminSidebarProps) {
  const pathname = usePathname();

  const superAdminNav: NavItem[] = [
    { href: "/super-admin", label: "Overview", icon: LayoutDashboard },
    { href: "/super-admin/leads", label: "Central Leads", icon: Inbox },
    { href: "/super-admin/leads/distribution", label: "Lead Distribution", icon: GitBranch },
    { href: "/super-admin/listings", label: "Listings Moderation", icon: Users2 },
    { href: "/super-admin/listings/ranking", label: "Ranking & Featured", icon: Award },
    { href: "/super-admin/consultants", label: "Consultants & Access", icon: UserCog },
    { href: "/super-admin/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/super-admin/audit-logs", label: "Audit Logs", icon: ScrollText },
    { href: "/super-admin/settings", label: "Platform Settings", icon: Sliders },
  ];

  const consultantNav: NavItem[] = [
    { href: "/admin", label: "Overview", icon: LayoutDashboard },
    { href: "/admin/leads", label: "My Leads", icon: Inbox },
    {
      href: "/admin/listings",
      label: "Listing Reviews",
      icon: Users2,
      permission: "listing.review",
    },
    { href: "/admin/profile", label: "My Profile", icon: User },
  ];

  const items = isSuperAdmin
    ? superAdminNav
    : consultantNav.filter((item) => {
        if (!item.permission) return true;
        return permissions.includes(item.permission);
      });

  const sidebarContent = (
    <div className="flex h-full flex-col p-4">
      <div className="mb-4 flex items-center justify-between px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          {isSuperAdmin ? "Super Admin Modules" : "Operations Modules"}
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 lg:hidden dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onClose?.()}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium transition-all ${
                isActive
                  ? "bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              <Icon
                className={`h-4 w-4 ${
                  isActive
                    ? "text-gold dark:text-gold-deep"
                    : "text-zinc-400 dark:text-zinc-500"
                }`}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {open && (
        <button
          type="button"
          aria-label="Close menu overlay"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-zinc-950/60 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* Mobile Slide-Over Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] transform bg-white shadow-xl transition-transform duration-300 ease-in-out lg:hidden dark:bg-zinc-950 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!open}
      >
        {sidebarContent}
      </aside>

      {/* Persistent Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-r border-zinc-200/80 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-950/50">
        {sidebarContent}
      </aside>
    </>
  );
}
