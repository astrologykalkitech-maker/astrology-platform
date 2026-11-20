"use client";

import React, { useState } from "react";
import { QrCode, CreditCard, Send, ShieldCheck } from "lucide-react";
import type { CustomerBooking } from "@/lib/types/database.types";
import { formatPaiseToInr, rupeesToPaise } from "@/lib/financial/pricing";
import { JyotishPayModal } from "@/components/pay/JyotishPayModal";
import { DirectBookingPaymentForm } from "@/components/customer/DirectBookingPaymentForm";

interface UnifiedCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: CustomerBooking;
  onSuccess?: () => void;
}

export function UnifiedCheckoutModal({
  isOpen,
  onClose,
  booking,
  onSuccess,
}: UnifiedCheckoutModalProps) {
  const [selectedMethod, setSelectedMethod] = useState<"jyotish_pay" | "instamojo" | "direct_upi">("jyotish_pay");
  const [isJyotishPayOpen, setIsJyotishPayOpen] = useState(false);
  const [instamojoLoading, setInstamojoLoading] = useState(false);
  const [instamojoError, setInstamojoError] = useState<string | null>(null);

  if (!isOpen) return null;

  const amountPaise = rupeesToPaise(booking.price);
  const formattedAmount = formatPaiseToInr(amountPaise);

  const handleInstamojoCheckout = async () => {
    setInstamojoLoading(true);
    setInstamojoError(null);
    try {
      const res = await fetch("/api/payments/instamojo/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: "consultation",
          entityId: booking.id,
          amount: booking.price,
          purpose: `Consultation: ${booking.service_type}`,
        }),
      });

      const data = await res.json();
      if (res.ok && data.longurl) {
        window.location.href = data.longurl;
      } else {
        setInstamojoError(data.error || "Unable to initiate payment with Instamojo gateway.");
      }
    } catch {
      setInstamojoError("Network error connecting to payment gateway.");
    } finally {
      setInstamojoLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/70 backdrop-blur-sm p-4">
        <div className="relative w-full max-w-lg rounded-2xl border border-gold/30 bg-white p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-gold/15">
            <div>
              <h3 className="text-lg font-bold text-midnight">Consultation Checkout</h3>
              <p className="text-xs text-muted">
                {booking.service_type} with {booking.astrologer_name || "Vedic Astrologer"}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-muted hover:text-midnight text-lg font-bold p-1"
            >
              ✕
            </button>
          </div>

          {/* Amount Summary */}
          <div className="my-4 rounded-xl bg-parchment/40 p-4 border border-gold/20 flex items-center justify-between">
            <div>
              <span className="text-xs text-muted">Total Payable Amount</span>
              <p className="text-xl font-bold text-midnight">{formattedAmount}</p>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-muted">Mode</span>
              <p className="text-xs font-semibold text-midnight capitalize">{booking.consultation_mode} Session</p>
            </div>
          </div>

          {/* Payment Method Selector */}
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">
              Choose Payment Method
            </label>

            {/* Option 1: Jyotish Pay UPI QR (Instant) */}
            <div
              onClick={() => setSelectedMethod("jyotish_pay")}
              className={`cursor-pointer rounded-xl border p-3.5 transition-all flex items-start gap-3 ${
                selectedMethod === "jyotish_pay"
                  ? "border-amber-500 bg-amber-50/50 shadow-sm"
                  : "border-gold/20 hover:border-gold/40"
              }`}
            >
              <div className="rounded-lg bg-amber-100 p-2 text-amber-800">
                <QrCode className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-midnight">Karmic Ascension Pay UPI QR</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-semibold text-emerald-800">
                    Recommended / Instant
                  </span>
                </div>
                <p className="text-[11px] text-muted mt-0.5">
                  Scan dynamic QR with Google Pay, PhonePe, Paytm, or any UPI app.
                </p>
              </div>
            </div>

            {/* Option 2: Instamojo Card/Netbanking/UPI */}
            <div
              onClick={() => setSelectedMethod("instamojo")}
              className={`cursor-pointer rounded-xl border p-3.5 transition-all flex items-start gap-3 ${
                selectedMethod === "instamojo"
                  ? "border-amber-500 bg-amber-50/50 shadow-sm"
                  : "border-gold/20 hover:border-gold/40"
              }`}
            >
              <div className="rounded-lg bg-blue-100 p-2 text-blue-800">
                <CreditCard className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <span className="font-semibold text-xs text-midnight">Cards / Netbanking / Wallets</span>
                <p className="text-[11px] text-muted mt-0.5">
                  Pay via Credit/Debit Cards, Net Banking, or Instamojo payment gateway.
                </p>
              </div>
            </div>

            {/* Option 3: Direct Astrologer UPI (if VPA available) */}
            {booking.astrologer_upi_vpa && (
              <div
                onClick={() => setSelectedMethod("direct_upi")}
                className={`cursor-pointer rounded-xl border p-3.5 transition-all flex items-start gap-3 ${
                  selectedMethod === "direct_upi"
                    ? "border-amber-500 bg-amber-50/50 shadow-sm"
                    : "border-gold/20 hover:border-gold/40"
                }`}
              >
                <div className="rounded-lg bg-purple-100 p-2 text-purple-800">
                  <Send className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-midnight">Direct Consultant UPI</span>
                    <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[9px] font-semibold text-purple-800">
                      Manual UTR Review
                    </span>
                  </div>
                  <p className="text-[11px] text-muted mt-0.5">
                    Pay directly to astrologer VPA ({booking.astrologer_upi_vpa}) and submit UTR for verification.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Action Button / Embedded Form */}
          <div className="mt-5 pt-4 border-t border-gold/15">
            {selectedMethod === "jyotish_pay" && (
              <button
                onClick={() => setIsJyotishPayOpen(true)}
                className="w-full rounded-xl bg-gradient-to-r from-amber-600 to-yellow-600 py-3 text-xs font-bold text-white shadow-md hover:opacity-95 transition-all flex items-center justify-center gap-2"
              >
                <QrCode className="h-4 w-4" />
                <span>Pay {formattedAmount} via Karmic Ascension Pay QR</span>
              </button>
            )}

            {selectedMethod === "instamojo" && (
              <div>
                {instamojoError && (
                  <p className="text-xs text-red-600 mb-2 font-medium">{instamojoError}</p>
                )}
                <button
                  onClick={handleInstamojoCheckout}
                  disabled={instamojoLoading}
                  className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3 text-xs font-bold text-white shadow-md hover:opacity-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <CreditCard className="h-4 w-4" />
                  <span>{instamojoLoading ? "Redirecting..." : `Proceed with Instamojo (${formattedAmount})`}</span>
                </button>
              </div>
            )}

            {selectedMethod === "direct_upi" && (
              <div className="mt-2">
                <DirectBookingPaymentForm booking={booking} />
              </div>
            )}
          </div>

          {/* Trust Footer */}
          <div className="mt-4 flex items-center justify-center gap-1.5 text-[10px] text-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span>256-bit Encrypted Checkout • RBI/NPCI Compliant • Karmic Ascension Platform Trust</span>
          </div>
        </div>
      </div>

      {/* Render Karmic Ascension Pay Dynamic Modal */}
      {isJyotishPayOpen && (
        <JyotishPayModal
          isOpen={isJyotishPayOpen}
          onClose={() => {
            setIsJyotishPayOpen(false);
            onClose();
          }}
          amountPaise={amountPaise}
          entityType="consultation"
          title={`${booking.service_type} Consultation`}
          description={`Direct session with ${booking.astrologer_name || "Vedic Astrologer"}`}
          bookingId={booking.id}
          onSuccess={() => {
            setIsJyotishPayOpen(false);
            if (onSuccess) onSuccess();
            onClose();
          }}
        />
      )}
    </>
  );
}
