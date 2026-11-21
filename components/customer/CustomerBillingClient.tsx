"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Download, CreditCard, RefreshCw, AlertCircle, Wallet, CheckCircle2, Loader2, X } from "lucide-react";
import type { CustomerBillingRecord } from "@/lib/types/database.types";
import { formatExactDateTime } from "@/lib/astrologer/format";
import { formatPaiseToInr, rupeesToPaise } from "@/lib/financial/pricing";
import { generatePaymentReceiptPdf } from "@/lib/financial/receipt";
import { requestCustomerRefundAction, payConsultationViaWalletAction } from "@/app/actions/payments";
import { JyotishPayModal } from "@/components/pay/JyotishPayModal";
import { WalletRechargeModal } from "@/components/pay/WalletRechargeModal";

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

  // Customer Wallet State
  const [walletAvailablePaise, setWalletAvailablePaise] = useState<number | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [payingWalletBookingId, setPayingWalletBookingId] = useState<string | null>(null);
  const [walletPaymentSuccess, setWalletPaymentSuccess] = useState<{ bookingId: string; orderNumber: string; receiptNumber: string } | null>(null);
  const [walletPaymentError, setWalletPaymentError] = useState<{ bookingId: string; message: string } | null>(null);
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [mounted, setMounted] = useState(false);
  const refundTriggerRef = useRef<HTMLElement | null>(null);
  const refundDialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!refundModalRecord) return;

    refundTriggerRef.current = (document.activeElement as HTMLElement) || null;
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setRefundModalRecord(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const timer = setTimeout(() => {
      refundDialogRef.current?.focus();
    }, 50);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
      if (refundTriggerRef.current && typeof refundTriggerRef.current.focus === "function") {
        refundTriggerRef.current.focus();
      }
    };
  }, [refundModalRecord]);

  useEffect(() => {
    let mounted = true;
    async function loadCustomerWallet() {
      try {
        const res = await fetch("/api/customer/wallet");
        if (res.ok) {
          const json = await res.json();
          if (mounted && json.success && json.data) {
            setWalletAvailablePaise(Number(json.data.total_available_paise || 0));
          }
        }
      } catch {
        // Fallback
      } finally {
        if (mounted) setLoadingWallet(false);
      }
    }
    loadCustomerWallet();
  }, []);

  const handlePayViaWallet = async (record: CustomerBillingRecord) => {
    const requiredPaise = rupeesToPaise(record.amount);
    if (walletAvailablePaise !== null && walletAvailablePaise < requiredPaise) {
      setWalletPaymentError({
        bookingId: record.booking_id,
        message: `Insufficient wallet balance. You have ₹${(walletAvailablePaise / 100).toFixed(2)}, required ₹${record.amount.toFixed(2)}. Please recharge your wallet.`,
      });
      return;
    }

    try {
      setPayingWalletBookingId(record.booking_id);
      setWalletPaymentError(null);
      setWalletPaymentSuccess(null);

      const res = await payConsultationViaWalletAction({
        bookingId: record.booking_id,
      });

      if (res.success && res.data) {
        setWalletPaymentSuccess({
          bookingId: record.booking_id,
          orderNumber: res.data.orderNumber,
          receiptNumber: res.data.receiptNumber,
        });
        setWalletAvailablePaise(res.data.remainingBalancePaise);
        setTimeout(() => {
          window.location.reload();
        }, 1800);
      } else {
        setWalletPaymentError({
          bookingId: record.booking_id,
          message: res.error || "Failed to process payment via wallet.",
        });
      }
    } catch (err) {
      setWalletPaymentError({
        bookingId: record.booking_id,
        message: err instanceof Error ? err.message : "Error paying via wallet",
      });
    } finally {
      setPayingWalletBookingId(null);
    }
  };

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

    doc.save(`Karmic Ascension_Receipt_${record.receipt_number || record.booking_id.slice(0, 8)}.pdf`);
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
      <div className="overflow-x-auto table-scrollbar -mx-4 sm:mx-0">
        <table className="w-full min-w-[640px] text-left text-xs text-ink/80">
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
                  <div className="flex flex-col gap-1 items-start">
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
                    {r.payment_gateway && r.payment_gateway !== "complimentary" && (
                      <span className="text-[9px] text-muted font-medium uppercase tracking-wider">
                        {r.payment_gateway === "jyotish_pay" ? "UPI QR" : r.payment_gateway === "direct_upi" ? "DIRECT UPI" : "GATEWAY"}
                      </span>
                    )}
                    {r.refund_status && (
                      <span
                        className={`inline-flex items-center rounded-full px-1.5 py-0.2 text-[9px] font-medium ${
                          r.refund_status === "requested"
                            ? "bg-amber-100 text-amber-800"
                            : r.refund_status === "approved"
                            ? "bg-blue-100 text-blue-800"
                            : r.refund_status === "processed"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-red-100 text-red-800"
                        }`}
                        title={r.refund_rejection_reason || r.refund_reason || undefined}
                      >
                        Refund: {r.refund_status.toUpperCase()}
                      </span>
                    )}
                  </div>
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
                      {r.refund_status === "requested" ? (
                        <span className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700">
                          Refund Pending
                        </span>
                      ) : r.refund_status === "approved" || r.refund_status === "processed" ? (
                        <span className="inline-flex items-center rounded-lg border border-purple-200 bg-purple-50 px-2 py-1 text-[10px] font-medium text-purple-700">
                          Refunded
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            setRefundModalRecord(r);
                            setRefundStatusMsg(null);
                          }}
                          className="inline-flex items-center rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-medium text-red-700 hover:bg-red-100 transition-colors"
                        >
                          {r.refund_status === "rejected" ? "Re-apply Refund" : "Refund"}
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col sm:flex-row items-end sm:items-center justify-end gap-1.5">
                      {/* 1. Pay via Customer Wallet Button */}
                      <button
                        onClick={() => handlePayViaWallet(r)}
                        disabled={payingWalletBookingId === r.booking_id}
                        className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow hover:opacity-95 transition-opacity disabled:opacity-50"
                        title={
                          walletAvailablePaise !== null && walletAvailablePaise < rupeesToPaise(r.amount)
                            ? `Insufficient wallet funds (₹${(walletAvailablePaise / 100).toFixed(2)} available)`
                            : "Pay instantly from your Karmic Ascension Wallet"
                        }
                      >
                        {payingWalletBookingId === r.booking_id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Wallet className="h-3 w-3" />
                        )}
                        Pay via Wallet
                      </button>

                      {/* 2. Pay via UPI Button */}
                      <button
                        onClick={() => handlePayNow(r)}
                        className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-amber-600 to-yellow-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow hover:opacity-95 transition-opacity"
                      >
                        <CreditCard className="h-3 w-3" />
                        Pay via UPI
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Karmic Ascension Pay Modal for Customer Consultations */}
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

      {/* Wallet Recharge Modal (if user wants to add funds) */}
      <WalletRechargeModal
        isOpen={showRechargeModal}
        onClose={() => setShowRechargeModal(false)}
        userRole="customer"
        onSuccess={() => {
          window.location.reload();
        }}
      />

      {/* Wallet Payment Status Banner / Notification */}
      {walletPaymentSuccess && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 shadow-xl text-emerald-900">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <div className="text-xs">
            <p className="font-bold">Consultation Paid Successfully via Wallet!</p>
            <p className="text-[11px] text-emerald-700">
              Receipt #{walletPaymentSuccess.receiptNumber} • Order #{walletPaymentSuccess.orderNumber}. Refreshing page...
            </p>
          </div>
        </div>
      )}

      {walletPaymentError && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center justify-between gap-4 rounded-2xl border border-red-300 bg-red-50 p-4 shadow-xl text-red-900 max-w-md">
          <div className="flex items-start gap-2.5 text-xs">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Payment Error</p>
              <p className="text-[11px] text-red-700 mt-0.5">{walletPaymentError.message}</p>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            {walletPaymentError.message.includes("Insufficient") && (
              <button
                onClick={() => setShowRechargeModal(true)}
                className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[10px] font-semibold text-white shadow hover:bg-emerald-700"
              >
                Recharge Wallet
              </button>
            )}
            <button
              onClick={() => setWalletPaymentError(null)}
              className="text-[10px] font-semibold text-red-600 hover:underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Refund Request Modal */}
      {refundModalRecord && mounted && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-950/80 backdrop-blur-md overflow-hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget && !submittingRefund) {
              setRefundModalRecord(null);
            }
          }}
        >
          <div
            ref={refundDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="refund-modal-title"
            tabIndex={-1}
            className="relative w-full max-w-md max-h-[calc(100dvh-24px)] sm:max-h-[calc(100dvh-36px)] flex flex-col rounded-2xl border border-gold/40 bg-white shadow-2xl overflow-hidden my-auto focus:outline-none"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gold/15 bg-parchment/60 px-5 py-4 shrink-0">
              <div>
                <h3 id="refund-modal-title" className="text-base font-bold text-midnight">Request Consultation Refund</h3>
                <p className="text-xs text-muted mt-0.5">
                  Transaction: {refundModalRecord.transaction_ref} ({formatPaiseToInr(rupeesToPaise(refundModalRecord.amount))})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRefundModalRecord(null)}
                aria-label="Close refund dialog"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 space-y-4">
              {refundStatusMsg && (
                <div
                  className={`flex items-center gap-2 rounded-xl p-3 text-xs ${
                    refundStatusMsg.type === "success"
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : "bg-red-50 text-red-800 border border-red-200"
                  }`}
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{refundStatusMsg.text}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-ink">
                  Reason for Refund Request <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Please describe why you are requesting a refund (e.g. astrologer did not attend, technical issue)..."
                  rows={4}
                  className="mt-1 w-full rounded-xl border border-gold/30 p-2.5 text-xs focus:border-gold focus:outline-none text-ink bg-white"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 p-4 border-t border-gold/15 bg-parchment/30 shrink-0">
              <button
                type="button"
                disabled={submittingRefund}
                onClick={() => setRefundModalRecord(null)}
                className="rounded-xl border border-gold/30 px-3.5 py-2 text-xs font-medium text-ink hover:bg-parchment transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingRefund || !refundReason.trim()}
                onClick={handleSubmitRefund}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-red-700 disabled:opacity-50 transition cursor-pointer"
              >
                {submittingRefund && <RefreshCw className="h-3 w-3 animate-spin" />}
                Submit Request
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
