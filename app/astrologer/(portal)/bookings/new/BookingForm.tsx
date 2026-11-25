"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Calendar,
  User,
  Sparkles,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { buttonStyles } from "@/components/astrologer/ui/Button";
import { toUtcIsoString, formatExactDateTime } from "@/lib/astrologer/format";
import {
  MANUAL_BOOKING_MAX_NOTES_LENGTH,
  MANUAL_BOOKING_MAX_SERVICE_LENGTH,
  type ManualBookingFieldErrors,
  type ManualBookingFormValues,
  validateManualBookingField,
  validateManualBookingForm,
} from "@/lib/astrologer/booking-validation";

interface BookingFormProps {
  initialCustomerId?: string;
  initialCustomerName?: string;
  initialLeadId?: string;
  initialServiceType?: string;
}

export default function BookingForm({
  initialCustomerId = "",
  initialCustomerName = "",
  initialLeadId = "",
  initialServiceType = "",
}: BookingFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<ManualBookingFormValues>({
    customer_id: initialCustomerId,
    service_type: initialServiceType || "Vedic Astrology Consultation",
    consultation_mode: "Video",
    scheduled_at: "",
    duration_minutes: 30,
    notes: initialLeadId ? `Scheduled from Lead Enquiry #${initialLeadId.slice(0, 8)}` : "",
  });
  const [fieldErrors, setFieldErrors] = useState<ManualBookingFieldErrors>({});
  const [touched, setTouched] = useState<Partial<Record<keyof ManualBookingFormValues, boolean>>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    const fieldName = name as keyof ManualBookingFormValues;
    const parsedValue = fieldName === "duration_minutes" ? Number(value) : value;

    setForm((prev) => ({
      ...prev,
      [fieldName]: parsedValue,
    }));
    setTouched((prev) => ({ ...prev, [fieldName]: true }));

    const nextFieldError = validateManualBookingField(fieldName, parsedValue);
    setFieldErrors((prev) => {
      const updated = { ...prev };
      if (nextFieldError) {
        updated[fieldName] = nextFieldError;
      } else {
        delete updated[fieldName];
      }
      return updated;
    });
    if (error) setError(null);
  };

  const handleBlur = (
    e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const fieldName = e.target.name as keyof ManualBookingFormValues;
    setTouched((prev) => ({ ...prev, [fieldName]: true }));
    const err = validateManualBookingField(fieldName, form[fieldName]);
    setFieldErrors((prev) => {
      const updated = { ...prev };
      if (err) updated[fieldName] = err;
      else delete updated[fieldName];
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validation = validateManualBookingForm(form);
    if (!validation.valid) {
      setFieldErrors(validation.errors);
      setTouched({
        customer_id: true,
        service_type: true,
        consultation_mode: true,
        scheduled_at: true,
        duration_minutes: true,
        notes: true,
      });
      setError(validation.firstError || "Please correct the highlighted fields.");
      return;
    }

    const canonicalScheduledAt = toUtcIsoString(form.scheduled_at);
    if (!canonicalScheduledAt) {
      setFieldErrors((prev) => ({ ...prev, scheduled_at: "Please select a valid scheduled date and time." }));
      setError("Please select a valid scheduled date and time.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/astrologer/create-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          scheduled_at: canonicalScheduledAt,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create booking");
      }

      // Notify realtime sync & bust Next.js client router cache immediately
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("karmicascension:booking-created"));
      }
      router.refresh();
      router.replace("/astrologer/bookings");
      setTimeout(() => {
        router.refresh();
      }, 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-2xl border border-gold/25 bg-white p-6 sm:p-8 shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)]"
    >
      {error && (
        <div className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Target Seeker Information */}
      {initialCustomerId ? (
        <div className="rounded-xl border border-gold/30 bg-parchment/60 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/20 text-gold-deep">
                <User className="h-5 w-5" />
              </span>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Booking Consultation For
                </span>
                <p className="font-display text-base font-bold text-midnight">
                  {initialCustomerName || "Assigned Seeker"}
                </p>
                <p className="font-mono text-[11px] text-muted">{initialCustomerId}</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-champagne/40 px-2.5 py-0.5 text-[11px] font-semibold text-midnight">
              <Sparkles className="h-3 w-3 text-gold-deep" /> Verified
            </span>
          </div>
        </div>
      ) : (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-midnight">Customer ID (UUID) *</span>
          <input
            name="customer_id"
            type="text"
            required
            value={form.customer_id}
            onChange={handleChange}
            onBlur={handleBlur}
            aria-invalid={Boolean(touched.customer_id && fieldErrors.customer_id)}
            placeholder="e.g. 00000000-0000-0000-0000-000000000000"
            className={`rounded-xl border bg-white px-3.5 py-2.5 text-xs text-midnight focus:outline-none focus:ring-1 ${
              touched.customer_id && fieldErrors.customer_id
                ? "border-rose-400 focus:border-rose-500 focus:ring-rose-400"
                : "border-line focus:border-gold focus:ring-gold"
            }`}
          />
          {touched.customer_id && fieldErrors.customer_id && (
            <span className="text-[11px] font-medium text-rose-600">{fieldErrors.customer_id}</span>
          )}
          <span className="text-[11px] text-muted">
            Tip: You can schedule directly from any lead enquiry to pre-fill customer details automatically.
          </span>
        </label>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-midnight">Consultation Topic / Service *</span>
          <input
            name="service_type"
            type="text"
            required
            maxLength={MANUAL_BOOKING_MAX_SERVICE_LENGTH}
            list="common-services"
            value={form.service_type}
            onChange={handleChange}
            onBlur={handleBlur}
            aria-invalid={Boolean(touched.service_type && fieldErrors.service_type)}
            placeholder="e.g. Kundli Matching, Career Consultation"
            className={`rounded-xl border bg-white px-3.5 py-2.5 text-xs text-midnight focus:outline-none focus:ring-1 ${
              touched.service_type && fieldErrors.service_type
                ? "border-rose-400 focus:border-rose-500 focus:ring-rose-400"
                : "border-line focus:border-gold focus:ring-gold"
            }`}
          />
          {touched.service_type && fieldErrors.service_type && (
            <span className="text-[11px] font-medium text-rose-600">{fieldErrors.service_type}</span>
          )}
          <datalist id="common-services">
            <option value="Vedic Astrology Consultation" />
            <option value="Kundli Matching & Compatibility" />
            <option value="Career & Business Astrology" />
            <option value="Vedic Muhurat Guidance" />
            <option value="Health & Wellness Astrology" />
            <option value="Gemstone & Remedial Guidance" />
          </datalist>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-midnight">Consultation Mode *</span>
          <select
            name="consultation_mode"
            value={form.consultation_mode}
            onChange={handleChange}
            className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-xs text-midnight focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
          >
            <option value="Video">Video Session (In-House HD Encrypted)</option>
            <option value="Call">Voice Call</option>
            <option value="Chat">Chat Consultation</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-midnight">Scheduled Date & Time (IST) *</span>
            <span className="text-[11px] font-medium text-gold-deep">Asia/Kolkata</span>
          </div>
          <input
            name="scheduled_at"
            type="datetime-local"
            required
            value={form.scheduled_at}
            onChange={handleChange}
            onBlur={handleBlur}
            aria-invalid={Boolean(touched.scheduled_at && fieldErrors.scheduled_at)}
            className={`rounded-xl border bg-white px-3.5 py-2.5 text-xs text-midnight focus:outline-none focus:ring-1 ${
              touched.scheduled_at && fieldErrors.scheduled_at
                ? "border-rose-400 focus:border-rose-500 focus:ring-rose-400"
                : "border-line focus:border-gold focus:ring-gold"
            }`}
          />
          {touched.scheduled_at && fieldErrors.scheduled_at ? (
            <p className="text-[11px] font-medium text-rose-600">{fieldErrors.scheduled_at}</p>
          ) : form.scheduled_at ? (
            <p className="text-[11px] text-muted">
              Scheduled for:{" "}
              <span className="font-semibold text-midnight">
                {formatExactDateTime(form.scheduled_at)} IST
              </span>
            </p>
          ) : (
            <p className="text-[11px] text-muted">Must be at least 5 minutes in advance.</p>
          )}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-midnight">Duration (Minutes) *</span>
          <select
            name="duration_minutes"
            value={form.duration_minutes}
            onChange={handleChange}
            className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-xs text-midnight focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
          >
            <option value={15}>15 Minutes (Express)</option>
            <option value={30}>30 Minutes (Standard)</option>
            <option value={45}>45 Minutes (Comprehensive)</option>
            <option value={60}>60 Minutes (In-depth Chart & Remedies)</option>
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-midnight">Astrological Notes & Preparation (Optional)</span>
          <span className="text-[11px] text-muted">
            {form.notes.trim().length}/{MANUAL_BOOKING_MAX_NOTES_LENGTH}
          </span>
        </div>
        <textarea
          name="notes"
          rows={3}
          maxLength={MANUAL_BOOKING_MAX_NOTES_LENGTH}
          value={form.notes}
          onChange={handleChange}
          onBlur={handleBlur}
          aria-invalid={Boolean(touched.notes && fieldErrors.notes)}
          placeholder="Add any specific questions or areas of focus for this consultation..."
          className={`rounded-xl border bg-white px-3.5 py-2.5 text-xs text-midnight focus:outline-none focus:ring-1 ${
            touched.notes && fieldErrors.notes
              ? "border-rose-400 focus:border-rose-500 focus:ring-rose-400"
              : "border-line focus:border-gold focus:ring-gold"
          }`}
        />
        {touched.notes && fieldErrors.notes && (
          <span className="text-[11px] font-medium text-rose-600">{fieldErrors.notes}</span>
        )}
      </label>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-gold/15">
        <Link
          href="/astrologer/bookings"
          className={buttonStyles({ variant: "outline", size: "md" })}
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={loading}
          className={buttonStyles({ variant: "gold", size: "md" })}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scheduling...
            </>
          ) : (
            <>
              <Calendar className="h-4 w-4 mr-2" /> Confirm & Schedule Booking
            </>
          )}
        </button>
      </div>
    </form>
  );
}
