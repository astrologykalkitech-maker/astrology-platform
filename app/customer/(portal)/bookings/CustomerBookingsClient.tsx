"use client";

import React, { useSyncExternalStore, useState } from "react";
import Link from "next/link";
import {
  CalendarX2,
  CalendarCheck,
  Compass,
  MessageSquarePlus,
  Trash2,
  Clock,
  User,
  Sparkles,
} from "lucide-react";
import {
  CUSTOMER_BOOKINGS_STORAGE_KEY,
  isCustomerDemoBooking,
  type CustomerDemoBooking,
} from "@/lib/customer-demo";
import { buttonStyles } from "@/components/astrologer/ui/Button";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getStoredBookingsSnapshot(): CustomerDemoBooking[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(CUSTOMER_BOOKINGS_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.every(isCustomerDemoBooking)) {
      return parsed;
    }
  } catch {
    // Ignore corrupt store
  }
  return [];
}

const SERVER_SNAPSHOT: CustomerDemoBooking[] = [];

export default function CustomerBookingsClient() {
  const storeBookings = useSyncExternalStore(
    subscribe,
    getStoredBookingsSnapshot,
    () => SERVER_SNAPSHOT
  );

  const [localBookings, setLocalBookings] = useState<CustomerDemoBooking[] | null>(null);

  const bookings = localBookings ?? storeBookings;

  function handleCancelBooking(id: string) {
    const updated = bookings.filter((b) => b.id !== id);
    setLocalBookings(updated);
    try {
      localStorage.setItem(CUSTOMER_BOOKINGS_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Fallback
    }
  }

  if (bookings.length === 0) {
    return (
      <div className={`${CARD} py-16 px-6 text-center`}>
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep mb-4">
          <CalendarX2 className="h-8 w-8" />
        </span>
        <h2 className="text-lg font-semibold text-midnight">No Scheduled Bookings</h2>
        <p className="text-xs text-muted max-w-md mx-auto mt-1 mb-6">
          You currently have no scheduled live consultation sessions. Select a certified Vedic astrologer or submit a question to begin.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/customer/astrologers" className={buttonStyles({ variant: "gold", size: "sm" })}>
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
    );
  }

  return (
    <div className={`${CARD} overflow-hidden p-0`}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gold/20 bg-parchment/40 text-xs font-semibold uppercase tracking-wider text-muted">
              <th className="py-3.5 px-4">Booking ID</th>
              <th className="py-3.5 px-4">Astrologer</th>
              <th className="py-3.5 px-4">Type & Topic</th>
              <th className="py-3.5 px-4">Date & Slot</th>
              <th className="py-3.5 px-4">Fee</th>
              <th className="py-3.5 px-4">Status</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gold/10">
            {bookings.map((booking) => (
              <tr key={booking.id} className="hover:bg-parchment/30 transition-colors">
                <td className="py-4 px-4 font-mono text-xs text-muted">
                  {booking.id}
                </td>
                <td className="py-4 px-4 font-semibold text-midnight">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gold-deep" />
                    <span>{booking.astrologer}</span>
                  </div>
                </td>
                <td className="py-4 px-4 text-ink">
                  <p className="text-xs font-semibold text-midnight">{booking.service}</p>
                  <p className="text-[11px] text-muted">{booking.consultation} Consultation</p>
                </td>
                <td className="py-4 px-4 text-xs text-muted whitespace-nowrap">
                  <div className="flex items-center gap-1.5 font-medium text-ink/90">
                    <Clock className="h-3.5 w-3.5 text-gold-deep" />
                    <span>{booking.date} at {booking.time}</span>
                  </div>
                </td>
                <td className="py-4 px-4 font-semibold text-midnight">
                  ₹{booking.price}
                </td>
                <td className="py-4 px-4">
                  <span className="inline-block rounded-full border border-emerald/30 bg-emerald/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                    {booking.status}
                  </span>
                </td>
                <td className="py-4 px-4 text-right">
                  <button
                    type="button"
                    onClick={() => handleCancelBooking(booking.id)}
                    className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium p-1 rounded hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Cancel
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
