"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Clock,
  Video,
  PhoneCall,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  X,
  Lock,
} from "lucide-react";
import { createCustomerBookingAction } from "@/app/actions/customer";
import type { ConsultationMode } from "@/lib/types/database.types";
import { Button } from "@/components/astrologer/ui/Button";

interface AstrologerBookingModalProps {
  astrologerId: string;
  astrologerName: string;
  voicePrice: number;
  chatPrice: number;
  videoPrice: number;
  isOpen: boolean;
  onClose: () => void;
}

export function AstrologerBookingModal({
  astrologerId,
  astrologerName,
  voicePrice = 15,
  chatPrice = 10,
  videoPrice = 25,
  isOpen,
  onClose,
}: AstrologerBookingModalProps) {
  const router = useRouter();
  const [mode, setMode] = useState<ConsultationMode>("Video");
  const [duration, setDuration] = useState<number>(30);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  });
  const [selectedTime, setSelectedTime] = useState<string>("10:00");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successBookingId, setSuccessBookingId] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentRate =
    mode === "Chat" ? chatPrice : mode === "Call" ? voicePrice : videoPrice;
  const totalPrice = currentRate * duration;

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const scheduledAtIso = new Date(`${selectedDate}T${selectedTime}:00`).toISOString();

      const res = await createCustomerBookingAction({
        astrologer_id: astrologerId,
        service_type: `${mode} Vedic Consultation`,
        consultation_mode: mode,
        scheduled_at: scheduledAtIso,
        duration_minutes: duration,
        notes: notes.trim() || undefined,
      });

      if (!res.success || !res.data) {
        setError(res.error || "Failed to book consultation appointment.");
        return;
      }

      setSuccessBookingId(res.data.id);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred while booking.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-midnight/70 backdrop-blur-xs">
      <div className="relative w-full max-w-lg rounded-2xl border border-gold/30 bg-white p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
        <div className="flex items-start justify-between border-b border-gold/15 pb-4">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gold-deep">
              Instant Scheduling
            </span>
            <h2 className="text-xl font-display font-bold text-midnight">
              Book Consultation with {astrologerName}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-gold/10 hover:text-midnight transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {successBookingId ? (
          <div className="py-6 text-center space-y-4">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-midnight font-display">
              Consultation Confirmed!
            </h3>
            <p className="text-xs text-muted max-w-sm mx-auto">
              Your {mode} consultation appointment has been created. You can complete direct payment or join at the scheduled time.
            </p>
            <div className="pt-2 flex justify-center gap-3">
              <Button
                variant="gold"
                size="sm"
                onClick={() => {
                  onClose();
                  router.push("/customer/bookings");
                }}
              >
                View in My Bookings
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleBookingSubmit} className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Mode selection */}
            <div>
              <label className="block text-xs font-semibold text-midnight mb-1.5">
                Consultation Mode
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["Video", "Call", "Chat"] as ConsultationMode[]).map((m) => {
                  const isSelected = mode === m;
                  const rate = m === "Chat" ? chatPrice : m === "Call" ? voicePrice : videoPrice;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                        isSelected
                          ? "border-gold bg-gold/10 text-midnight font-bold shadow-xs"
                          : "border-gold/20 bg-parchment/20 text-muted hover:border-gold/40"
                      }`}
                    >
                      {m === "Video" && <Video className="h-4 w-4 mb-1 text-gold-deep" />}
                      {m === "Call" && <PhoneCall className="h-4 w-4 mb-1 text-gold-deep" />}
                      {m === "Chat" && <MessageSquare className="h-4 w-4 mb-1 text-gold-deep" />}
                      <span className="text-xs">{m}</span>
                      <span className="text-[11px] font-normal text-muted">₹{rate}/min</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Duration */}
            <div>
              <label className="block text-xs font-semibold text-midnight mb-1.5">
                Duration (Minutes)
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[15, 30, 45, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setDuration(mins)}
                    className={`py-2 rounded-lg border text-xs font-semibold transition-all ${
                      duration === mins
                        ? "border-gold bg-midnight text-champagne"
                        : "border-gold/20 bg-white text-midnight hover:border-gold/40"
                    }`}
                  >
                    {mins} mins
                  </button>
                ))}
              </div>
            </div>

            {/* Date & Time selection */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-midnight mb-1.5">
                  <Calendar className="inline h-3.5 w-3.5 mr-1 text-gold-deep" /> Date
                </label>
                <input
                  type="date"
                  required
                  min={new Date().toISOString().slice(0, 10)}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full rounded-xl border border-gold/30 bg-white px-3 py-2 text-xs text-midnight outline-none focus:border-gold"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-midnight mb-1.5">
                  <Clock className="inline h-3.5 w-3.5 mr-1 text-gold-deep" /> Time (IST)
                </label>
                <input
                  type="time"
                  required
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  className="w-full rounded-xl border border-gold/30 bg-white px-3 py-2 text-xs text-midnight outline-none focus:border-gold"
                />
              </div>
            </div>

            {/* Notes / Question */}
            <div>
              <label className="block text-xs font-semibold text-midnight mb-1.5">
                Questions or Birth Details Notes (Optional)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Share your concerns, birth queries, or specific areas of focus..."
                className="w-full rounded-xl border border-gold/30 bg-white p-2.5 text-xs text-midnight placeholder:text-muted/60 outline-none focus:border-gold"
              />
            </div>

            {/* Total Summary */}
            <div className="flex items-center justify-between rounded-xl border border-gold/20 bg-parchment/40 p-3">
              <span className="text-xs font-semibold text-midnight">Total Amount:</span>
              <div className="text-right">
                <span className="text-base font-display font-bold text-midnight">₹{totalPrice}</span>
                <span className="text-[11px] text-muted block">Direct to Pandit (No platform fee)</span>
              </div>
            </div>

            <Button
              type="submit"
              variant="gold"
              size="lg"
              disabled={submitting}
              className="w-full py-3 text-center justify-center font-bold"
            >
              {submitting ? "Confirming Slot..." : `Confirm Booking • ₹${totalPrice}`}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
