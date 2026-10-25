"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Bell,
  BellOff,
  ArrowRight,
  CheckCheck,
  Calendar,
} from "lucide-react";
import type { CustomerNotification } from "@/lib/types/database.types";
import { markNotificationReadAction } from "@/app/actions/customer";
import { formatExactDateTime } from "@/lib/astrologer/format";
import { buttonStyles } from "@/components/astrologer/ui/Button";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

interface Props {
  initialNotifications?: CustomerNotification[];
}

export default function CustomerNotificationsClient({
  initialNotifications = [],
}: Props) {
  const [notifications, setNotifications] =
    useState<CustomerNotification[]>(initialNotifications);

  async function handleMarkRead(id: string) {
    const res = await markNotificationReadAction(id);
    if (res.success) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    }
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  if (notifications.length === 0) {
    return (
      <div className={`${CARD} py-16 px-6 text-center`}>
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep mb-4">
          <BellOff className="h-8 w-8" />
        </span>
        <h2 className="text-lg font-semibold text-midnight">All Caught Up</h2>
        <p className="text-xs text-muted max-w-md mx-auto mt-1 mb-6">
          You have no notifications at this time. Updates regarding consultation enquiries, scheduled bookings, and astrologer responses will appear here.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/customer/enquiries"
            className={buttonStyles({ variant: "gold", size: "sm" })}
          >
            View My Enquiries
          </Link>
          <Link
            href="/customer/bookings"
            className={buttonStyles({ variant: "outline", size: "sm" })}
          >
            View My Bookings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`${CARD} p-0 overflow-hidden`}>
      <div className="p-4 sm:p-5 border-b border-gold/20 bg-parchment/30 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-midnight">
          Recent Notifications & Activity
        </h3>
        {unreadCount > 0 && (
          <span className="inline-flex items-center rounded-full bg-gold/20 px-2.5 py-0.5 text-xs font-semibold text-gold-deep">
            {unreadCount} Unread
          </span>
        )}
      </div>

      <div className="divide-y divide-gold/10">
        {notifications.map((item) => {
          const displayDate = formatExactDateTime(item.created_at);
          const isBooking = item.event_type?.includes("booking");

          return (
            <div
              key={item.id}
              className={`p-4 sm:p-5 flex items-start gap-4 transition-colors ${
                item.is_read ? "bg-white hover:bg-parchment/20" : "bg-amber-50/40 hover:bg-amber-50/60"
              }`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  isBooking
                    ? "bg-emerald/15 text-emerald-800"
                    : "bg-gold/15 text-gold-deep"
                }`}
              >
                {isBooking ? (
                  <Calendar className="h-5 w-5" />
                ) : (
                  <Bell className="h-5 w-5" />
                )}
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-midnight truncate flex items-center gap-1.5">
                    {!item.is_read && (
                      <span className="h-2 w-2 rounded-full bg-gold-deep shrink-0" />
                    )}
                    <span>{item.title}</span>
                  </p>
                  <span className="text-[11px] text-muted whitespace-nowrap">
                    {displayDate}
                  </span>
                </div>
                <p className="text-xs text-ink/80 mt-1 leading-relaxed">
                  {item.message}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!item.is_read && (
                  <button
                    type="button"
                    onClick={() => handleMarkRead(item.id)}
                    className="p-1.5 text-muted hover:text-gold-deep rounded-lg hover:bg-gold/10 transition-colors"
                    title="Mark as read"
                    aria-label="Mark notification as read"
                  >
                    <CheckCheck className="h-4 w-4" />
                  </button>
                )}
                {item.link_url && (
                  <Link
                    href={item.link_url}
                    className="p-1.5 text-muted hover:text-gold-deep rounded-lg hover:bg-gold/10 transition-colors"
                    aria-label="Navigate to related details"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
