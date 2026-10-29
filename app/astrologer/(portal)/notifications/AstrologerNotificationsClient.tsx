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
  Trash2,
  Loader2,
  CheckCheck,
} from "lucide-react";
import type { CustomerNotification } from "@/lib/types/database.types";
import {
  markAstrologerNotificationReadAction,
  getAstrologerNotificationsAction,
  clearAllAstrologerNotificationsAction,
  deleteAstrologerNotificationAction,
  markAllAstrologerNotificationsReadAction,
} from "@/app/actions/astrologer-portal";
import { formatExactDateTime } from "@/lib/astrologer/format";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

export default function AstrologerNotificationsClient({
  initialNotifications,
}: {
  initialNotifications: CustomerNotification[];
}) {
  const [notifications, setNotifications] = useState<CustomerNotification[]>(initialNotifications);
  const [clearing, setClearing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // On mount: immediately sync the header badge with the real unread count
  useEffect(() => {
    const unread = initialNotifications.filter((n) => !n.is_read).length;
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("jyotishsetu:notifications-updated", {
          detail: { count: unread },
        })
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll for live incoming notifications with background tab pausing
  useEffect(() => {
    let mounted = true;
    async function refresh() {
      // Pause polling when the browser tab is hidden / minimized
      if (typeof document !== "undefined" && document.hidden) return;

      try {
        const res = await getAstrologerNotificationsAction();
        if (mounted && res.success && Array.isArray(res.data)) {
          setNotifications(res.data);
          // Keep header badge in sync with live poll results
          const unread = res.data.filter((n) => !n.is_read).length;
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("jyotishsetu:notifications-updated", {
                detail: { count: unread },
              })
            );
          }
        }
      } catch {
        // Non-blocking poll
      }
    }

    const interval = setInterval(refresh, 8000);

    function onVisibilityChange() {
      if (typeof document !== "undefined" && !document.hidden && mounted) {
        refresh();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      mounted = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  function notifyCountChanged(remainingCount?: number) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("jyotishsetu:notifications-updated", {
          detail: { count: remainingCount },
        })
      );
    }
  }

  async function handleMarkRead(id: string) {
    setNotifications((prev) => {
      const updated = prev.map((n) =>
        n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
      );
      notifyCountChanged(updated.filter((n) => !n.is_read).length);
      return updated;
    });
    await markAstrologerNotificationReadAction(id);
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
    );
    notifyCountChanged(0);
    try {
      await markAllAstrologerNotificationsReadAction();
    } catch {
      // Non-blocking
    } finally {
      setMarkingAll(false);
    }
  }

  async function handleClearAll() {
    if (!confirm("Are you sure you want to clear all notifications?")) return;
    setClearing(true);
    const previous = [...notifications];
    setNotifications([]);
    notifyCountChanged(0);
    try {
      const res = await clearAllAstrologerNotificationsAction();
      if (!res.success) {
        setNotifications(previous);
        notifyCountChanged(previous.filter((n) => !n.is_read).length);
        alert(res.error || "Failed to clear notifications.");
      }
    } catch {
      setNotifications(previous);
      notifyCountChanged(previous.filter((n) => !n.is_read).length);
    } finally {
      setClearing(false);
    }
  }

  async function handleDeleteNotification(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setDeletingId(id);
    setNotifications((prev) => {
      const updated = prev.filter((n) => n.id !== id);
      notifyCountChanged(updated.filter((n) => !n.is_read).length);
      return updated;
    });
    try {
      await deleteAstrologerNotificationAction(id);
    } catch {
      // Non-blocking
    } finally {
      setDeletingId(null);
    }
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-4">
      {notifications.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-gold/30 bg-amber-50/70 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-midnight">
              {unreadCount > 0
                ? `You have ${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
                : "All notifications are read"}
            </span>
            <span className="text-[11px] text-muted hidden sm:inline">
              &bull; Click any item to review details
            </span>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={markingAll}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-midnight/80 hover:text-midnight bg-white/90 hover:bg-white rounded-lg border border-gold/30 transition-colors shadow-sm disabled:opacity-50"
                title="Mark all notifications as read"
              >
                <CheckCheck className="h-3.5 w-3.5 text-gold-deep" />
                <span>Mark all read</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleClearAll}
              disabled={clearing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors shadow-sm disabled:opacity-50"
              title="Clear all notifications"
            >
              {clearing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              <span>Clear all</span>
            </button>
          </div>
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

                  <div className="flex items-center gap-1 shrink-0">
                    {!isRead && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkRead(n.id);
                        }}
                        className="p-1.5 text-muted hover:text-gold-deep rounded-lg hover:bg-gold/10 transition-colors"
                        title="Mark as read"
                        aria-label="Mark as read"
                      >
                        <CheckCheck className="h-4 w-4" />
                      </button>
                    )}

                    {n.link_url && (
                      <Link
                        href={n.link_url}
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 text-gold-deep hover:text-midnight transition-colors"
                        title="View details"
                        aria-label="View link"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    )}

                    <button
                      type="button"
                      onClick={(e) => handleDeleteNotification(e, n.id)}
                      disabled={deletingId === n.id}
                      className="p-1.5 text-muted hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                      title="Delete notification"
                      aria-label="Delete notification"
                    >
                      {deletingId === n.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
