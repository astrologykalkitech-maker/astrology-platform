"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/astrologer/ui/Button";

interface CustomerSignOutButtonProps {
  iconOnlyOnMobile?: boolean;
  className?: string;
  redirectTo?: string;
}

export function CustomerSignOutButton({
  iconOnlyOnMobile = false,
  className = "",
  redirectTo = "/customer/login",
}: CustomerSignOutButtonProps) {
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
      router.replace(redirectTo);
      router.refresh();
    });
  }

  return (
    <div className="inline-flex flex-col items-end">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSignOut}
        loading={isPending}
        className={className}
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        <span className={iconOnlyOnMobile ? "max-sm:sr-only" : undefined}>Sign out</span>
      </Button>
      {error && <p role="alert" className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
