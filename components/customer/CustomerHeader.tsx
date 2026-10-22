"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Bell } from "lucide-react";
import { Logo } from "@/components/astrologer/Logo";
import { Avatar } from "@/components/astrologer/ui/Avatar";
import { CustomerSignOutButton } from "@/components/customer/CustomerSignOutButton";

type CustomerHeaderProps = {
  customerName: string;
  userInitial: string;
  menuOpen: boolean;
  onMenuClick: () => void;
};

function pageTitleFor(pathname: string) {
  if (pathname.startsWith("/customer/astrologers/")) return "Astrologer Profile";
  if (pathname.startsWith("/customer/astrologers")) return "Find Astrologers";
  if (pathname.startsWith("/customer/enquiries/new")) return "Ask for Guidance";
  if (pathname.startsWith("/customer/enquiries")) return "My Enquiries";
  if (pathname.startsWith("/customer/bookings")) return "My Consultations";
  if (pathname.startsWith("/customer/notification")) return "Notifications";
  if (pathname.startsWith("/customer/offers")) return "Special Offers";
  return "Dashboard";
}

export function CustomerHeader({
  customerName,
  userInitial,
  menuOpen,
  onMenuClick,
}: CustomerHeaderProps) {
  const pathname = usePathname();
  const pageTitle = pageTitleFor(pathname);

  return (
    <>
      {/* Mobile Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-gold/30 bg-midnight px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:hidden">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          aria-expanded={menuOpen}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-champagne hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne"
        >
          <Menu className="h-6 w-6" aria-hidden="true" />
        </button>
        <Link
          href="/customer"
          aria-label="JyotishSetu customer dashboard"
          className="min-w-0 rounded-lg focus-visible:outline-2 focus-visible:outline-champagne"
        >
          <Logo tagline="Customer Portal" />
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/customer/notification"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-champagne hover:bg-white/10"
            aria-label="View notifications"
          >
            <Bell className="h-5 w-5" />
          </Link>
          <Avatar name={customerName} size="sm" />
        </div>
      </header>

      {/* Desktop Header */}
      <header className="sticky top-0 z-20 hidden h-[76px] items-center justify-between gap-4 border-b border-gold/30 bg-ivory/90 px-8 backdrop-blur lg:flex">
        <div className="leading-tight">
          <p className="font-display text-xl font-semibold text-midnight">Customer Portal</p>
          <p className="text-xs text-muted">{pageTitle}</p>
        </div>

        <div className="flex items-center gap-5">
          <Link
            href="/customer/notification"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-midnight/70 transition-colors hover:bg-gold/10 hover:text-midnight focus-visible:outline-2 focus-visible:outline-gold"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
          </Link>

          <div className="flex items-center gap-3 border-l border-gold/20 pl-4">
            <Avatar name={customerName} size="sm" />
            <div className="leading-tight">
              <p className="max-w-[200px] truncate text-sm font-semibold text-midnight">{customerName}</p>
              <p className="text-xs text-muted">Customer</p>
            </div>
          </div>

          <CustomerSignOutButton />
        </div>
      </header>
    </>
  );
}
