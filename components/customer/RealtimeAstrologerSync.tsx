"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { soundNotificationService } from "@/lib/sound/SoundNotificationService";

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

      // 1. Local custom window events
      const handleLocalEvent = () => {
        triggerRefresh();
      };
      window.addEventListener("karmicascension:booking-created", handleLocalEvent);
      window.addEventListener("karmicascension:booking-updated", handleLocalEvent);

      // 2. Subscribe to postgres_changes on astrologer_profiles, customer_bookings, & astrologer_live_broadcasts
      channel = supabase
        .channel("realtime-customer-portal-sync")
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
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "customer_bookings",
          },
          (payload) => {
            const record = payload.new as { id?: string; status?: string } | undefined;
            if (payload.eventType === "UPDATE") {
              if (record?.status === "confirmed" || record?.status === "accepted") {
                void soundNotificationService.playBookingConfirmedSound(record?.id ? `${record.id}-confirmed` : undefined);
              } else if (record?.status === "cancelled") {
                void soundNotificationService.playBookingCancelledSound(record?.id ? `${record.id}-cancelled` : undefined);
              } else {
                void soundNotificationService.playNotificationSound(record?.id ? `${record.id}-updated` : undefined);
              }
            }
            triggerRefresh();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "astrologer_live_broadcasts",
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
          (payload) => {
            const record = payload.new as { id?: string; status?: string } | undefined;
            if (payload.eventType === "UPDATE") {
              if (record?.status === "confirmed" || record?.status === "completed") {
                void soundNotificationService.playBookingConfirmedSound(record?.id ? `${record.id}-confirmed` : undefined);
              } else if (record?.status === "cancelled") {
                void soundNotificationService.playBookingCancelledSound(record?.id ? `${record.id}-cancelled` : undefined);
              }
            }
            triggerRefresh();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "customer_notifications",
          },
          (payload) => {
            const record = payload.new as { id?: string } | undefined;
            void soundNotificationService.playNotificationSound(record?.id);
            triggerRefresh();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "direct_messages",
          },
          (payload) => {
            const record = payload.new as { id?: string; sender_role?: string } | undefined;
            if (record?.sender_role === "astrologer") {
              void soundNotificationService.playMessageSound(record.id);
            }
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "consultation_meetings",
          },
          (payload) => {
            const record = payload.new as { id?: string; status?: string } | undefined;
            if (record?.status === "waiting" || record?.status === "active") {
              void soundNotificationService.playIncomingVideoCallSound(record?.id);
            } else if (record?.status === "ended" || record?.status === "cancelled") {
              soundNotificationService.stopRingtone();
            }
            triggerRefresh();
          }
        )
        .subscribe();

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
        window.removeEventListener("karmicascension:booking-created", handleLocalEvent);
        window.removeEventListener("karmicascension:booking-updated", handleLocalEvent);
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
