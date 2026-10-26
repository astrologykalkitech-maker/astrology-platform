"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Bell,
  Clock,
  Calendar,
  MessageSquare,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import type { CustomerNotification } from "@/lib/types/database.types";
import { markAstrologerNotificationReadAction, getAstrologerNotificationsAction } from "@/app/actions/astrologer-portal";
import { formatExactDateTime } from "@/lib/astrologer/format";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

export default function AstrologerNotificationsClient({
  initialNotifications,
}: {
  initialNotifications: CustomerNotification[];
}) {
  const [notifications, setNotifications] = useState<CustomerNotification[]>(initialNotifications);

  // Poll for live incoming notifications
  useEffect(() => {
    let mounted = true;
    async function refresh() {
      try {
        const res = await getAstrologerNotificationsAction();
        if (mounted && res.success && Array.isArray(res.data)) {
          setNotifications(res.data);
        }
      } catch {
        // Non-blocking poll
      }
    }

    const interval = setInterval(refresh, 8000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  async function handleMarkRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
    );
    await markAstrologerNotificationReadAction(id);
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;


  return (
    <div className="space-y-4">
      {unreadCount > 0 && (
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-gold/30 bg-amber-50/70 text-xs">
          <span className="font-semibold text-midnight">
            You have {unreadCount} unread notification{unreadCount === 1 ? "" : "s"}
          </span>
          <span className="text-[11px] text-muted">Click any item to review details</span>
        </div>
      )}

      {notifications.length === 0 ? (
        <div className={`${CARD} py-16 px-6 text-center`}>
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep mb-4">
            <Bell className="h-8 w-8" />
          </span>
          <h2 className="text-lg font-semibold text-midnight">No Notifications Yet</h2>
          <p className="text-xs text-muted max-w-md mx-auto mt-1 mb-6">
            When you receive new lead assignments, booking requests, or administrative listing updates, they will appear here.
          </p>
          <Link
            href="/astrologer/dashboard"
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-4 py-2 text-xs font-semibold text-midnight shadow"
          >
            Go to Dashboard
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => {
            const isRead = n.is_read;

            return (
              <div
                key={n.id}
                onClick={() => !isRead && handleMarkRead(n.id)}
                className={`${CARD} p-4 transition-all hover:border-gold/60 cursor-pointer ${
                  !isRead ? "border-l-4 border-l-gold bg-amber-50/20" : "opacity-90"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        !isRead ? "bg-gold text-midnight" : "bg-gold/15 text-gold-deep"
                      }`}
                    >
                      {n.event_type === "booking_created" ? (
                        <Calendar className="h-4 w-4" />
                      ) : n.event_type === "consultation_message" ? (
                        <MessageSquare className="h-4 w-4" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-midnight">{n.title}</h4>
                        {!isRead && (
                          <span className="h-2 w-2 rounded-full bg-gold animate-pulse" />
                        )}
                      </div>
                      <p className="text-xs text-ink/80 mt-0.5 leading-relaxed">{n.message}</p>
                      <p className="text-[11px] text-muted mt-1.5 flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        {formatExactDateTime(n.created_at)}
                      </p>
                    </div>
                  </div>

                  {n.link_url && (
                    <Link
                      href={n.link_url}
                      className="shrink-0 p-1.5 text-gold-deep hover:text-midnight transition-colors"
                      aria-label="View link"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
