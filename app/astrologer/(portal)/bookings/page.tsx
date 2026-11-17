import React from "react";
import Link from "next/link";
import { ArrowLeft, CalendarPlus } from "lucide-react";
import { requireAstrologerPage } from "@/lib/astrologer/guard";
import { getAstrologerBookingsAction } from "@/app/actions/astrologer-portal";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { buttonStyles } from "@/components/astrologer/ui/Button";
import AstrologerBookingsClient from "@/components/astrologer/bookings/AstrologerBookingsClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My Consultation Bookings | Karmic Ascension",
  description: "Manage upcoming and historical Vedic consultation sessions with customers.",
};

export default async function AstrologerBookingsPage() {
  const [, res] = await Promise.all([
    requireAstrologerPage(),
    getAstrologerBookingsAction(),
  ]);
  const bookings = res.success && res.data ? res.data : [];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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

        <Link
          href="/astrologer/bookings/new"
          className={buttonStyles({ variant: "gold", size: "sm" })}
        >
          <CalendarPlus className="h-3.5 w-3.5 mr-1.5" /> Schedule Consultation
        </Link>
      </div>

      <AstrologerBookingsClient initialBookings={bookings} />
    </div>
  );
}
