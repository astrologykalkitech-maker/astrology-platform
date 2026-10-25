"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, ShieldCheck, UserCheck, Menu } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/astrologer/ui/Button";

interface AdminHeaderProps {
  displayName: string;
  role: "super_admin" | "consultant_admin" | "admin" | string;
  isSuperAdmin: boolean;
  onMenuClick?: () => void;
}

export function AdminHeader({ displayName, role, isSuperAdmin, onMenuClick }: AdminHeaderProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = () => {
    setError(null);
    setShowConfirm(false);
    startTransition(async () => {
      const result = await signOut();
      if (!result.success) {
        setError("Could not sign out. Please try again.");
        return;
      }
      router.push("/astrologer/login");
      router.refresh();
    });
  };

  const roleLabel = isSuperAdmin ? "Owner Super Admin" : "Consultant Admin";
  const badgeClasses = isSuperAdmin
    ? "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-700/50"
    : "bg-teal-100 text-teal-900 border-teal-300 dark:bg-teal-950/50 dark:text-teal-200 dark:border-teal-700/50";

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-zinc-200/80 bg-white/95 px-4 backdrop-blur-md sm:px-8 dark:border-zinc-800 dark:bg-zinc-950/95">
      <div className="flex items-center gap-3">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Open navigation menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition-colors hover:bg-zinc-100 lg:hidden dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <Link
          href={isSuperAdmin ? "/super-admin" : "/admin"}
          className="flex items-center gap-2 text-sm font-semibold tracking-wide text-zinc-900 dark:text-zinc-100"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-gold dark:bg-zinc-800">
            {isSuperAdmin ? <ShieldCheck className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
          </span>
          <span className="hidden sm:inline font-display text-base">JyotishSetu</span>
          <span className="text-xs text-zinc-400">/</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
            {isSuperAdmin ? "Command Center" : "Operations Portal"}
          </span>
        </Link>
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeClasses}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
          {roleLabel}
        </span>

        <div className="hidden md:flex flex-col text-right">
          <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 leading-tight">
            {displayName}
          </span>
          <span className="text-[10px] text-zinc-500 font-mono capitalize">
            {role.replace("_", " ")}
          </span>
        </div>

        <button
          onClick={() => setShowConfirm(true)}
          type="button"
          title="Sign Out"
          disabled={isPending}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-red-600 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-red-400"
        >
          <LogOut className="h-4 w-4" />
          <span className="sr-only">Sign Out</span>
        </button>
      </div>

      {showConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/70 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-sm rounded-2xl border border-gold/40 bg-white p-6 shadow-2xl space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
              <LogOut className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-midnight font-display">Sign Out of JyotishSetu Admin?</h3>
              <p className="text-xs text-muted mt-1">
                Are you sure you want to end your administrative session?
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConfirm(false)}
              >
                Stay Logged In
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={isPending}
                onClick={handleSignOut}
              >
                Sign Out
              </Button>
            </div>
            {error && <p role="alert" className="text-xs text-red-500 mt-1">{error}</p>}
          </div>
        </div>
      )}
    </header>
  );
}
