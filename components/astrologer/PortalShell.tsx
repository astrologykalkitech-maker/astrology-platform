"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AstrologerHeader } from "@/components/astrologer/AstrologerHeader";
import { AstrologerSidebar } from "@/components/astrologer/AstrologerSidebar";
import { BottomNav } from "@/components/astrologer/BottomNav";

type PortalShellProps = {
  displayName: string;
  photoUrl: string | null;
  children: ReactNode;
};

export function PortalShell({ displayName, photoUrl, children }: PortalShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <div className="h-screen flex flex-col portal-bg text-ink overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-midnight"
      >
        Skip to content
      </a>

      <BottomNav menuOpen={menuOpen} onMore={() => setMenuOpen(true)} />

      {menuOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-30 bg-midnight/60 lg:hidden"
        />
      )}

      <AstrologerSidebar
        open={menuOpen}
        onNavigate={() => setMenuOpen(false)}
        onClose={() => setMenuOpen(false)}
      />

      <div className="flex flex-1 flex-col lg:pl-64 h-full overflow-hidden min-w-0">
        <AstrologerHeader
          displayName={displayName}
          photoUrl={photoUrl}
          menuOpen={menuOpen}
          onMenuClick={() => setMenuOpen(true)}
        />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-y-auto px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-5 outline-none sm:px-8 sm:pt-8 lg:pb-8"
        >
          <div className="rise-in mx-auto w-full max-w-[1200px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
