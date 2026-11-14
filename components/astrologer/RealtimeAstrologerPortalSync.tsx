"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * RealtimeAstrologerPortalSync:
 * Listens for real-time changes to `customer_bookings` and `lead_assignments` via Supabase Realtime
 * as well as custom window events dispatched during local form submissions.
 *
 * When an astrologer schedules a confirmed consultation, updates a lead status, or receives a new
 * booking, this component immediately refreshes the dashboard and bookings view in real-time
 * without requiring a manual browser reload.
 */
export function RealtimeAstrologerPortalSync() {
  const router = useRouter();
  const lastRefreshTimeRef = useRef<number>(0);

  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;

    try {
      const supabase = createClient();

      const triggerRefresh = () => {
        const now = Date.now();
        // Debounce refreshes within 200ms to avoid duplicate calls on burst mutations
        if (now - lastRefreshTimeRef.current > 200) {
          lastRefreshTimeRef.current = now;
          router.refresh();
        }
      };

      // 1. Listen for local immediate window event dispatched by BookingForm or actions
      const handleLocalEvent = () => {
        triggerRefresh();
      };
      window.addEventListener("jyotishsetu:booking-created", handleLocalEvent);
      window.addEventListener("jyotishsetu:booking-updated", handleLocalEvent);

      // 2. Subscribe to Supabase Realtime on customer_bookings and lead_assignments
      channel = supabase
        .channel("realtime-astrologer-portal-sync")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "customer_bookings",
          },
          () => {
            triggerRefresh();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "puja_bookings",
          },
          () => {
            triggerRefresh();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "lead_assignments",
          },
          () => {
            triggerRefresh();
          }
        )
        .subscribe();

      // 3. Tab visibility listener: re-syncs if user was away for over 60 seconds
      const handleVisibilityChange = () => {
        if (document.visibilityState === "visible") {
          const now = Date.now();
          if (now - lastRefreshTimeRef.current > 60_000) {
            triggerRefresh();
          }
        }
      };
      document.addEventListener("visibilitychange", handleVisibilityChange);

      return () => {
        window.removeEventListener("jyotishsetu:booking-created", handleLocalEvent);
        window.removeEventListener("jyotishsetu:booking-updated", handleLocalEvent);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        if (channel) {
          supabase.removeChannel(channel);
        }
      };
    } catch (err) {
      console.warn("[RealtimeAstrologerPortalSync notice]", err);
    }
  }, [router]);

  return null;
}

