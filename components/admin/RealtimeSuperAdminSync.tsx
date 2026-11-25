"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const SUPER_ADMIN_SYNC_TABLES = [
  "customer_bookings",
  "astrologer_profiles",
  "astrologer_payouts",
  "astrologer_wallet_transactions",
  "commission_settlements",
  "payment_orders",
  "consultation_reviews",
  "support_tickets",
] as const;

/**
 * RealtimeSuperAdminSync:
 * Keeps all Super Admin command center views synchronized in real time when
 * customers or astrologers create bookings, complete payments, request payouts,
 * submit reviews, or open support tickets.
 */
export function RealtimeSuperAdminSync() {
  const router = useRouter();
  const lastRefreshTimeRef = useRef<number>(0);

  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;

    try {
      const supabase = createClient();

      const triggerRefresh = () => {
        const now = Date.now();
        if (now - lastRefreshTimeRef.current > 300) {
          lastRefreshTimeRef.current = now;
          router.refresh();
        }
      };

      let built = supabase.channel("realtime-super-admin-portal-sync");
      for (const table of SUPER_ADMIN_SYNC_TABLES) {
        built = built.on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          () => {
            triggerRefresh();
          }
        );
      }
      channel = built.subscribe();

      const handleVisibilityChange = () => {
        if (document.visibilityState === "visible") {
          const now = Date.now();
          if (now - lastRefreshTimeRef.current > 120_000) {
            triggerRefresh();
          }
        }
      };
      document.addEventListener("visibilitychange", handleVisibilityChange);

      return () => {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        if (channel) {
          void supabase.removeChannel(channel);
        }
      };
    } catch (err) {
      console.warn("[RealtimeSuperAdminSync initialization notice]", err);
    }
  }, [router]);

  return null;
}
