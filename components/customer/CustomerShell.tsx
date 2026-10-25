"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { CustomerSidebar } from "@/components/customer/CustomerSidebar";
import { CustomerBottomNav } from "@/components/customer/CustomerBottomNav";
import { RealtimeAstrologerSync } from "@/components/customer/RealtimeAstrologerSync";

interface CustomerShellProps {
  customerName: string;
  userInitial: string;
  children: ReactNode;
}

export function CustomerShell({
  customerName,
  userInitial,
  children,
}: CustomerShellProps) {
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
    <div className="flex min-h-screen flex-col portal-bg text-ink">
      <a
        href="#customer-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-midnight"
      >
        Skip to content
      </a>

      <RealtimeAstrologerSync />

      <CustomerBottomNav menuOpen={menuOpen} onMore={() => setMenuOpen(true)} />

      {menuOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-30 bg-midnight/60 lg:hidden"
        />
      )}

      <CustomerSidebar
        open={menuOpen}
        onNavigate={() => setMenuOpen(false)}
        onClose={() => setMenuOpen(false)}
      />

      <div className="flex flex-1 flex-col lg:pl-64">
        <CustomerHeader
          customerName={customerName}
          userInitial={userInitial}
          menuOpen={menuOpen}
          onMenuClick={() => setMenuOpen(true)}
        />
        <main
          id="customer-main-content"
          tabIndex={-1}
          className="flex-1 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-5 outline-none sm:px-8 sm:pt-8 lg:pb-8"
        >
          <div className="rise-in mx-auto w-full max-w-[1200px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
