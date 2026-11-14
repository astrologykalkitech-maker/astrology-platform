"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AstrologerHeader } from "@/components/astrologer/AstrologerHeader";
import { AstrologerSidebar } from "@/components/astrologer/AstrologerSidebar";
import { BottomNav } from "@/components/astrologer/BottomNav";
import { ComponentErrorBoundary } from "@/components/common/ComponentErrorBoundary";
import { RealtimeAstrologerPortalSync } from "@/components/astrologer/RealtimeAstrologerPortalSync";
import { AccountPresenceProvider } from "@/components/chat/AccountPresenceProvider";
import { VoiceCallProvider } from "@/components/chat/VoiceCallProvider";
import { SessionLifecycleGuard } from "@/components/auth/SessionLifecycleGuard";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";

type PortalShellProps = {
  userId: string;
  displayName: string;
  photoUrl: string | null;
  children: ReactNode;
};

export function PortalShell({ userId, displayName, photoUrl, children }: PortalShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isChatPage = usePathname() === "/astrologer/chat";

  useEffect(() => {
    if (!menuOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <LanguageProvider>
      <VoiceCallProvider role="astrologer" userId={userId}>
      <SessionLifecycleGuard userId={userId} role="astrologer" loginPath="/astrologer/login" />
    <AccountPresenceProvider role="astrologer" userId={userId}>
      <div className="h-screen flex flex-col portal-bg text-ink overflow-hidden">
      <RealtimeAstrologerPortalSync />
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
        <ComponentErrorBoundary name="AstrologerHeaderShell">
          <AstrologerHeader
            displayName={displayName}
            photoUrl={photoUrl}
            menuOpen={menuOpen}
            onMenuClick={() => setMenuOpen(true)}
          />
        </ComponentErrorBoundary>
        <main
          id="main-content"
          tabIndex={-1}
          className={`flex-1 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-5 outline-none sm:px-8 sm:pt-8 lg:pb-8 ${
            isChatPage
              ? "flex min-h-0 flex-col overflow-hidden"
              : "overflow-y-auto"
          }`}
        >
          <div
            className={`rise-in mx-auto w-full max-w-300 min-w-0 ${
              isChatPage ? "flex min-h-0 flex-1 flex-col" : ""
            }`}
          >
            {children}
          </div>
        </main>
      </div>
      </div>
    </AccountPresenceProvider>
    </VoiceCallProvider>
    </LanguageProvider>
  );
}
