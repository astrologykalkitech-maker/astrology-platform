"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Clock, ExternalLink } from "lucide-react";
import { submitDirectConsultationPaymentAction } from "@/app/actions/direct-consultation-payments";
import type { CustomerBooking } from "@/lib/types/database.types";
import { formatPaiseToInr, rupeesToPaise } from "@/lib/financial/pricing";

function localDateInputValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function DirectBookingPaymentForm({ booking }: { booking: CustomerBooking }) {
  const router = useRouter();
  const [utr, setUtr] = useState("");
  const [paymentDate, setPaymentDate] = useState(localDateInputValue);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (
    booking.payment_mode === "platform_gateway" ||
    booking.price <= 0 ||
    booking.status === "cancelled" ||
    booking.status === "no_show"
  ) {
    return null;
  }

  const payment = booking.direct_payment;
  const amountPaise = rupeesToPaise(booking.price);
  const upiUri = booking.astrologer_upi_vpa
    ? `upi://pay?${new URLSearchParams({
        pa: booking.astrologer_upi_vpa,
        pn: booking.astrologer_name || "Astrologer",
        am: booking.price.toFixed(2),
        cu: "INR",
        tn: `Consultation ${booking.id.slice(0, 8)}`,
      }).toString()}`
    : null;

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await submitDirectConsultationPaymentAction({
      bookingId: booking.id,
      utr,
      amountRupees: booking.price,
      paymentDate,
    });
    setSubmitting(false);

    if (!result.success) {
      setError(result.error || "Unable to submit payment details.");
      return;
    }

    setSubmitted(true);
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-gold/20 bg-parchment/30 p-3 text-left">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-midnight">Direct payment to astrologer</h3>
        <span className="text-[11px] font-semibold text-midnight">
          {payment ? payment.status.toUpperCase() : "PAYMENT DETAILS"}
        </span>
      </div>

      {payment?.status === "verified" || payment?.status === "refunded" ? (
        <div className="mt-2 flex items-start gap-2 text-xs text-ink/80">
          <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${payment.status === "verified" ? "text-emerald-600" : "text-amber-600"}`} />
          <p>
            {payment.status === "verified"
              ? "Payment verified by JyotishSetu Super Admin."
              : "This payment was marked refunded by JyotishSetu Super Admin."}
            {" "}Reference: <span className="font-mono">{payment.utr}</span>
          </p>
        </div>
      ) : payment?.status === "pending" ? (
        <div className="mt-2 flex items-start gap-2 text-xs text-amber-800">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            UTR {payment.utr} submitted. Payment remains unverified until a Super Admin checks bank/UPI records.
          </p>
        </div>
      ) : (
        <>
          {payment?.status === "rejected" && (
            <div className="mt-2 text-xs text-rose-700">
              Previous submission {payment.utr} was rejected: {payment.rejection_reason || "Please submit the correct transaction reference."}
            </div>
          )}

          {booking.astrologer_upi_vpa ? (
            <div className="mt-2 space-y-2 text-xs text-ink/80">
              <p>
                Pay <strong>{formatPaiseToInr(amountPaise)}</strong> to{" "}
                <span className="font-mono font-semibold text-midnight">{booking.astrologer_upi_vpa}</span>
              </p>
              {upiUri && (
                <a
                  href={upiUri}
                  className="inline-flex items-center gap-1 rounded-lg bg-midnight px-3 py-1.5 font-semibold text-white hover:bg-plum"
                >
                  Open UPI app <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <form onSubmit={submitPayment} className="grid gap-2 sm:grid-cols-3">
                <label className="text-[11px] font-medium">
                  Amount paid
                  <input
                    value={formatPaiseToInr(amountPaise)}
                    readOnly
                    aria-label="Booking amount"
                    className="mt-1 w-full rounded-lg border border-line bg-white px-2.5 py-2 text-xs text-midnight"
                  />
                </label>
                <label className="text-[11px] font-medium">
                  Payment date
                  <input
                    type="date"
                    required
                    max={localDateInputValue()}
                    value={paymentDate}
                    onChange={(event) => setPaymentDate(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-line bg-white px-2.5 py-2 text-xs text-midnight"
                  />
                </label>
                <label className="text-[11px] font-medium">
                  UTR / transaction reference
                  <input
                    required
                    minLength={8}
                    maxLength={20}
                    pattern="[A-Za-z0-9-]{8,20}"
                    value={utr}
                    onChange={(event) => setUtr(event.target.value.toUpperCase())}
                    placeholder="8-20 letters or numbers"
                    className="mt-1 w-full rounded-lg border border-line bg-white px-2.5 py-2 font-mono text-xs text-midnight"
                  />
                </label>
                <div className="sm:col-span-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="max-w-xl text-[10px] text-muted">
                    Submitting a UTR is only a payment claim; it does not mark the booking paid. Never share your UPI PIN or OTP.
                  </p>
                  <button
                    type="submit"
                    disabled={submitting || submitted}
                    className="rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-midnight disabled:opacity-50"
                  >
                    {submitting ? "Submitting..." : submitted ? "Submitted" : "Submit UTR for verification"}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="mt-2 flex items-start gap-2 text-xs text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>The astrologer has not configured a UPI ID for direct consultation payments yet.</p>
            </div>
          )}
        </>
      )}

      {error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
    </section>
  );
}
