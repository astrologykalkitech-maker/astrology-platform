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
  ShieldCheck,
  ChevronDown,
  ChevronUp,
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
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Sync the header badge after notification state has committed.
  useEffect(() => {
    const unread = notifications.filter((n) => !n.is_read).length;
    window.dispatchEvent(
      new CustomEvent("karmicascension:notifications-updated", {
        detail: { count: unread },
      })
    );
  }, [notifications]);

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

  async function handleMarkRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
      )
    );
    await markAstrologerNotificationReadAction(id);
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
    );
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
    try {
      const res = await clearAllAstrologerNotificationsAction();
      if (!res.success) {
        setNotifications(previous);
        alert(res.error || "Failed to clear notifications.");
      }
    } catch {
      setNotifications(previous);
    } finally {
      setClearing(false);
    }
  }

  async function handleDeleteNotification(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setDeletingId(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
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
            className="inline-flex items-center justify-center rounded-xl bg-linear-to-b from-[#e0bb6c] to-[#b98a36] px-4 py-2 text-xs font-semibold text-midnight shadow"
          >
            Go to Dashboard
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => {
            const isRead = n.is_read;
            const meta = (n.metadata as Record<string, any>) || {};
            const isSuperAdmin =
              meta.sender_type === "super_admin" ||
              n.event_type === "admin_broadcast_announcement" ||
              n.event_type === "super_admin_direct_message" ||
              n.event_type === "platform_compliance_notice";
            const priority = meta.priority || (isSuperAdmin ? "normal" : null);
            const category = meta.category || null;
            const isExpanded = !!expandedIds[n.id];
            const isLongMessage = (n.message || "").length > 180;

            return (
              <div
                key={n.id}
                onClick={() => !isRead && handleMarkRead(n.id)}
                className={`${CARD} p-4 transition-all hover:border-gold/60 cursor-pointer ${
                  !isRead ? "border-l-4 border-l-gold bg-amber-50/20" : "opacity-90"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        isSuperAdmin
                          ? "bg-midnight text-gold shadow-xs"
                          : !isRead
                          ? "bg-gold text-midnight"
                          : "bg-gold/15 text-gold-deep"
                      }`}
                    >
                      {isSuperAdmin ? (
                        <ShieldCheck className="h-4 w-4 text-gold" />
                      ) : n.event_type === "booking_created" ? (
                        <Calendar className="h-4 w-4" />
                      ) : n.event_type === "consultation_message" ? (
                        <MessageSquare className="h-4 w-4" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-semibold text-midnight">{n.title}</h4>
                        {!isRead && (
                          <span className="h-2 w-2 rounded-full bg-gold animate-pulse" />
                        )}
                        {isSuperAdmin && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-midnight px-2 py-0.5 text-[9px] font-bold text-champagne">
                            <ShieldCheck className="h-2.5 w-2.5 text-gold" />
                            From Super Admin
                          </span>
                        )}
                        {category && (
                          <span className="rounded-full bg-gold/15 border border-gold/30 px-2 py-0.5 text-[9px] font-semibold text-gold-deep capitalize">
                            {category.replace(/_/g, " ")}
                          </span>
                        )}
                        {priority && priority !== "normal" && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                              priority === "urgent"
                                ? "bg-rose-100 text-rose-800 border border-rose-300"
                                : priority === "high"
                                ? "bg-amber-100 text-amber-800 border border-amber-300"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {priority}
                          </span>
                        )}
                      </div>

                      {/* Complete Notification Body */}
                      <div className="mt-1">
                        <p
                          className={`text-xs text-ink/90 whitespace-pre-wrap leading-relaxed ${
                            !isExpanded && isLongMessage ? "line-clamp-2" : ""
                          }`}
                        >
                          {n.message}
                        </p>
                        {isLongMessage && (
                          <button
                            type="button"
                            onClick={(e) => toggleExpand(n.id, e)}
                            className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-gold-deep hover:text-midnight mt-1 cursor-pointer"
                          >
                            {isExpanded ? (
                              <>
                                <span>Show less</span>
                                <ChevronUp className="h-3 w-3" />
                              </>
                            ) : (
                              <>
                                <span>Read full message</span>
                                <ChevronDown className="h-3 w-3" />
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      <p className="text-[11px] text-muted mt-2 flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-gold-deep/70" />
                        {formatExactDateTime(n.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 pt-0.5">
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

                    {(() => {
                      // Smart link fallback: if link points to customer dashboard or is empty, route to communications or dashboard
                      let targetLink = n.link_url;
                      if (!targetLink || targetLink.startsWith("/customer/")) {
                        targetLink =
                          n.event_type === "admin_broadcast_announcement" ||
                          n.event_type === "super_admin_direct_message" ||
                          n.event_type === "platform_compliance_notice"
                            ? "/astrologer/communications"
                            : "/astrologer/dashboard";
                      }

                      return (
                        <Link
                          href={targetLink}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 text-gold-deep hover:text-midnight transition-colors"
                          title="View details & connect"
                          aria-label="View link"
                        >
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      );
                    })()}

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