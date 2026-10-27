import React from "react";
import Link from "next/link";
import { ArrowLeft, Calendar, Clock, Video, PhoneCall, MessageSquare, ExternalLink, ShieldAlert } from "lucide-react";
import { requireAstrologerPage } from "@/lib/astrologer/guard";
import { getAstrologerBookingsAction } from "@/app/actions/astrologer-portal";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { formatExactDateTime } from "@/lib/astrologer/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My Consultation Bookings | JyotishSetu",
  description: "Manage upcoming and historical Vedic consultation sessions with customers.",
};

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

/**
 * Constructs the consultation room URL for a given booking.
 * Uses full booking UUID to maximize entropy and reduce guessability.
 * Note: Jit.si public rooms do not require authentication — the full UUID
 * is used as a long, high-entropy room name to deter casual guessing.
 * For production with authenticated rooms, replace with a token-based provider.
 */
function getConsultationRoomUrl(bookingId: string): string {
  return `https://meet.jit.si/jyotishsetu-${bookingId}`;
}

/**
 * Checks if the current server time is within the consultation join window.
 * Window opens 15 minutes before the scheduled time and closes at session end.
 */
function isJoinWindowActive(scheduledAt: string, durationMinutes: number, now: Date): boolean {
  const slotTime = new Date(scheduledAt).getTime();
  const windowStart = slotTime - 15 * 60 * 1000; // 15 mins before
  const windowEnd = slotTime + durationMinutes * 60 * 1000; // session end
  const nowMs = now.getTime();
  return nowMs >= windowStart && nowMs <= windowEnd;
}

export default async function AstrologerBookingsPage() {
  await requireAstrologerPage();
  const res = await getAstrologerBookingsAction();
  const bookings = res.success && res.data ? res.data : [];
  const now = new Date();

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Link
          href="/astrologer/dashboard"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gold/30 bg-white text-gold-deep hover:bg-parchment transition-colors"
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
                <div>
          <CardTitle>Consultation Bookings</CardTitle>
          <p className="text-xs text-muted">
            Manage scheduled consultations, client Muhurat appointments, and completed sessions.
          </p>
        </div>
        {/* Create Booking button */}
        <Link
          href="/astrologer/bookings/new"
          className="ml-auto inline-flex items-center gap-2 rounded-xl bg-gold/15 px-4 py-2 text-sm font-medium text-gold-deep hover:bg-gold/25"
        >
          Create Booking
        </Link>
      </div>

      {bookings.length === 0 ? (
        <div className={`${CARD} py-16 px-6 text-center`}>
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep mb-4">
            <Calendar className="h-8 w-8" />
          </span>
          <h2 className="text-lg font-semibold text-midnight">No Consultation Bookings Yet</h2>
          <p className="text-xs text-muted max-w-md mx-auto mt-1 mb-6">
            When verified customers book video or voice consultations with your profile, they will appear here with scheduled timing and join links.
          </p>
          <Link
            href="/astrologer/leads"
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-4 py-2 text-xs font-semibold text-midnight shadow"
          >
            Check Assigned Enquiries
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const isCompleted = booking.status === "completed";
            const isConfirmed = booking.status === "confirmed";
            const isCancelled = booking.status === "cancelled";
            const joinWindowActive = isConfirmed && isJoinWindowActive(
              booking.scheduled_at,
              booking.duration_minutes,
              now
            );
            const roomUrl = getConsultationRoomUrl(booking.id);

            const ModeIcon =
              booking.consultation_mode === "Video"
                ? Video
                : booking.consultation_mode === "Call"
                ? PhoneCall
                : MessageSquare;

            return (
              <div key={booking.id} className={`${CARD} p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4`}>
                {/* Left: Booking Details */}
                <div className="flex items-start gap-3.5 flex-1">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold-deep">
                    <ModeIcon className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-midnight capitalize">
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
                    <p className="text-xs font-medium text-midnight mt-0.5">
                      Client: <span className="text-gold-deep font-semibold">{booking.customer_name || "Verified Customer"}</span>
                    </p>
                    <p className="text-xs text-muted mt-0.5 flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5" />
                      Scheduled: {formatExactDateTime(booking.scheduled_at)}
                    </p>
                    <p className="text-xs text-ink/80 mt-1">
                      Mode: <span className="font-medium capitalize">{booking.consultation_mode}</span> &bull; Duration: {booking.duration_minutes || 30} mins
                    </p>
                  </div>
                </div>

                {/* Right: Fee + Join Action */}
                <div className="flex items-center gap-3 w-full sm:w-auto justify-end border-t border-line sm:border-0 pt-3 sm:pt-0">
                  <div className="text-right">
                    <p className="text-xs text-muted">Consultation Fee</p>
                    <p className="text-sm font-bold text-midnight">₹{booking.price || 0}</p>
                  </div>

                  {isConfirmed && booking.consultation_mode !== "Chat" && (
                    joinWindowActive ? (
                      <a
                        href={roomUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold shadow transition-colors animate-pulse"
                        aria-label={`Join ${booking.consultation_mode} session`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Join {booking.consultation_mode}
                      </a>
                    ) : (
                      <div className="flex flex-col items-end gap-1">
                        <span className="rounded-xl bg-gold/15 text-gold-deep px-3.5 py-1.5 text-xs font-semibold">
                          {booking.consultation_mode} — Scheduled
                        </span>
                        <span className="text-[10px] text-muted text-right">
                          Join opens 15 min before
                        </span>
                      </div>
                    )
                  )}

                  {isConfirmed && booking.consultation_mode === "Chat" && (
                    <span className="rounded-xl bg-gold/15 text-gold-deep px-3.5 py-1.5 text-xs font-semibold">
                      Chat — Use Enquiry Thread
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Room Security Notice */}
      {bookings.some((b) => b.status === "confirmed" && b.consultation_mode !== "Chat") && (
        <div className={`${CARD} p-4`}>
          <div className="flex items-start gap-3 text-xs text-muted">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
            <div>
              <p className="font-semibold text-ink/80 mb-0.5">About Consultation Rooms</p>
              <p>
                Video and call consultations use Jit.si browser-based rooms. The room link is
                shared only with confirmed participants. For enhanced privacy, a private Jit.si
                deployment or an authenticated room provider may be configured by the platform administrator.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
