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
}

export function AdminSidebar({ isSuperAdmin, permissions }: AdminSidebarProps) {
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

  return (
    <aside className="w-full md:w-64 shrink-0 border-r border-zinc-200/80 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
      <div className="mb-4 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        {isSuperAdmin ? "Super Admin Modules" : "Operations Modules"}
      </div>
      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
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
    </aside>
  );
}
