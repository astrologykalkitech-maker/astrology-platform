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

  return (
    <header className="shrink-0 z-30 flex h-16 w-full items-center justify-between border-b border-gold/20 bg-midnight/95 px-4 backdrop-blur-md sm:px-8 text-ivory">
      {/* Left: Hamburger + Title */}
      <div className="flex items-center gap-3">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Open navigation menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gold/30 bg-white/5 text-champagne transition-colors hover:bg-white/10 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <Link
          href={isSuperAdmin ? "/super-admin" : "/admin"}
          className="flex items-center gap-2.5 text-sm font-semibold tracking-wide text-ivory group"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-gold to-gold-deep text-midnight shadow-sm group-hover:scale-105 transition-transform">
            {isSuperAdmin ? <ShieldCheck className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
          </span>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-base font-bold text-champagne hidden sm:inline">
              JyotishSetu
            </span>
            <span className="text-xs text-gold/40 hidden sm:inline">/</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-ivory/80">
              {isSuperAdmin ? "Command Center" : "Operations Portal"}
            </span>
          </div>
        </Link>
      </div>

      {/* Right: Badge + User + SignOut */}
      <div className="flex items-center gap-2.5 sm:gap-4">

        {/* Role Pill */}
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold shadow-xs ${
            isSuperAdmin
              ? "border-gold/40 bg-gold/15 text-champagne"
              : "border-teal-400/40 bg-teal-950/40 text-teal-200"
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
          {roleLabel}
        </span>

        {/* User Identity */}
        <div className="hidden md:flex flex-col text-right">
          <span className="text-xs font-semibold text-ivory leading-tight">
            {displayName}
          </span>
          <span className="text-[10px] text-ivory/50 font-mono capitalize">
            {role.replace("_", " ")}
          </span>
        </div>

        {/* Sign Out Button */}
        <button
          onClick={() => setShowConfirm(true)}
          type="button"
          title="Sign Out"
          disabled={isPending}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gold/25 bg-white/5 text-ivory/80 transition-colors hover:border-red-400/50 hover:bg-red-950/30 hover:text-red-300"
        >
          <LogOut className="h-4 w-4" />
          <span className="sr-only">Sign Out</span>
        </button>
      </div>

      {/* Sign Out Modal */}
      {showConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/80 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-sm rounded-2xl border border-gold/40 bg-midnight p-6 shadow-2xl space-y-4 text-center text-ivory">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-950/60 border border-red-500/40 text-red-400">
              <LogOut className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-champagne font-display">
                Sign Out of JyotishSetu Admin?
              </h3>
              <p className="text-xs text-ivory/70 mt-1">
                Are you sure you want to end your administrative session?
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConfirm(false)}
                className="border-gold/40 !bg-transparent !text-champagne hover:!bg-white/10"
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
            {error && <p role="alert" className="text-xs text-red-400 mt-1">{error}</p>}
          </div>
        </div>
      )}
    </header>
  );
}
