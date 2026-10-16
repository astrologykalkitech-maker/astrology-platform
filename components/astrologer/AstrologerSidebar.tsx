"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock,
  LayoutDashboard,
  MessageSquareText,
  Settings,
  SquarePen,
  Star,
  UserRound,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { CelestialBackground } from "@/components/astrologer/CelestialBackground";
import { Logo } from "@/components/astrologer/Logo";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/astrologer/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/astrologer/profile", label: "My Profile", icon: UserRound, exact: true },
  { href: "/astrologer/leads", label: "My Leads", icon: MessageSquareText },
  { href: "/astrologer/profile/edit", label: "Edit Profile", icon: SquarePen },
];

// Shown in the reference design but not supported by the backend yet.
const COMING_SOON: { label: string; icon: LucideIcon }[] = [
  { label: "Availability", icon: CalendarClock },
  { label: "Reviews", icon: Star },
  { label: "Earnings", icon: Wallet },
  { label: "Settings", icon: Settings },
];

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

type SidebarProps = {
  open: boolean;
  onNavigate: () => void;
  onClose: () => void;
};

export function AstrologerSidebar({ open, onNavigate, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 w-64 overflow-hidden border-r border-white/5 bg-midnight text-ivory transition-transform duration-200 lg:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full max-lg:invisible"
      }`}
    >
      <CelestialBackground variant="panel" />

      <div className="relative z-10 flex h-full flex-col px-4 py-5">
        <div className="flex items-center justify-between px-1">
          <Link
            href="/astrologer/dashboard"
            onClick={onNavigate}
            aria-label="JyotishSetu dashboard"
            className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-champagne"
          >
            <Logo />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-lg p-2 text-ivory/80 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-champagne lg:hidden"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav aria-label="Astrologer portal" className="mt-8 flex flex-1 flex-col gap-1.5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne ${
                  active
                    ? "gold-gradient text-white shadow-md"
                    : "text-ivory/75 hover:bg-white/8 hover:text-white"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}

          <p className="mt-6 px-3.5 text-[11px] font-semibold uppercase tracking-widest text-ivory/40">
            Coming soon
          </p>

          {COMING_SOON.map(({ label, icon: Icon }) => (
            <div
              key={label}
              aria-disabled="true"
              className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm text-ivory/40"
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              <span>{label}</span>
              <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                Soon
              </span>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}
