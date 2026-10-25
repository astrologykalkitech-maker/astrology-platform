import React from "react";
import Link from "next/link";
import { ArrowLeft, Calendar, Clock, Video } from "lucide-react";
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

export default async function AstrologerBookingsPage() {
  await requireAstrologerPage();
  const res = await getAstrologerBookingsAction();
  const bookings = res.success && res.data ? res.data : [];

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

            return (
              <div key={booking.id} className={`${CARD} p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4`}>
                <div className="flex items-start gap-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold-deep">
                    <Video className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
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
                    <p className="text-xs text-muted mt-0.5 flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5" />
                      Scheduled: {formatExactDateTime(booking.scheduled_at)}
                    </p>
                    <p className="text-xs text-ink/80 mt-1">
                      Mode: <span className="font-medium capitalize">{booking.consultation_mode}</span> &bull; Duration: {booking.duration_minutes || 30} mins
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-end border-t border-line sm:border-0 pt-3 sm:pt-0">
                  <div className="text-right">
                    <p className="text-xs text-muted">Consultation Fee</p>
                    <p className="text-sm font-bold text-midnight">₹{booking.price || 0}</p>
                  </div>
                  {isConfirmed && (
                    <span className="rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-3.5 py-1.5 text-xs font-semibold text-midnight shadow">
                      {booking.consultation_mode} Session
                    </span>
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
