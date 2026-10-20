"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Logo } from "@/components/astrologer/Logo";
import { SignOutButton } from "@/components/astrologer/SignOutButton";
import { Avatar } from "@/components/astrologer/ui/Avatar";

type HeaderProps = {
  displayName: string;
  photoUrl: string | null;
  menuOpen: boolean;
  onMenuClick: () => void;
};

function pageTitleFor(pathname: string) {
  if (pathname.startsWith("/astrologer/leads/")) return "Lead Details";
  if (pathname.startsWith("/astrologer/leads")) return "My Leads";
  if (pathname.startsWith("/astrologer/profile/edit")) return "Edit Profile";
  if (pathname.startsWith("/astrologer/profile")) return "My Profile";
  return "Dashboard";
}

export function AstrologerHeader({ displayName, photoUrl, menuOpen, onMenuClick }: HeaderProps) {
  const pageTitle = pageTitleFor(usePathname());

  return (
    <>
      {/* Mobile header */}
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
        <Link href="/astrologer/dashboard" aria-label="JyotishSetu dashboard" className="min-w-0 rounded-lg focus-visible:outline-2 focus-visible:outline-champagne">
          <Logo tagline="Astrologer Portal" />
        </Link>
        <Link href="/astrologer/profile" aria-label="My profile" className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne">
          <Avatar name={displayName} src={photoUrl} size="sm" />
        </Link>
      </header>

      {/* Desktop header */}
      <header className="sticky top-0 z-20 hidden h-[76px] items-center justify-between gap-4 border-b border-gold/30 bg-ivory/90 px-8 backdrop-blur lg:flex">
        <div className="leading-tight">
          <p className="font-display text-xl font-semibold text-midnight">Astrologer Portal</p>
          <p className="text-xs text-muted">{pageTitle}</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <Avatar name={displayName} src={photoUrl} size="sm" />
            <div className="leading-tight">
              <p className="max-w-[200px] truncate text-sm font-semibold text-midnight">{displayName}</p>
              <p className="text-xs text-muted">Astrologer</p>
            </div>
          </div>
          <SignOutButton />
        </div>
      </header>
    </>
  );
}
