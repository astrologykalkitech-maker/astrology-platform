"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Bell } from "lucide-react";
import { Logo } from "@/components/astrologer/Logo";
import { SignOutButton } from "@/components/astrologer/SignOutButton";
import { ComponentErrorBoundary } from "@/components/common/ComponentErrorBoundary";
import { Avatar } from "@/components/astrologer/ui/Avatar";
import { LanguageSelector } from "@/components/common/LanguageSelector";
import { soundNotificationService } from "@/lib/sound/SoundNotificationService";

type HeaderProps = {
  displayName: string;
  photoUrl: string | null;
  menuOpen: boolean;
  onMenuClick: () => void;
};

function pageTitleFor(pathname: string) {
  if (pathname.startsWith("/astrologer/leads/")) return "Lead Details";
  if (pathname.startsWith("/astrologer/leads")) return "My Leads";
  if (pathname.startsWith("/astrologer/bookings")) return "Consultation Bookings";
  if (pathname.startsWith("/astrologer/reviews")) return "Client Reviews";
  if (pathname.startsWith("/astrologer/earnings")) return "Earnings Summary";
  if (pathname.startsWith("/astrologer/communications")) return "Super Admin Communications";
  if (pathname.startsWith("/astrologer/notifications")) return "Notifications";
  if (pathname.startsWith("/astrologer/support")) return "Support & Helpdesk";
  if (pathname.startsWith("/astrologer/profile/edit")) return "Edit Profile";
  if (pathname.startsWith("/astrologer/profile")) return "My Profile";
  return "Dashboard";
}

export function AstrologerHeader({ displayName, photoUrl, menuOpen, onMenuClick }: HeaderProps) {
  const pathname = usePathname();
  const pageTitle = pageTitleFor(pathname);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const previousCountRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadCount() {
      if (typeof document !== "undefined" && document.hidden) return;

      try {
        const res = await fetch("/api/notifications/unread-count");
        if (res.ok) {
          const data = (await res.json()) as { count?: number };
          if (mounted && typeof data.count === "number") {
            if (previousCountRef.current !== null && data.count > previousCountRef.current) {
              void soundNotificationService.playNotificationSound();
            }
            previousCountRef.current = data.count;
            setUnreadCount(data.count);
          }
        }
      } catch {
        // Non-blocking
      }
    }

    loadCount();

    function onNotificationEvent(e: Event) {
      const custom = e as CustomEvent<{ count?: number }>;
      if (typeof custom.detail?.count === "number") {
        setUnreadCount(custom.detail.count);
      } else {
        loadCount();
      }
    }

    function onVisibilityChange() {
      if (typeof document !== "undefined" && !document.hidden && mounted) {
        loadCount();
      }
    }

    window.addEventListener("jyotishsetu:notifications-updated", onNotificationEvent);
    document.addEventListener("visibilitychange", onVisibilityChange);
    const interval = setInterval(loadCount, 30_000);

    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener("jyotishsetu:notifications-updated", onNotificationEvent);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [pathname]);

  const displayCount = unreadCount > 9 ? "9+" : unreadCount.toString();

  return (
    <>
      {/* Mobile header */}
      <header className="shrink-0 sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-gold/30 bg-midnight px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:hidden">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          aria-expanded={menuOpen}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-champagne hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne"
        >
          <Menu className="h-6 w-6" aria-hidden="true" />
        </button>
        <Link href="/astrologer/dashboard" aria-label="JyotishSetu dashboard" className="min-w-0 rounded-lg focus-visible:outline-2 focus-visible:outline-champagne">
          <Logo tagline="Astrologer Portal" />
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/astrologer/notifications"
            aria-label="Notifications"
            className="relative flex h-9 w-9 items-center justify-center rounded-xl text-champagne hover:bg-white/10 transition-colors"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm animate-pulse">
                {displayCount}
              </span>
            )}
          </Link>
          <Link
            href="/astrologer/profile"
            aria-label="My profile"
            className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne hover:opacity-85 transition-opacity"
          >
            <Avatar name={displayName} src={photoUrl} size="sm" roleTitle="Astrologer Profile" uploadHref="/astrologer/profile/edit" />
          </Link>
        </div>
      </header>

      {/* Desktop header */}
      <header className="shrink-0 sticky top-0 z-20 hidden h-[76px] items-center justify-between gap-4 border-b border-gold/30 bg-ivory px-8 shadow-xs lg:flex">
        <div className="leading-tight">
          <p className="font-display text-xl font-semibold text-midnight">Astrologer Portal</p>
          <p className="text-xs text-muted">{pageTitle}</p>
        </div>

        <div className="flex items-center gap-5">
          <LanguageSelector />
          <Link
            href="/astrologer/notifications"
            aria-label="Notifications"
            className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-gold/30 bg-white text-gold-deep hover:bg-parchment transition-colors shadow-sm"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm animate-pulse">
                {displayCount}
              </span>
            )}
          </Link>

          <Link
            href="/astrologer/profile"
            aria-label="View Astrologer Profile"
            className="flex items-center gap-3 border-l border-gold/20 pl-4 hover:opacity-85 transition-opacity cursor-pointer"
          >
            <Avatar name={displayName} src={photoUrl} size="sm" roleTitle="Astrologer Profile" uploadHref="/astrologer/profile/edit" />
            <div className="leading-tight">
              <p className="max-w-[200px] truncate text-sm font-semibold text-midnight">{displayName}</p>
              <p className="text-xs text-muted">Astrologer Profile</p>
            </div>
          </Link>

          <ComponentErrorBoundary name="AstrologerSignOutHeader">
            <SignOutButton />
          </ComponentErrorBoundary>
        </div>
      </header>
    </>
  );
}
