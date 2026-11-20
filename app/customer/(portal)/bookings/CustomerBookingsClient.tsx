"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  CalendarX2,
  Compass,
  MessageSquarePlus,
  Trash2,
  Clock,
  User,
  AlertCircle,
  Loader2,
  Video,
  PhoneCall,
  MessageSquare,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react";
import type { CustomerBooking } from "@/lib/types/database.types";
import { cancelCustomerBookingAction } from "@/app/actions/customer";
import { DirectBookingPaymentForm } from "@/components/customer/DirectBookingPaymentForm";
import { UnifiedCheckoutModal } from "@/components/pay/CheckoutMethodSelector";
import { buttonStyles } from "@/components/astrologer/ui/Button";
import { formatExactDateTime } from "@/lib/astrologer/format";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

interface Props {
  initialBookings?: CustomerBooking[];
}

export default function CustomerBookingsClient({ initialBookings = [] }: Props) {
  const router = useRouter();
  const [bookings, setBookings] = useState<CustomerBooking[]>(initialBookings);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeJoinBooking, setActiveJoinBooking] = useState<CustomerBooking | null>(null);
  const [activeCheckoutBooking, setActiveCheckoutBooking] = useState<CustomerBooking | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  // Sync state whenever initialBookings prop updates
  React.useEffect(() => {
    setBookings(initialBookings);
  }, [initialBookings]);

  // Real-time synchronization: subscribe to customer_bookings changes & local events
  React.useEffect(() => {
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;
    try {
      const supabase = createClient();
      channel = supabase
        .channel("customer-bookings-live-sync")
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
      console.warn("[CustomerBookingsClient] realtime notice:", err);
    }

    const handleLocalSync = () => {
      router.refresh();
    };
    window.addEventListener("karmicascension:booking-created", handleLocalSync);
    window.addEventListener("karmicascension:booking-updated", handleLocalSync);

    return () => {
      window.removeEventListener("karmicascension:booking-created", handleLocalSync);
      window.removeEventListener("karmicascension:booking-updated", handleLocalSync);
      if (channel) {
        createClient().removeChannel(channel);
      }
    };
  }, [router]);

  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Checks if current time is within join window (15 mins prior to end of session)
  function isJoinWindowActive(scheduledAt: string, durationMinutes: number) {
    const slotTime = new Date(scheduledAt).getTime();
    const windowStart = slotTime - 15 * 60 * 1000; // 15 mins before
    const windowEnd = slotTime + durationMinutes * 60 * 1000; // session end
    return now >= windowStart && now <= windowEnd;
  }

  async function handleCancelBooking(id: string) {
    const confirmed = window.confirm(
      "Are you sure you want to cancel this scheduled consultation?"
    );
    if (!confirmed) return;

    setCancellingId(id);
    setErrorMessage(null);

    // Optimistic UI update (instant 0ms response)
    setBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b))
    );
    window.dispatchEvent(new CustomEvent("karmicascension:booking-updated"));

    const res = await cancelCustomerBookingAction(id, "Cancelled by user via customer portal");
    setCancellingId(null);

    if (res.success) {
      router.refresh();
    } else {
      // Revert if error
      setBookings(initialBookings);
      setErrorMessage(res.error || "Failed to cancel booking. Please try again.");
    }
  }

  return (
    <div className="space-y-4">
      {errorMessage && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-medium">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {bookings.length === 0 ? (
        <div className={`${CARD} py-16 px-6 text-center`}>
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep mb-4">
            <CalendarX2 className="h-8 w-8" />
          </span>
          <h2 className="text-lg font-semibold text-midnight">No Scheduled Bookings</h2>
          <p className="text-xs text-muted max-w-md mx-auto mt-1 mb-6">
            You currently have no scheduled live consultation sessions. Select an approved Vedic astrologer or submit a consultation enquiry to begin.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/customer/astrologers"
              className={buttonStyles({ variant: "gold", size: "sm" })}
            >
              <Compass className="h-4 w-4" /> Browse Astrologers
            </Link>
            <Link
              href="/customer/enquiries/new"
              className={buttonStyles({ variant: "outline", size: "sm" })}
            >
              <MessageSquarePlus className="h-4 w-4" /> Ask Platform Directly
            </Link>
          </div>
        </div>
      ) : (
        <div className={`${CARD} overflow-hidden p-0`}>
          {/* Mobile Card Reflow (< md) */}
          <div className="divide-y divide-gold/10 md:hidden">
            {bookings.map((booking) => {
              const displayDate = formatExactDateTime(booking.scheduled_at);
              const isCancelled = booking.status === "cancelled";
              const isConfirmed = booking.status === "confirmed";
              const isCompleted = booking.status === "completed";

              return (
                <div key={booking.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm text-midnight flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-gold-deep" />
                        <span>{booking.astrologer_name || "Vedic Astrologer"}</span>
                      </p>
                      <p className="text-xs text-ink/80 mt-0.5">
                        {booking.service_type} ({booking.consultation_mode})
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        isCancelled
                          ? "border-red-200 bg-red-50 text-red-700"
                          : isCompleted
                          ? "border-emerald/40 bg-emerald/10 text-emerald-800"
                          : isConfirmed
                          ? "border-sky-200 bg-sky-50 text-sky-800"
                          : "border-amber-200 bg-amber-50 text-amber-800"
                      }`}
                    >
                      {booking.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted pt-2 border-t border-gold/10">
                    <div className="flex items-center gap-1 font-medium text-ink/90">
                      <Clock className="h-3.5 w-3.5 text-gold-deep" />
                      <span>{displayDate}</span>
                    </div>
                    <span className="font-semibold text-midnight">₹{booking.price}</span>
                  </div>

                  {/* Mobile actions row: Join + Cancel */}
                  <div className="flex items-center justify-between pt-1 gap-2">
                    {/* Completed indicator */}
                    {isCompleted && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg bg-emerald/10 text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Completed</span>
                      </span>
                    )}

                    {/* Join button in mobile card view (F-08 fix) */}
                    {isConfirmed && booking.consultation_mode !== "Chat" && (
                      isJoinWindowActive(booking.scheduled_at, booking.duration_minutes) ? (
                        <Link
                          href={`/consultation/${booking.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition-colors"
                        >
                          {booking.consultation_mode === "Video" ? (
                            <Video className="h-3.5 w-3.5" />
                          ) : (
                            <PhoneCall className="h-3.5 w-3.5" />
                          )}
                          <span>Join {booking.consultation_mode}</span>
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setActiveJoinBooking(booking)}
                          className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-gold/15 text-gold-deep hover:bg-gold/25 transition-colors"
                        >
                          {booking.consultation_mode === "Video" ? (
                            <Video className="h-3.5 w-3.5" />
                          ) : (
                            <PhoneCall className="h-3.5 w-3.5" />
                          )}
                          <span>{booking.consultation_mode} Details</span>
                        </button>
                      )
                    )}
                    <div className="flex items-center gap-2 ml-auto">
                      <span className="font-mono text-[10px] text-muted truncate max-w-[100px]">
                        {booking.id.slice(0, 8)}
                      </span>
                      {booking.status === "pending" && Number(booking.price) > 0 && (
                        <button
                          type="button"
                          onClick={() => setActiveCheckoutBooking(booking)}
                          className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-600 to-yellow-600 text-white shadow-sm hover:opacity-95 transition-opacity"
                        >
                          Pay Now
                        </button>
                      )}
                      {!isCancelled && !isCompleted && (
                        <button
                          type="button"
                          disabled={cancellingId === booking.id}
                          onClick={() => handleCancelBooking(booking.id)}
                          className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium py-1 px-2 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          {cancellingId === booking.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                  <DirectBookingPaymentForm booking={booking} />
                </div>
              );
            })}
          </div>

          {/* Desktop Table View (>= md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gold/20 bg-parchment/40 text-xs font-semibold uppercase tracking-wider text-muted">
                  <th className="py-3.5 px-4">Booking ID</th>
                  <th className="py-3.5 px-4">Astrologer</th>
                  <th className="py-3.5 px-4">Type & Mode</th>
                  <th className="py-3.5 px-4">Scheduled Slot</th>
                  <th className="py-3.5 px-4">Fee</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gold/10">
                {bookings.map((booking) => {
                  const displayDate = formatExactDateTime(booking.scheduled_at);
                  const isCancelled = booking.status === "cancelled";
                  const isConfirmed = booking.status === "confirmed";
                  const isCompleted = booking.status === "completed";

                  return (
                    <React.Fragment key={booking.id}>
                    <tr className="hover:bg-parchment/30 transition-colors">
                      <td className="py-4 px-4 font-mono text-xs text-muted">
                        {booking.id.slice(0, 8)}...
                      </td>
                      <td className="py-4 px-4 font-semibold text-midnight">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-gold-deep" />
                          <span>{booking.astrologer_name || "Vedic Astrologer"}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-ink">
                        <p className="text-xs font-semibold text-midnight">
                          {booking.service_type}
                        </p>
                        <p className="text-[11px] text-muted">
                          {booking.consultation_mode} ({booking.duration_minutes} mins)
                        </p>
                      </td>
                      <td className="py-4 px-4 text-xs text-muted whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-medium text-ink/90">
                          <Clock className="h-3.5 w-3.5 text-gold-deep" />
                          <span>{displayDate}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4 font-semibold text-midnight">
                        ₹{booking.price}
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                            isCancelled
                              ? "border-red-200 bg-red-50 text-red-700"
                              : isCompleted
                              ? "border-emerald/40 bg-emerald/10 text-emerald-800"
                              : isConfirmed
                              ? "border-sky-200 bg-sky-50 text-sky-800"
                              : "border-amber-200 bg-amber-50 text-amber-800"
                          }`}
                        >
                          {booking.status}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isCompleted && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald/10 text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Completed</span>
                            </span>
                          )}

                          {isConfirmed && (
                            isJoinWindowActive(booking.scheduled_at, booking.duration_minutes) ? (
                              <Link
                                href={`/consultation/${booking.id}`}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition-colors"
                              >
                                {booking.consultation_mode === "Video" ? (
                                  <Video className="h-3.5 w-3.5" />
                                ) : booking.consultation_mode === "Call" ? (
                                  <PhoneCall className="h-3.5 w-3.5" />
                                ) : (
                                  <MessageSquare className="h-3.5 w-3.5" />
                                )}
                                <span>Join {booking.consultation_mode}</span>
                              </Link>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setActiveJoinBooking(booking)}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-gold/15 text-gold-deep hover:bg-gold/25 transition-colors"
                              >
                                {booking.consultation_mode === "Video" ? (
                                  <Video className="h-3.5 w-3.5" />
                                ) : booking.consultation_mode === "Call" ? (
                                  <PhoneCall className="h-3.5 w-3.5" />
                                ) : (
                                  <MessageSquare className="h-3.5 w-3.5" />
                                )}
                                <span>{booking.consultation_mode} Details</span>
                              </button>
                            )
                          )}

                          {booking.status === "pending" && Number(booking.price) > 0 && (
                            <button
                              type="button"
                              onClick={() => setActiveCheckoutBooking(booking)}
                              className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-600 to-yellow-600 text-white shadow-sm hover:opacity-95 transition-opacity"
                            >
                              Pay Now
                            </button>
                          )}

                          {!isCancelled && !isCompleted && (
                            <button
                              type="button"
                              disabled={cancellingId === booking.id}
                              onClick={() => handleCancelBooking(booking.id)}
                              className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium p-1 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                            >
                              {cancellingId === booking.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    <tr className="border-b border-gold/10 bg-parchment/10">
                      <td colSpan={7} className="px-4 py-3">
                        <DirectBookingPaymentForm booking={booking} />
                      </td>
                    </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Join Consultation Session Modal */}
      {activeJoinBooking && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/70 p-4 backdrop-blur-xs"
        >
          <div className={`${CARD} w-full max-w-lg p-6 sm:p-7 space-y-4`}>
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gold-deep">
                  Live Consultation Entry
                </span>
                <h3 className="text-lg font-bold text-midnight font-display mt-0.5">
                  {activeJoinBooking.consultation_mode} Consultation with {activeJoinBooking.astrologer_name || "Vedic Astrologer"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveJoinBooking(null)}
                className="text-gray-400 hover:text-midnight text-xl font-bold px-2"
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            <div className="rounded-xl border border-gold/20 bg-parchment/40 p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted">Service:</span>
                <span className="font-semibold text-midnight">{activeJoinBooking.service_type}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Scheduled Time:</span>
                <span className="font-semibold text-midnight">{formatExactDateTime(activeJoinBooking.scheduled_at)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Duration:</span>
                <span className="font-semibold text-midnight">{activeJoinBooking.duration_minutes} Minutes</span>
              </div>
            </div>

            {isJoinWindowActive(activeJoinBooking.scheduled_at, activeJoinBooking.duration_minutes) ? (
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2 p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs">
                  <Clock className="h-4 w-4 shrink-0 text-emerald-600" />
                  <div>
                    <p className="font-semibold text-emerald-900">Your consultation room is ready.</p>
                    <p className="text-[11px] text-emerald-700 mt-0.5">
                      Your astrologer can now join your private consultation.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Link
                    href={`/consultation/${activeJoinBooking.id}`}
                    className={buttonStyles({
                      variant: "gold",
                      size: "md",
                      fullWidth: true,
                      className: "justify-center shadow-md font-semibold gap-2",
                    })}
                  >
                    <Video className="h-4 w-4 text-midnight" /> Join Consultation
                  </Link>
                  <p className="text-[11px] text-muted text-center">
                    Private, encrypted in-house WebRTC session with real-time video, audio, and consultation notes.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 pt-2">
                <div className="flex items-start gap-2.5 p-3.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <p className="font-semibold">Room Not Yet Opened</p>
                    <p className="mt-0.5 text-amber-700">
                      The live {activeJoinBooking.consultation_mode.toLowerCase()} room unlocks 15 minutes before the scheduled Muhurat time.
                    </p>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setActiveJoinBooking(null)}
                    className={buttonStyles({ variant: "outline", size: "sm" })}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Unified Checkout Modal */}
      {activeCheckoutBooking && (
        <UnifiedCheckoutModal
          isOpen={!!activeCheckoutBooking}
          booking={activeCheckoutBooking}
          onClose={() => setActiveCheckoutBooking(null)}
          onSuccess={() => {
            setActiveCheckoutBooking(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
