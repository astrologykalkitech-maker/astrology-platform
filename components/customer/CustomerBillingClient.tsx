"use client";

import React, { useState } from "react";
import { Download, CreditCard, RefreshCw, AlertCircle } from "lucide-react";
import type { CustomerBillingRecord } from "@/lib/types/database.types";
import { formatExactDateTime } from "@/lib/astrologer/format";
import { formatPaiseToInr, rupeesToPaise } from "@/lib/financial/pricing";
import { generatePaymentReceiptPdf } from "@/lib/financial/receipt";
import { initiateConsultationPaymentAction, requestCustomerRefundAction } from "@/app/actions/payments";

export function CustomerBillingClient({
  records,
  customerName,
  customerEmail,
}: {
  records: CustomerBillingRecord[];
  customerName: string;
  customerEmail?: string | null;
}) {
  const [loadingBookingId, setLoadingBookingId] = useState<string | null>(null);
  const [refundModalRecord, setRefundModalRecord] = useState<CustomerBillingRecord | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [submittingRefund, setSubmittingRefund] = useState(false);
  const [refundStatusMsg, setRefundStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleDownloadReceipt = (record: CustomerBillingRecord) => {
    const doc = generatePaymentReceiptPdf({
      receiptNumber: record.receipt_number || record.transaction_ref,
      orderNumber: `ORD-${record.booking_id.slice(0, 8).toUpperCase()}`,
      paymentId: record.payment_id || `PAY-${record.booking_id.slice(0, 8)}`,
      date: formatExactDateTime(record.created_at),
      buyerName: customerName,
      buyerEmail: customerEmail,
      serviceTitle: `${record.service_type} Consultation`,
      serviceType: record.consultation_mode.toUpperCase(),
      providerName: record.astrologer_name,
      amountPaise: rupeesToPaise(record.amount),
      status: record.payment_status.toUpperCase(),
    });

    doc.save(`JyotishSetu_Receipt_${record.receipt_number || record.booking_id.slice(0, 8)}.pdf`);
  };

  const handlePayNow = async (bookingId: string) => {
    try {
      setLoadingBookingId(bookingId);
      const res = await initiateConsultationPaymentAction({ bookingId });
      if (res.success && res.data?.paymentUrl) {
        window.location.href = res.data.paymentUrl;
      } else {
        alert(res.error || "Failed to initiate payment. Please try again.");
      }
    } catch {
      alert("An unexpected error occurred while contacting payment gateway.");
    } finally {
      setLoadingBookingId(null);
    }
  };

  const handleSubmitRefund = async () => {
    if (!refundModalRecord || !refundReason.trim()) return;
    try {
      setSubmittingRefund(true);
      setRefundStatusMsg(null);
      const res = await requestCustomerRefundAction({
        paymentId: refundModalRecord.payment_id || refundModalRecord.id,
        reason: refundReason.trim(),
      });

      if (res.success) {
        setRefundStatusMsg({
          type: "success",
          text: "Refund request submitted. Our admin desk will review it shortly.",
        });
        setTimeout(() => {
          setRefundModalRecord(null);
          setRefundReason("");
          setRefundStatusMsg(null);
        }, 2000);
      } else {
        setRefundStatusMsg({ type: "error", text: res.error || "Failed to submit refund request." });
      }
    } catch {
      setRefundStatusMsg({ type: "error", text: "Error submitting refund request." });
    } finally {
      setSubmittingRefund(false);
    }
  };

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-gold/25 bg-white shadow-sm">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-gold/15 bg-parchment/40 text-[11px] font-semibold text-midnight">
              <th className="py-3 px-4">Receipt / Order Ref</th>
              <th className="py-3 px-4">Astrologer</th>
              <th className="py-3 px-4">Service & Mode</th>
              <th className="py-3 px-4">Date</th>
              <th className="py-3 px-4 text-right">Fee (INR)</th>
              <th className="py-3 px-4 text-center">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gold/10 text-ink/80">
            {records.map((r) => (
              <tr key={r.id} className="hover:bg-gold/5 transition-colors">
                <td className="py-3 px-4 font-mono font-medium text-midnight">
                  {r.receipt_number || r.transaction_ref}
                </td>
                <td className="py-3 px-4 font-medium text-midnight">{r.astrologer_name}</td>
                <td className="py-3 px-4">
                  <span className="capitalize">{r.service_type}</span>
                  <span className="ml-1 text-[10px] text-muted">({r.consultation_mode})</span>
                </td>
                <td className="py-3 px-4 text-muted">{formatExactDateTime(r.created_at)}</td>
                <td className="py-3 px-4 text-right font-medium text-midnight">
                  {formatPaiseToInr(rupeesToPaise(r.amount))}
                </td>
                <td className="py-3 px-4 text-center">
                  {r.payment_status === "paid" ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Paid
                    </span>
                  ) : r.payment_status === "complimentary" ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                      Complimentary
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                      Payment Pending
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-right space-x-2">
                  {r.payment_status === "paid" ? (
                    <>
                      <button
                        onClick={() => handleDownloadReceipt(r)}
                        className="inline-flex items-center gap-1 rounded-lg border border-gold/40 bg-gold/10 px-2.5 py-1 text-[11px] font-semibold text-gold-deep hover:bg-gold/20 transition-colors"
                        title="Download PDF Tax Invoice & Payment Receipt"
                      >
                        <Download className="h-3 w-3" />
                        Receipt
                      </button>
                      <button
                        onClick={() => {
                          setRefundModalRecord(r);
                          setRefundReason("");
                          setRefundStatusMsg(null);
                        }}
                        className="inline-flex items-center rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-medium text-red-700 hover:bg-red-100 transition-colors"
                      >
                        Refund
                      </button>
                    </>
                  ) : (
                    <button
                      disabled={loadingBookingId === r.booking_id}
                      onClick={() => handlePayNow(r.booking_id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-amber-600 to-yellow-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow hover:opacity-95 transition-opacity disabled:opacity-50"
                    >
                      {loadingBookingId === r.booking_id ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <CreditCard className="h-3 w-3" />
                      )}
                      Pay Now
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Refund Request Modal */}
      {refundModalRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md rounded-2xl border border-gold/30 bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-midnight">Request Consultation Refund</h3>
            <p className="text-xs text-muted mt-1">
              Transaction: {refundModalRecord.transaction_ref} ({formatPaiseToInr(rupeesToPaise(refundModalRecord.amount))})
            </p>

            {refundStatusMsg && (
              <div
                className={`mt-4 flex items-center gap-2 rounded-xl p-3 text-xs ${
                  refundStatusMsg.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{refundStatusMsg.text}</span>
              </div>
            )}

            <div className="mt-4">
              <label className="block text-xs font-semibold text-ink">
                Reason for Refund Request <span className="text-red-500">*</span>
              </label>
              <textarea
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Please describe why you are requesting a refund (e.g. astrologer did not attend, technical issue)..."
                rows={4}
                className="mt-1 w-full rounded-xl border border-gold/30 p-2.5 text-xs focus:border-gold focus:outline-none"
              />
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                disabled={submittingRefund}
                onClick={() => setRefundModalRecord(null)}
                className="rounded-xl border border-gold/30 px-3 py-1.5 text-xs font-medium text-ink hover:bg-parchment"
              >
                Cancel
              </button>
              <button
                disabled={submittingRefund || !refundReason.trim()}
                onClick={handleSubmitRefund}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-red-700 disabled:opacity-50"
              >
                {submittingRefund && <RefreshCw className="h-3 w-3 animate-spin" />}
                Submit Request
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

