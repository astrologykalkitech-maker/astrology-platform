"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Sparkles,
  ClipboardList,
  CalendarCheck2,
  Menu,
} from "lucide-react";

type BottomNavProps = {
  menuOpen: boolean;
  onMore: () => void;
};

const ITEMS = [
  { href: "/customer/astrologers", label: "Astrologers", icon: Sparkles },
  { href: "/customer/enquiries", label: "Enquiries", icon: ClipboardList },
  { href: "/customer/bookings", label: "Bookings", icon: CalendarCheck2 },
];

export function CustomerBottomNav({ menuOpen, onMore }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-20 flex h-[calc(3.5rem+env(safe-area-inset-bottom))] items-center justify-around border-t border-gold/30 bg-midnight/95 px-2 pb-[env(safe-area-inset-bottom)] text-ivory/80 backdrop-blur lg:hidden"
    >
      {ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[11px] font-medium transition-colors ${
              active ? "text-champagne font-semibold" : "hover:text-white"
            }`}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}

      <button
        type="button"
        onClick={onMore}
        aria-label="More menu items"
        aria-expanded={menuOpen}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[11px] font-medium text-ivory/80 hover:text-white"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
        <span>More</span>
      </button>
    </nav>
  );
}
