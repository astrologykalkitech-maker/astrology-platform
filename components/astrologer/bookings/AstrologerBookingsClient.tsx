"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Clock,
  Video,
  PhoneCall,
  MessageSquare,
  User,
  Search,
  CalendarPlus,
  ShieldAlert,
  Check,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import type { CustomerBooking, BookingStatus } from "@/lib/types/database.types";
import { updateAstrologerBookingStatusAction } from "@/app/actions/astrologer-portal";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/astrologer/ui/Avatar";
import { buttonStyles } from "@/components/astrologer/ui/Button";
import { formatExactDateTime } from "@/lib/astrologer/format";
import { OlaMap } from "@/components/maps/OlaMap";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

type FilterTab = "all" | "confirmed" | "pending" | "completed" | "cancelled";

interface Props {
  initialBookings: CustomerBooking[];
}

function isJoinWindowActive(scheduledAt: string, durationMinutes: number, now: Date): boolean {
  const slotTime = new Date(scheduledAt).getTime();
  const windowStart = slotTime - 15 * 60 * 1000; // 15 mins before
  const windowEnd = slotTime + durationMinutes * 60 * 1000; // session end
  const nowMs = now.getTime();
  return nowMs >= windowStart && nowMs <= windowEnd;
}

export default function AstrologerBookingsClient({ initialBookings }: Props) {
  const router = useRouter();
  const [bookings, setBookings] = useState<CustomerBooking[]>(initialBookings);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);

  // Sync state whenever initialBookings prop changes (e.g. from RSC revalidation)
  useEffect(() => {
    setBookings(initialBookings);
  }, [initialBookings]);

  // Real-time synchronization: subscribe to customer_bookings changes & local events
  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;
    try {
      const supabase = createClient();
      channel = supabase
        .channel("astrologer-bookings-live-sync")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "customer_bookings",
          },
          (payload) => {
            if (payload.eventType === "INSERT") {
              const newBooking = payload.new as CustomerBooking;
              setBookings((prev) => {
                if (prev.some((b) => b.id === newBooking.id)) return prev;
                return [newBooking, ...prev];
              });
              router.refresh();
            } else if (payload.eventType === "UPDATE") {
              const updated = payload.new as CustomerBooking;
              setBookings((prev) =>
                prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b))
              );
              router.refresh();
            } else if (payload.eventType === "DELETE") {
              const deletedId = (payload.old as { id?: string }).id;
              if (deletedId) {
                setBookings((prev) => prev.filter((b) => b.id !== deletedId));
              }
              router.refresh();
            }
          }
        )
        .subscribe();
    } catch (err) {
      console.warn("[AstrologerBookingsClient] realtime notice:", err);
    }

    const handleLocalSync = () => {
      router.refresh();
    };
    window.addEventListener("jyotishsetu:booking-created", handleLocalSync);
    window.addEventListener("jyotishsetu:booking-updated", handleLocalSync);

    return () => {
      window.removeEventListener("jyotishsetu:booking-created", handleLocalSync);
      window.removeEventListener("jyotishsetu:booking-updated", handleLocalSync);
      if (channel) {
        createClient().removeChannel(channel);
      }
    };
  }, [router]);

  // Handler for astrologer status transitions
  const handleUpdateStatus = async (bookingId: string, newStatus: BookingStatus) => {
    const confirmMsg =
      newStatus === "completed"
        ? "Mark this consultation as completed?"
        : newStatus === "cancelled"
        ? "Are you sure you want to cancel this consultation?"
        : `Confirm this consultation session?`;

    if (!window.confirm(confirmMsg)) return;

    setUpdatingId(bookingId);
    // Optimistic UI update (instant 0ms response)
    setBookings((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, status: newStatus } : b))
    );
    window.dispatchEvent(new CustomEvent("jyotishsetu:booking-updated"));

    const res = await updateAstrologerBookingStatusAction({
      bookingId,
      status: newStatus,
    });
    setUpdatingId(null);

    if (!res.success) {
      // Revert if error
      setBookings(initialBookings);
      alert(res.error || "Failed to update booking status.");
    } else {
      router.refresh();
    }
  };

  // Compute counts for tabs
  const tabCounts = useMemo(() => {
    const counts = { all: bookings.length, confirmed: 0, pending: 0, completed: 0, cancelled: 0 };
    for (const b of bookings) {
      if (b.status === "confirmed") counts.confirmed++;
      else if (b.status === "pending") counts.pending++;
      else if (b.status === "completed") counts.completed++;
      else if (b.status === "cancelled") counts.cancelled++;
    }
    return counts;
  }, [bookings]);

  // Filtered list
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (activeTab !== "all" && b.status !== activeTab) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = (b.customer_name || "").toLowerCase().includes(q);
        const serviceMatch = (b.service_type || "").toLowerCase().includes(q);
        return nameMatch || serviceMatch;
      }
      return true;
    });
  }, [bookings, activeTab, searchQuery]);

  return (
    <div className="space-y-5">
      {/* Search & Filter Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {(["all", "confirmed", "pending", "completed", "cancelled"] as FilterTab[]).map((tab) => {
            const isActive = activeTab === tab;
            const count = tabCounts[tab];
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold capitalize transition-all shrink-0 ${
                  isActive
                    ? "bg-midnight text-gold shadow-sm"
                    : "bg-white border border-gold/25 text-midnight hover:bg-parchment"
                }`}
              >
                <span>{tab}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    isActive ? "bg-gold text-midnight" : "bg-champagne/60 text-midnight"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search seeker or topic..."
            className="w-full rounded-xl border border-gold/25 bg-white pl-9 pr-3 py-1.5 text-xs text-midnight placeholder:text-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
          />
        </div>
      </div>

      {/* Bookings List */}
      {filteredBookings.length === 0 ? (
        <div className={`${CARD} py-14 px-6 text-center`}>
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep mb-3">
            <Calendar className="h-6 w-6" />
          </span>
          <h3 className="text-base font-semibold text-midnight">
            {searchQuery ? "No matching bookings found" : `No ${activeTab === "all" ? "" : activeTab} bookings`}
          </h3>
          <p className="text-xs text-muted max-w-sm mx-auto mt-1 mb-5">
            {searchQuery
              ? "Try adjusting your search query or clear the filter."
              : "When seekers schedule sessions or you create consultations from leads, they will appear here."}
          </p>
          <div className="flex items-center justify-center gap-3">
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className={buttonStyles({ variant: "outline", size: "sm" })}
              >
                Clear Search
              </button>
            )}
            <Link
              href="/astrologer/bookings/new"
              className={buttonStyles({ variant: "gold", size: "sm" })}
            >
              <CalendarPlus className="h-3.5 w-3.5 mr-1.5" /> Schedule New Consultation
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredBookings.map((booking) => {
            const isCompleted = booking.status === "completed";
            const isConfirmed = booking.status === "confirmed";
            const isCancelled = booking.status === "cancelled";
            const joinActive =
              isConfirmed &&
              isJoinWindowActive(booking.scheduled_at, booking.duration_minutes, now);

            const ModeIcon =
              booking.consultation_mode === "Video"
                ? Video
                : booking.consultation_mode === "Call"
                ? PhoneCall
                : MessageSquare;

            return (
              <div
                key={booking.id}
                className={`${CARD} p-5 space-y-4`}
              >
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
                  {/* Left: Avatar + Details */}
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <Avatar
                      name={booking.customer_name || "Seeker"}
                      src={booking.customer_avatar_url || null}
                      size="md"
                      className="shrink-0 mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-midnight capitalize truncate max-w-[280px]">
                          {booking.service_type || "Vedic Consultation"}
                        </h3>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                            isCompleted
                              ? "bg-emerald-100 text-emerald-800"
                              : isConfirmed
                              ? "bg-sky-100 text-sky-800"
                              : isCancelled
                              ? "bg-rose-100 text-rose-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {booking.status}
                        </span>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        <Link
                          href={`/astrologer/customers/${booking.customer_id}`}
                          className="font-semibold text-gold-deep hover:text-midnight transition-colors inline-flex items-center gap-1"
                        >
                          <User className="h-3 w-3" />
                          {booking.customer_name || "Verified Seeker"}
                        </Link>
                        <span className="text-muted flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatExactDateTime(booking.scheduled_at)}
                        </span>
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-ink/80">
                        <span className="inline-flex items-center gap-1 font-medium">
                          <ModeIcon className="h-3.5 w-3.5 text-gold-deep" />
                          {booking.consultation_mode} ({booking.duration_minutes || 30} mins)
                        </span>
                        <span>&bull;</span>
                        <span className="font-semibold text-midnight">
                          Fee: ₹{booking.price || 0}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end border-t border-line md:border-0 pt-3 md:pt-0 shrink-0">
                    <Link
                      href={`/astrologer/customers/${booking.customer_id}`}
                      className={buttonStyles({ variant: "outline", size: "sm" })}
                    >
                      View Seeker
                    </Link>

                    {/* Status transition: Pending -> Confirm */}
                    {booking.status === "pending" && (
                      <button
                        type="button"
                        disabled={updatingId === booking.id}
                        onClick={() => handleUpdateStatus(booking.id, "confirmed")}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
                      >
                        {updatingId === booking.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        Confirm
                      </button>
                    )}

                    {/* Status transition: Confirmed -> Mark Completed */}
                    {isConfirmed && (
                      <button
                        type="button"
                        disabled={updatingId === booking.id}
                        onClick={() => handleUpdateStatus(booking.id, "completed")}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-600/40 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
                        title="Mark consultation as completed"
                      >
                        {updatingId === booking.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        )}
                        Mark Completed
                      </button>
                    )}

                    {isConfirmed && booking.consultation_mode !== "Chat" && (
                      joinActive ? (
                        <Link
                          href={`/consultation/${booking.id}`}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-gold-deep text-midnight hover:bg-gold px-3.5 py-1.5 text-xs font-semibold shadow transition-colors"
                        >
                          <Video className="h-3.5 w-3.5" />
                          Join {booking.consultation_mode}
                        </Link>
                      ) : (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="rounded-xl bg-gold/15 text-gold-deep px-3 py-1 text-xs font-semibold">
                            Scheduled
                          </span>
                          <span className="text-[10px] text-muted">
                            Join opens 15m before
                          </span>
                        </div>
                      )
                    )}

                    {isConfirmed && booking.consultation_mode === "Chat" && (
                      <span className="rounded-xl bg-gold/15 text-gold-deep px-3 py-1 text-xs font-semibold">
                        Chat Consultation
                      </span>
                    )}
                  </div>
                </div>

                {/* Interactive Ola Maps Venue Visualizer */}
                {((booking as any).venue_address || (booking as any).latitude || ((booking.consultation_mode as string) === "InPerson") || (booking as any).service_type?.toLowerCase().includes("offline") || (booking as any).service_type?.toLowerCase().includes("havan")) && (
                  <div className="pt-2 border-t border-gold/15">
                    <OlaMap
                      latitude={(booking as any).latitude}
                      longitude={(booking as any).longitude}
                      address={(booking as any).venue_address || "Designated Holy Venue (In-Person Mandap)"}
                      landmark={(booking as any).landmark || "Main Sanctum"}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Security notice */}
      <div className={`${CARD} p-4`}>
        <div className="flex items-start gap-3 text-xs text-muted">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
          <div>
            <p className="font-semibold text-ink/80 mb-0.5">Encrypted In-House Consultation Rooms</p>
            <p>
              Video and audio sessions are hosted on secure, isolated, in-house WebRTC rooms. Seeker birth details
              and astrological consultation notes remain strictly confidential between you and the seeker.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

