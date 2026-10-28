"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  Ellipsis,
  House,
  UserRound,
  CalendarClock,
  Bell,
  type LucideIcon,
} from "lucide-react";

const ITEMS: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/astrologer/dashboard", label: "Dashboard", icon: House },
  { href: "/astrologer/leads", label: "Leads", icon: ClipboardList },
  { href: "/astrologer/bookings", label: "Bookings", icon: CalendarClock },
  { href: "/astrologer/notifications", label: "Alerts", icon: Bell },
  { href: "/astrologer/profile", label: "Profile", icon: UserRound, exact: true },
];

export function BottomNav({ menuOpen, onMore }: { menuOpen: boolean; onMore: () => void }) {
  const pathname = usePathname();
  const base =
    "relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-champagne";

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-gold/40 bg-midnight pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_-12px_rgba(0,0,0,0.6)] lg:hidden"
    >
      {ITEMS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} prefetch={true} aria-current={active ? "page" : undefined} className={`${base} min-h-14 ${active ? "text-gold" : "text-ivory/70"}`}>
            {active && <span aria-hidden="true" className="absolute inset-x-6 top-0 h-[3px] rounded-b-full bg-gold" />}
            <Icon className="h-5 w-5" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
      <button type="button" onClick={onMore} aria-haspopup="dialog" aria-expanded={menuOpen} className={`${base} min-h-14 text-ivory/70`}>
        <Ellipsis className="h-5 w-5" aria-hidden="true" />
        More
      </button>
    </nav>
  );
}
