"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { soundNotificationService } from "@/lib/sound/SoundNotificationService";

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
      window.addEventListener("karmicascension:booking-created", handleLocalEvent);
      window.addEventListener("karmicascension:booking-updated", handleLocalEvent);

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
          (payload) => {
            const record = payload.new as { id?: string; status?: string } | undefined;
            if (payload.eventType === "INSERT") {
              void soundNotificationService.playConsultationRequestSound(record?.id);
            } else if (payload.eventType === "UPDATE") {
              if (record?.status === "cancelled") {
                void soundNotificationService.playBookingCancelledSound(record?.id ? `${record.id}-cancelled` : undefined);
              } else if (record?.status === "confirmed" || record?.status === "accepted") {
                void soundNotificationService.playBookingConfirmedSound(record?.id ? `${record.id}-confirmed` : undefined);
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
            table: "puja_bookings",
          },
          (payload) => {
            const record = payload.new as { id?: string; status?: string } | undefined;
            if (payload.eventType === "INSERT") {
              void soundNotificationService.playConsultationRequestSound(record?.id);
            } else if (payload.eventType === "UPDATE") {
              if (record?.status === "cancelled") {
                void soundNotificationService.playBookingCancelledSound(record?.id ? `${record.id}-cancelled` : undefined);
              } else if (record?.status === "confirmed" || record?.status === "accepted") {
                void soundNotificationService.playBookingConfirmedSound(record?.id ? `${record.id}-confirmed` : undefined);
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
            table: "lead_assignments",
          },
          (payload) => {
            const record = payload.new as { id?: string; status?: string } | undefined;
            if (payload.eventType === "INSERT") {
              void soundNotificationService.playConsultationRequestSound(record?.id);
            } else if (payload.eventType === "UPDATE") {
              if (record?.status === "cancelled") {
                void soundNotificationService.playBookingCancelledSound(record?.id ? `${record.id}-cancelled` : undefined);
              } else if (record?.status === "confirmed" || record?.status === "accepted") {
                void soundNotificationService.playBookingConfirmedSound(record?.id ? `${record.id}-confirmed` : undefined);
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
            if (record?.sender_role === "customer") {
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
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "astrologer_payouts",
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
            table: "astrologer_wallet_transactions",
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
            table: "commission_settlements",
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
        window.removeEventListener("karmicascension:booking-created", handleLocalEvent);
        window.removeEventListener("karmicascension:booking-updated", handleLocalEvent);
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

