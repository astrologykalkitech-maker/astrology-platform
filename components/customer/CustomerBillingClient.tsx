"use client";

import React, { useState } from "react";
import { Download, CreditCard, RefreshCw, AlertCircle } from "lucide-react";
import type { CustomerBillingRecord } from "@/lib/types/database.types";
import { formatExactDateTime } from "@/lib/astrologer/format";
import { formatPaiseToInr, rupeesToPaise } from "@/lib/financial/pricing";
import { generatePaymentReceiptPdf } from "@/lib/financial/receipt";
import { requestCustomerRefundAction } from "@/app/actions/payments";
import { JyotishPayModal } from "@/components/pay/JyotishPayModal";

export function CustomerBillingClient({
  records,
  customerName,
  customerEmail,
}: {
  records: CustomerBillingRecord[];
  customerName: string;
  customerEmail?: string | null;
}) {
  const [selectedBookingForPay, setSelectedBookingForPay] = useState<CustomerBillingRecord | null>(null);
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

  const handlePayNow = (record: CustomerBillingRecord) => {
    setSelectedBookingForPay(record);
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
          text: "Refund request submitted successfully. It will be reviewed by admin within 24-48 business hours.",
        });
        setTimeout(() => {
          setRefundModalRecord(null);
          setRefundReason("");
          setRefundStatusMsg(null);
        }, 3000);
      } else {
        setRefundStatusMsg({
          type: "error",
          text: res.error || "Failed to submit refund request.",
        });
      }
    } catch {
      setRefundStatusMsg({
        type: "error",
        text: "An error occurred while submitting refund request.",
      });
    } finally {
      setSubmittingRefund(false);
    }
  };

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-ink/80">
          <thead className="bg-parchment/60 text-[11px] uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-3">Consultation Service</th>
              <th className="px-4 py-3">Astrologer</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gold/10">
            {records.map((r) => (
              <tr key={r.id} className="hover:bg-parchment/20 transition-colors">
                <td className="px-4 py-3.5">
                  <div className="font-semibold text-midnight">{r.service_type}</div>
                  <div className="text-[11px] text-muted capitalize">{r.consultation_mode} Call</div>
                </td>
                <td className="px-4 py-3.5">
                  <div className="font-medium text-midnight">{r.astrologer_name}</div>
                  <div className="text-[10px] text-muted font-mono">{r.transaction_ref}</div>
                </td>
                <td className="px-4 py-3.5 text-[11px] text-muted">
                  {formatExactDateTime(r.created_at)}
                </td>
                <td className="px-4 py-3.5 font-bold text-midnight">
                  {formatPaiseToInr(rupeesToPaise(r.amount))}
                </td>
                <td className="px-4 py-3.5">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      r.payment_status === "paid"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : r.payment_status === "refunded"
                        ? "bg-purple-50 text-purple-700 border border-purple-200"
                        : "bg-amber-50 text-amber-700 border border-amber-200"
                    }`}
                  >
                    {r.payment_status.toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-right space-x-2">
                  {r.payment_status === "paid" ? (
                    <>
                      <button
                        onClick={() => handleDownloadReceipt(r)}
                        className="inline-flex items-center gap-1 rounded-lg border border-gold/30 bg-parchment/40 px-2 py-1 text-[10px] font-medium text-midnight hover:bg-parchment transition-colors"
                      >
                        <Download className="h-3 w-3" />
                        Invoice
                      </button>
                      <button
                        onClick={() => {
                          setRefundModalRecord(r);
                          setRefundStatusMsg(null);
                        }}
                        className="inline-flex items-center rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-medium text-red-700 hover:bg-red-100 transition-colors"
                      >
                        Refund
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handlePayNow(r)}
                      className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-amber-600 to-yellow-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow hover:opacity-95 transition-opacity"
                    >
                      <CreditCard className="h-3 w-3" />
                      Pay via UPI (JyotishSetu Pay)
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* JyotishSetu Pay Modal for Customer Consultations */}
      {selectedBookingForPay && (
        <JyotishPayModal
          isOpen={!!selectedBookingForPay}
          onClose={() => setSelectedBookingForPay(null)}
          amountPaise={rupeesToPaise(selectedBookingForPay.amount)}
          entityType="consultation"
          title={`${selectedBookingForPay.service_type} Consultation`}
          description={`Direct astrological session with ${selectedBookingForPay.astrologer_name}`}
          bookingId={selectedBookingForPay.booking_id}
          onSuccess={() => {
            setTimeout(() => {
              window.location.reload();
            }, 1500);
          }}
        />
      )}

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
