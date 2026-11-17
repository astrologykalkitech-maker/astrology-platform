"use client";

import React, { memo } from "react";
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
  Users,
  CalendarCheck2,
  X,
  Shield,
  ShieldCheck,
  Sparkles,
  LifeBuoy,
  Star,
  Radio,
  Bell,
} from "lucide-react";
import type { AdminPermissionKey } from "@/lib/types/database.types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: AdminPermissionKey;
  superAdminOnly?: boolean;
  badge?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

interface AdminSidebarProps {
  isSuperAdmin: boolean;
  permissions: AdminPermissionKey[];
  open?: boolean;
  onClose?: () => void;
}

function AdminSidebarComponent({
  isSuperAdmin,
  permissions,
  open = false,
  onClose,
}: AdminSidebarProps) {
  const pathname = usePathname();

  const superAdminSections: NavSection[] = [
    {
      title: "Command Center",
      items: [
        { href: "/super-admin", label: "Dashboard Overview", icon: LayoutDashboard },
        { href: "/super-admin/analytics", label: "Live Analytics & KPIs", icon: BarChart3 },
        { href: "/super-admin/audit-logs", label: "System Audit Logs", icon: ScrollText },
      ],
    },
    {
      title: "Astrologers & Seekers",
      items: [
        { href: "/super-admin/listings", label: "Astrologer Listings", icon: Users2 },
        { href: "/super-admin/verification", label: "Astrologer Verification & Stages", icon: Shield },
        { href: "/super-admin/listings/ranking", label: "Ranking & Featured", icon: Award },
        { href: "/super-admin/reviews", label: "Review Moderation", icon: Star },
        { href: "/super-admin/customers", label: "Customer Directory", icon: Users },
        { href: "/super-admin/consultants", label: "Consultants & Access", icon: UserCog },
      ],
    },
    {
      title: "Finance & Subscriptions",
      items: [
        { href: "/super-admin/financials/commissions", label: "Commission & Float Ledger", icon: Award },
        { href: "/super-admin/subscriptions", label: "Astrologer Subscriptions", icon: Users2 },
        { href: "/super-admin/subscription-audits", label: "Subscription Audit Trail", icon: ScrollText },
        { href: "/super-admin/financials", label: "Financial Ledger & Payouts", icon: Sliders },
        { href: "/super-admin/reconciliation", label: "Payment Reconciliation", icon: Shield },
        { href: "/super-admin/plans", label: "Subscription Plans Builder", icon: Sparkles },
      ],
    },
    {
      title: "Operations & Bookings",
      items: [
        { href: "/super-admin/leads", label: "Central Lead Pipeline", icon: Inbox },
        { href: "/super-admin/leads/distribution", label: "Lead Distribution", icon: GitBranch },
        { href: "/super-admin/bookings", label: "Consultation Bookings", icon: CalendarCheck2 },
        { href: "/super-admin/puja-bookings", label: "Puja Ceremonies", icon: CalendarCheck2 },
        { href: "/super-admin/pujas", label: "Puja Catalogue", icon: Sparkles },
        { href: "/super-admin/broadcasts", label: "Live Broadcast Monitor", icon: Radio },
        { href: "/super-admin/languages", label: "Language Administration", icon: Award },
        { href: "/super-admin/privacy-requests", label: "Privacy & Account Deletions", icon: ShieldCheck },
        { href: "/super-admin/notifications-system", label: "Notification Channels & Telemetry", icon: Bell },
        { href: "/super-admin/support", label: "Customer & Astrologer Support", icon: LifeBuoy },
        { href: "/super-admin/settings", label: "Platform Settings", icon: Sliders },
      ],
    },
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

  const filteredConsultantItems = consultantNav.filter((item) => {
    if (!item.permission) return true;
    return permissions.includes(item.permission);
  });

  const sidebarContent = (
    <div className="flex h-full flex-col bg-midnight text-ivory">
      {/* Brand Header */}
      <div className="flex items-center justify-between border-b border-gold/15 px-4 py-3 shrink-0">
        <Link
          href={isSuperAdmin ? "/super-admin" : "/admin"}
          onClick={() => onClose?.()}
          className="flex items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-champagne"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-gold to-gold-deep text-midnight shadow-sm">
            {isSuperAdmin ? <Shield className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          </div>
          <div className="flex flex-col">
            <span className="font-display text-sm font-bold tracking-wide text-champagne">
              Karmic Ascension
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ivory/60">
              {isSuperAdmin ? "Super Admin" : "Operations"}
            </span>
          </div>
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="rounded-lg p-1.5 text-ivory/60 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-3.5 sidebar-scrollbar">
        {isSuperAdmin ? (
          superAdminSections.map((sec) => (
            <div key={sec.title} className="space-y-1">
              <span className="block px-3 text-[10px] font-bold uppercase tracking-widest text-gold/80">
                {sec.title}
              </span>
              <div className="space-y-0.5 pt-1">
                {sec.items.map((item) => {
                  const Icon = item.icon;
                  const allHrefs = superAdminSections.flatMap((s) => s.items.map((i) => i.href));
                  const isExact = pathname === item.href;
                  const hasMoreSpecificMatch = allHrefs.some(
                    (otherHref) =>
                      otherHref !== item.href &&
                      otherHref.startsWith(item.href) &&
                      (pathname === otherHref || pathname.startsWith(`${otherHref}/`))
                  );
                  const isActive = isExact || (!hasMoreSpecificMatch && pathname.startsWith(`${item.href}/`));

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={true}
                      onClick={() => onClose?.()}
                      className={`group flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-all ${
                        isActive
                          ? "bg-gradient-to-r from-gold/25 via-gold/15 to-transparent border-l-2 border-gold text-champagne font-semibold shadow-sm"
                          : "text-ivory/70 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon
                          className={`h-4 w-4 shrink-0 transition-colors ${
                            isActive ? "text-champagne" : "text-ivory/45 group-hover:text-gold"
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-bold text-champagne">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <div className="space-y-1">
            <span className="block px-3 text-[10px] font-bold uppercase tracking-widest text-gold/80">
              Operations Portal
            </span>
            <div className="space-y-0.5 pt-1">
              {filteredConsultantItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={true}
                    onClick={() => onClose?.()}
                    className={`group flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition-all ${
                      isActive
                        ? "bg-gradient-to-r from-gold/25 via-gold/15 to-transparent border-l-2 border-gold text-champagne font-semibold"
                        : "text-ivory/70 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 transition-colors ${
                        isActive ? "text-champagne" : "text-ivory/45 group-hover:text-gold"
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {/* Sidebar Footer Indicator */}
      <div className="border-t border-gold/15 p-2.5 text-center shrink-0">
        <div className="flex items-center justify-center gap-2 text-[11px] text-ivory/50">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Vedic Security Shield Active</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {open && (
        <button
          type="button"
          aria-label="Close navigation overlay"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-midnight/80 backdrop-blur-sm lg:hidden transition-opacity"
        />
      )}

      {/* Mobile Slide-Over Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] transform bg-midnight shadow-2xl transition-transform duration-300 ease-in-out lg:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!open}
      >
        {sidebarContent}
      </aside>

      {/* Persistent Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 h-full border-r border-gold/15 bg-midnight overflow-hidden">
        {sidebarContent}
      </aside>
    </>
  );
}

export const AdminSidebar = memo(AdminSidebarComponent);
