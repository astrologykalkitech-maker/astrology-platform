"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Bell } from "lucide-react";
import { Logo } from "@/components/astrologer/Logo";
import { Avatar } from "@/components/astrologer/ui/Avatar";
import { CustomerSignOutButton } from "@/components/customer/CustomerSignOutButton";
import { getCustomerUnreadNotificationCount } from "@/app/actions/customer";

type CustomerHeaderProps = {
  customerName: string;
  userInitial?: string;
  menuOpen: boolean;
  onMenuClick: () => void;
};

function pageTitleFor(pathname: string) {
  if (pathname.startsWith("/customer/profile")) return "Seeker Profile & Kundli";
  if (pathname.startsWith("/customer/astrologers/")) return "Astrologer Profile";
  if (pathname.startsWith("/customer/astrologers")) return "Find Astrologers";
  if (pathname.startsWith("/customer/enquiries/new")) return "Ask for Guidance";
  if (pathname.startsWith("/customer/enquiries")) return "My Enquiries";
  if (pathname.startsWith("/customer/bookings")) return "My Consultations";
  if (pathname.startsWith("/customer/billing")) return "Consultation Receipts & Billing";
  if (pathname.startsWith("/customer/notification")) return "Notifications";
  if (pathname.startsWith("/customer/offers")) return "Special Offers";
  if (pathname.startsWith("/customer/support")) return "Customer Support";
  return "Dashboard";
}

export function CustomerHeader({
  customerName,
  menuOpen,
  onMenuClick,
}: CustomerHeaderProps) {
  const pathname = usePathname();
  const pageTitle = pageTitleFor(pathname);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  // Fetch unread count and refresh when navigating
  useEffect(() => {
    let mounted = true;
    async function loadCount() {
      try {
        const res = await getCustomerUnreadNotificationCount();
        if (mounted && res.success && typeof res.data === "number") {
          setUnreadCount(res.data);
        }
      } catch {
        // Non-blocking
      }
    }

    loadCount();
    // Poll every 30 seconds for live notifications
    const interval = setInterval(loadCount, 30_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [pathname]);

  const displayCount = unreadCount > 9 ? "9+" : unreadCount.toString();

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
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-champagne hover:bg-white/10"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white shadow">
                {displayCount}
              </span>
            )}
          </Link>
          <Link href="/customer/profile" aria-label="My Profile">
            <Avatar name={customerName} size="sm" />
          </Link>
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
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white shadow">
                {displayCount}
              </span>
            )}
          </Link>

          <Link
            href="/customer/profile"
            className="flex items-center gap-3 border-l border-gold/20 pl-4 hover:opacity-85 transition-opacity"
            aria-label="View Customer Profile"
          >
            <Avatar name={customerName} size="sm" />
            <div className="leading-tight">
              <p className="max-w-[200px] truncate text-sm font-semibold text-midnight">{customerName}</p>
              <p className="text-xs text-muted">Customer Profile</p>
            </div>
          </Link>

          <CustomerSignOutButton />
        </div>
      </header>
    </>
  );
}
