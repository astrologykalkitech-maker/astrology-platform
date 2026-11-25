"use client";

import React, { useState, useEffect } from "react";
import {
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
  History,
  ShieldCheck,
  CalendarCheck,
} from "lucide-react";
import type { CustomerBooking } from "@/lib/types/database.types";
import {
  rescheduleCustomerBookingAction,
  getAstrologerAvailableSlotsAction,
} from "@/app/actions/customer";
import { formatExactDateTime, SCHEDULING_TIMEZONE } from "@/lib/astrologer/format";

interface RescheduleBookingModalProps {
  booking: CustomerBooking | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedBooking: CustomerBooking) => void;
}

export function RescheduleBookingModal({
  booking,
  isOpen,
  onClose,
  onSuccess,
}: RescheduleBookingModalProps) {
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [rescheduleReason, setRescheduleReason] = useState<string>("");
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState<boolean>(false);

  // Initialize selected date to tomorrow or next valid day
  useEffect(() => {
    if (isOpen && booking) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const yyyy = tomorrow.getFullYear();
      const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
      const dd = String(tomorrow.getDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}`;
      setSelectedDate(dateStr);
      setSelectedSlot("");
      setErrorMsg(null);
      setRescheduleReason("");
      setShowHistory(false);
    }
  }, [isOpen, booking]);

  // Load available slots whenever selected date or booking changes
  useEffect(() => {
    if (!booking || !selectedDate || !isOpen) return;

    let mounted = true;
    async function fetchSlots() {
      setLoadingSlots(true);
      setErrorMsg(null);
      try {
        const res = await getAstrologerAvailableSlotsAction({
          astrologerId: booking!.astrologer_id,
          date: selectedDate,
          durationMinutes: booking!.duration_minutes || 30,
          excludeBookingId: booking!.id,
        });

        if (!mounted) return;
        if (res.success && res.data) {
          setAvailableSlots(res.data.slots || []);
          if (res.data.slots.length > 0) {
            setSelectedSlot(res.data.slots[0]);
          } else {
            setSelectedSlot("");
          }
        } else {
          setErrorMsg(res.error || "No slots available for this date.");
          setAvailableSlots([]);
          setSelectedSlot("");
        }
      } catch {
        if (mounted) {
          setErrorMsg("Failed to load available time slots.");
          setAvailableSlots([]);
        }
      } finally {
        if (mounted) setLoadingSlots(false);
      }
    }

    void fetchSlots();
    return () => {
      mounted = false;
    };
  }, [booking, selectedDate, isOpen]);

  if (!isOpen || !booking) return null;

  const minDate = (() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  })();

  const maxDate = (() => {
    const future = new Date();
    future.setDate(future.getDate() + 45); // up to 45 days in advance
    const yyyy = future.getFullYear();
    const mm = String(future.getMonth() + 1).padStart(2, "0");
    const dd = String(future.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot) {
      setErrorMsg("Please select an available appointment slot.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await rescheduleCustomerBookingAction({
        bookingId: booking.id,
        newScheduledAt: selectedSlot,
        reason: rescheduleReason.trim(),
      });

      if (res.success && res.data) {
        onSuccess(res.data);
        onClose();
      } else {
        setErrorMsg(res.error || "Failed to reschedule booking. Please select another slot.");
      }
    } catch {
      setErrorMsg("An unexpected error occurred during rescheduling.");
    } finally {
      setSubmitting(false);
    }
  };

  const history = Array.isArray(booking.reschedule_history) ? booking.reschedule_history : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reschedule-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-midnight/70 backdrop-blur-xs"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-gold/30 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gold/15 bg-gradient-to-r from-parchment/60 to-white px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold/15 text-gold-deep">
              <CalendarCheck className="h-5 w-5" />
            </span>
            <div>
              <h2 id="reschedule-modal-title" className="text-base font-bold text-midnight">
                Reschedule Consultation
              </h2>
              <p className="text-xs text-muted">
                Choose a new auspicious slot with {booking.astrologer_name || "your astrologer"}.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-parchment hover:text-midnight transition-colors"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Current Details Card */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="rounded-xl border border-gold/20 bg-parchment/30 p-3.5 text-xs text-ink/80 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-midnight">{booking.service_type}</span>
              <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold uppercase">
                {booking.consultation_mode}
              </span>
            </div>
            <div className="text-muted flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-gold-deep shrink-0" />
              <span>Current: {formatExactDateTime(booking.scheduled_at)}</span>
            </div>
            {booking.reschedule_count && booking.reschedule_count > 0 ? (
              <div className="pt-1 flex items-center justify-between text-[11px] text-amber-800">
                <span>Rescheduled {booking.reschedule_count} time(s)</span>
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowHistory(!showHistory)}
                    className="underline text-gold-deep hover:text-midnight font-medium inline-flex items-center gap-1"
                  >
                    <History className="h-3 w-3" />
                    {showHistory ? "Hide history" : "View previous slots"}
                  </button>
                )}
              </div>
            ) : null}
          </div>

          {/* Previous slots history view */}
          {showHistory && history.length > 0 && (
            <div className="rounded-xl border border-gold/20 bg-white p-3 space-y-2 text-xs">
              <h4 className="font-semibold text-midnight text-[11px] uppercase tracking-wide">
                Reschedule History
              </h4>
              <div className="divide-y divide-gold/10">
                {history.map((h, i) => (
                  <div key={i} className="py-1.5 text-[11px] space-y-0.5">
                    <div className="text-muted">
                      From: {formatExactDateTime(h.previous_scheduled_at)}
                    </div>
                    <div className="font-medium text-midnight">
                      To: {formatExactDateTime(h.new_scheduled_at)}
                    </div>
                    {h.reason && <div className="italic text-muted/80">Reason: {h.reason}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Date selection */}
            <div>
              <label htmlFor="reschedule-date" className="block text-xs font-semibold text-midnight mb-1">
                Select New Date (Asia/Kolkata Timezone)
              </label>
              <div className="relative">
                <input
                  id="reschedule-date"
                  type="date"
                  min={minDate}
                  max={maxDate}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full rounded-xl border border-gold/30 bg-white px-3.5 py-2 text-xs text-midnight focus:border-gold-deep focus:outline-none focus:ring-1 focus:ring-gold-deep"
                  required
                />
              </div>
            </div>

            {/* Available Slots */}
            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">
                Available Time Slots
              </label>
              {loadingSlots ? (
                <div className="flex items-center justify-center p-6 text-xs text-muted">
                  <Loader2 className="h-4 w-4 animate-spin text-gold-deep mr-2" />
                  Checking astrologer calendar & availability...
                </div>
              ) : availableSlots.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  <span>
                    No bookable consultation slots found on this date. Please choose another date.
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto p-1 border border-gold/15 rounded-xl bg-parchment/20">
                  {availableSlots.map((slotIso) => {
                    const d = new Date(slotIso);
                    const timeLabel = d.toLocaleTimeString("en-IN", {
                      timeZone: SCHEDULING_TIMEZONE,
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    });
                    const isSelected = selectedSlot === slotIso;

                    return (
                      <button
                        key={slotIso}
                        type="button"
                        onClick={() => setSelectedSlot(slotIso)}
                        className={`rounded-lg py-2 px-1 text-center text-xs font-medium transition-all ${
                          isSelected
                            ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm ring-2 ring-emerald-500/50"
                            : "border border-gold/25 bg-white text-midnight hover:border-gold hover:bg-parchment"
                        }`}
                      >
                        {timeLabel}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Reason */}
            <div>
              <label htmlFor="reschedule-reason" className="block text-xs font-semibold text-midnight mb-1">
                Reason for Rescheduling (Optional)
              </label>
              <textarea
                id="reschedule-reason"
                rows={2}
                maxLength={300}
                placeholder="E.g., Unexpected schedule conflict or preferred Muhurat time..."
                value={rescheduleReason}
                onChange={(e) => setRescheduleReason(e.target.value)}
                className="w-full rounded-xl border border-gold/30 bg-white p-2.5 text-xs text-midnight placeholder:text-muted/60 focus:border-gold-deep focus:outline-none focus:ring-1 focus:ring-gold-deep"
              />
            </div>

            {/* Business Rules Banner */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-[11px] text-emerald-900 flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
              <div>
                <span className="font-semibold">Free Rescheduling: </span>
                Your appointment is rescheduled instantly with no additional fee. The previous time slot will be released back to the community immediately.
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gold/15">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-xl border border-gold/30 bg-white px-4 py-2 text-xs font-semibold text-midnight hover:bg-parchment transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !selectedSlot || availableSlots.length === 0}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-5 py-2 text-xs font-semibold text-midnight shadow hover:brightness-105 transition-all disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Rescheduling...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Confirm Reschedule</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
