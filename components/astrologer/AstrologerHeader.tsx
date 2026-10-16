"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Menu } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { Avatar } from "@/components/astrologer/ui/Avatar";
import { Button } from "@/components/astrologer/ui/Button";

type HeaderProps = {
  displayName: string;
  photoUrl: string | null;
  menuOpen: boolean;
  onMenuClick: () => void;
};

export function AstrologerHeader({
  displayName,
  photoUrl,
  menuOpen,
  onMenuClick,
}: HeaderProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSignOut() {
    setError(null);
    startTransition(async () => {
      const result = await signOut();
      if (!result.success) {
        setError("Could not sign out. Please try again.");
        return;
      }
      router.replace("/astrologer/login");
      router.refresh();
    });
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-line bg-ivory/90 px-4 backdrop-blur sm:px-8">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          aria-expanded={menuOpen}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-midnight hover:bg-parchment focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <p className="hidden items-center gap-2 text-sm font-medium text-muted lg:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden="true" />
          Astrologer Portal
        </p>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        {error && (
          <p role="alert" className="hidden text-xs text-red-600 sm:block">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Avatar name={displayName} src={photoUrl} size="sm" />
          <div className="hidden leading-tight sm:block">
            <p className="max-w-[180px] truncate text-sm font-semibold text-midnight">
              {displayName}
            </p>
            <p className="text-xs text-muted">Astrologer</p>
          </div>
        </div>

        <Button variant="ghost" size="sm" onClick={handleSignOut} loading={isPending}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          <span className="max-sm:sr-only">Sign out</span>
        </Button>
      </div>
    </header>
  );
}
