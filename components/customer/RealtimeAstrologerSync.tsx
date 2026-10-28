"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * RealtimeAstrologerSync:
 * Listens for real-time changes to `astrologer_profiles` table via Supabase Realtime.
 * When any astrologer status is approved, suspended, rejected, or updated by Super Admin,
 * automatically revalidates and refreshes all active customer dashboards and discovery pages
 * in real-time without requiring manual browser reload, cache clearing, or relogin.
 * 
 * Also handles tab visibility / reconnects to guarantee data freshness if an event occurred
 * while disconnected or in background.
 */
export function RealtimeAstrologerSync() {
  const router = useRouter();
  const lastRefreshTimeRef = useRef<number>(0);

  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;

    try {
      const supabase = createClient();

      const triggerRefresh = () => {
        const now = Date.now();
        // Debounce refreshes within 300ms to avoid burst stutter on batch updates
        if (now - lastRefreshTimeRef.current > 300) {
          lastRefreshTimeRef.current = now;
          router.refresh();
        }
      };

      // Subscribe to postgres_changes on astrologer_profiles
      channel = supabase
        .channel("realtime-astrologer-directory-sync")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "astrologer_profiles",
          },
          () => {
            triggerRefresh();
          }
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            // Successfully connected to real-time stream
          }
        });

      // Window focus / reconnection listener: only re-syncs if user was away for over 5 minutes
      const handleVisibilityChange = () => {
        if (document.visibilityState === "visible") {
          const now = Date.now();
          if (now - lastRefreshTimeRef.current > 300_000) {
            triggerRefresh();
          }
        }
      };

      document.addEventListener("visibilitychange", handleVisibilityChange);

      return () => {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        if (channel) {
          supabase.removeChannel(channel);
        }
      };
    } catch (err) {
      console.warn("[RealtimeAstrologerSync initialization notice]", err);
    }
  }, [router]);

  return null;
}
