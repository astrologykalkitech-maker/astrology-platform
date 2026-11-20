"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, RotateCcw } from "lucide-react";
import {
  reviewCommissionSettlementAction,
  reviewDirectConsultationPaymentAction,
  reviewJyotishPayPaymentAction,
  reviewWalletRechargeOrderAction,
  WalletRechargeRow,
} from "@/app/actions/financial-verification";
import { formatPaiseToInr } from "@/lib/financial/pricing";

type DirectPayment = {
  id: string;
  booking_id: string;
  customer_id: string;
  astrologer_id: string;
  utr: string;
  amount_paise: number;
  payment_date: string;
  status: "pending" | "verified" | "rejected" | "refunded" | "failed";
  submitted_at: string;
  booking_status?: string;
  booking_price?: number;
  service_type?: string;
  customer_name?: string;
  astrologer_name?: string;
  astrologer_upi_vpa?: string | null;
};

type Settlement = {
  id: string;
  settlement_number: string;
  consultant_id: string;
  submitted_utr: string;
  amount_paise: number;
  payment_date: string | null;
  submitted_at: string | null;
  display_name?: string;
};

type JyotishPayVerification = {
  id: string;
  intent_id: string;
  utr: string;
  amount_paise: number;
  payment_date: string;
  submitted_at: string;
  entity_type?: string;
  intent_number?: string;
  booking_id?: string | null;
  plan_id?: string | null;
  booking_status?: string;
  customer_name?: string;
  astrologer_name?: string;
};

export function ManualPaymentVerificationClient({
  directPayments,
  settlements,
  jyotishPayments,
  walletRecharges = [],
}: {
  directPayments: DirectPayment[];
  settlements: Settlement[];
  jyotishPayments: JyotishPayVerification[];
  walletRecharges?: WalletRechargeRow[];
}) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function reviewWalletRecharge(order: WalletRechargeRow, decision: "approve" | "reject") {
    setBusyId(order.id);
    setMessage(null);
    const result = await reviewWalletRechargeOrderAction({
      orderId: order.id,
      decision,
      reviewNotes: notes[order.id] || "",
      rejectionReason: reasons[order.id] || "",
    });
    setBusyId(null);
    if (!result.success) {
      setMessage({ type: "error", text: result.error || "Wallet recharge review failed." });
      return;
    }
    setMessage({ type: "success", text: `Wallet recharge ${result.status || "updated"}.` });
    router.refresh();
  }

  async function reviewPayment(paymentId: string, decision: "approve" | "reject" | "refund") {
    setBusyId(paymentId);
    setMessage(null);
    const result = await reviewDirectConsultationPaymentAction({
      paymentId,
      decision,
      reviewNotes: notes[paymentId] || "",
      rejectionReason: reasons[paymentId] || "",
    });
    setBusyId(null);
    if (!result.success) {
      setMessage({ type: "error", text: result.error || "Payment review failed." });
      return;
    }
    setMessage({ type: "success", text: `Direct payment ${result.status || "updated"}.` });
    router.refresh();
  }

  async function reviewSettlement(settlement: Settlement, decision: "approve" | "reject") {
    setBusyId(settlement.id);
    setMessage(null);
    const result = await reviewCommissionSettlementAction({
      settlementId: settlement.id,
      decision,
      reviewNotes: notes[settlement.id] || "",
      rejectionReason: reasons[settlement.id] || "",
    });
    setBusyId(null);
    if (!result.success) {
      setMessage({ type: "error", text: result.error || "Settlement review failed." });
      return;
    }
    setMessage({ type: "success", text: `Commission settlement ${result.status || "updated"}.` });
    router.refresh();
  }

  async function reviewJyotishPayment(payment: JyotishPayVerification, decision: "approve" | "reject") {
    setBusyId(payment.id);
    setMessage(null);
    const result = await reviewJyotishPayPaymentAction({
      verificationId: payment.id,
      decision,
      reviewNotes: notes[payment.id] || "",
      rejectionReason: reasons[payment.id] || "",
    });
    setBusyId(null);
    if (!result.success) {
      setMessage({ type: "error", text: result.error || "Karmic Ascension Pay review failed." });
      return;
    }
    setMessage({ type: "success", text: `Karmic Ascension Pay payment ${result.status || "updated"}.` });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {message && (
        <div className={`flex items-center gap-2 rounded-xl border p-3 text-xs ${
          message.type === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-rose-200 bg-rose-50 text-rose-800"
        }`}>
          {message.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      {/* Astrologer & Customer Operating Wallet Recharge Queue */}
      <section className="space-y-3">
        <div>
          <h2 className="font-display text-lg font-bold text-midnight">Operating & Consultation Wallet Recharges</h2>
          <p className="text-xs text-muted">
            Direct UPI QR and UTR recharge submissions. Approving atomically credits the operating/consultation wallet and posts balanced general ledger entries.
          </p>
        </div>
        {walletRecharges.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gold/30 bg-white p-8 text-center text-sm text-muted">
            No pending wallet recharges awaiting verification.
          </div>
        ) : (
          walletRecharges.map((recharge) => (
            <article key={recharge.id} className="space-y-3 rounded-2xl border border-gold/25 bg-white p-4 shadow-sm">
              <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <Info label="Account Holder" value={recharge.account_holder_name || "Account holder"} />
                <Info
                  label="Recharge Type"
                  value={
                    recharge.entity_type === "astrologer_wallet_recharge"
                      ? "Astrologer Operating Wallet"
                      : "Customer Consultation Wallet"
                  }
                />
                <Info label="Order Number" value={recharge.order_number} mono />
                <Info label="Amount" value={formatPaiseToInr(recharge.amount_paise)} />
                <Info label="UTR / Reference" value={recharge.utr || "Direct Gateway / Session"} mono />
                <Info label="Session Reference" value={recharge.session_code || "None"} mono />
                <Info label="Status" value={recharge.status} />
                <Info label="Initiated" value={new Date(recharge.created_at).toLocaleString()} />
              </div>

              <label className="block text-xs font-medium text-midnight">
                Evidence review note
                <textarea
                  value={notes[recharge.id] || ""}
                  onChange={(event) => setNotes((current) => ({ ...current, [recharge.id]: event.target.value }))}
                  rows={2}
                  maxLength={1000}
                  placeholder="Record bank statement, VPA match, or UPI transaction ID verified."
                  className="mt-1 w-full rounded-lg border border-line bg-ivory/70 px-3 py-2 text-xs"
                />
              </label>

              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-[220px] flex-1 text-xs font-medium text-midnight">
                  Rejection reason (required to reject)
                  <input
                    value={reasons[recharge.id] || ""}
                    onChange={(event) => setReasons((current) => ({ ...current, [recharge.id]: event.target.value }))}
                    maxLength={500}
                    placeholder="Reason if bank transaction was not found..."
                    className="mt-1 w-full rounded-lg border border-line bg-ivory/70 px-3 py-2 text-xs"
                  />
                </label>
                <button
                  type="button"
                  disabled={busyId === recharge.id}
                  onClick={() => reviewWalletRecharge(recharge, "reject")}
                  className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50 hover:bg-rose-50 transition cursor-pointer"
                >
                  Reject
                </button>
                <button
                  type="button"
                  disabled={busyId === recharge.id}
                  onClick={() => reviewWalletRecharge(recharge, "approve")}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 hover:bg-emerald-700 transition cursor-pointer"
                >
                  {busyId === recharge.id ? "Saving..." : "Approve & Credit Wallet"}
                </button>
              </div>
            </article>
          ))
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-display text-lg font-bold text-midnight">Karmic Ascension Pay UTR claims</h2>
          <p className="text-xs text-muted">
            These UTRs are unverified claims. Approving one records the manual review, payment receipt, and accounting entries in a single database transaction.
          </p>
        </div>
        {jyotishPayments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gold/30 bg-white p-8 text-center text-sm text-muted">
            No Karmic Ascension Pay UTR claims awaiting review.
          </div>
        ) : (
          jyotishPayments.map((payment) => (
            <article key={payment.id} className="space-y-3 rounded-2xl border border-gold/25 bg-white p-4 shadow-sm">
              <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <Info label="Payer" value={payment.customer_name || payment.astrologer_name || "Account holder"} />
                <Info label="Astrologer" value={payment.astrologer_name || "Astrologer"} />
                <Info
                  label="Payment"
                  value={payment.entity_type === "subscription"
                    ? `Subscription · ${payment.plan_id || "Plan"}`
                    : `Consultation · ${payment.booking_id?.slice(0, 8) || "Booking"} · ${payment.booking_status || "unknown"}`}
                />
                <Info label="Intent" value={payment.intent_number || payment.intent_id} mono />
                <Info label="Amount" value={formatPaiseToInr(payment.amount_paise)} />
                <Info label="UTR / reference" value={payment.utr} mono />
                <Info label="Payment date" value={payment.payment_date} />
                <Info label="Submitted" value={new Date(payment.submitted_at).toLocaleString()} />
              </div>

              <label className="block text-xs font-medium text-midnight">
                Evidence review note
                <textarea
                  value={notes[payment.id] || ""}
                  onChange={(event) => setNotes((current) => ({ ...current, [payment.id]: event.target.value }))}
                  rows={2}
                  maxLength={1000}
                  placeholder="Record how the UTR, amount, date, and merchant account were matched in bank/UPI records."
                  className="mt-1 w-full rounded-lg border border-line bg-ivory/70 px-3 py-2 text-xs"
                />
              </label>

              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-[220px] flex-1 text-xs font-medium text-midnight">
                  Rejection reason (required to reject)
                  <input
                    value={reasons[payment.id] || ""}
                    onChange={(event) => setReasons((current) => ({ ...current, [payment.id]: event.target.value }))}
                    maxLength={500}
                    className="mt-1 w-full rounded-lg border border-line bg-ivory/70 px-3 py-2 text-xs"
                  />
                </label>
                <button
                  type="button"
                  disabled={busyId === payment.id}
                  onClick={() => reviewJyotishPayment(payment, "reject")}
                  className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50"
                >
                  Reject
                </button>
                <button
                  type="button"
                  disabled={busyId === payment.id}
                  onClick={() => reviewJyotishPayment(payment, "approve")}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {busyId === payment.id ? "Saving..." : "Approve verified payment"}
                </button>
              </div>
            </article>
          ))
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-display text-lg font-bold text-midnight">Customer payments to astrologers</h2>
          <p className="text-xs text-muted">
            Compare the submitted UTR, date, and amount with the actual bank or UPI transaction records before deciding.
            Approval verifies payment; commission is posted only after the booking is completed.
          </p>
        </div>
        {directPayments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gold/30 bg-white p-8 text-center text-sm text-muted">
            No pending or verified direct consultation payments.
          </div>
        ) : (
          directPayments.map((payment) => (
            <article key={payment.id} className="space-y-3 rounded-2xl border border-gold/25 bg-white p-4 shadow-sm">
              <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <Info label="Customer" value={payment.customer_name || payment.customer_id} />
                <Info label="Astrologer" value={payment.astrologer_name || payment.astrologer_id} />
                <Info label="Recipient UPI ID" value={payment.astrologer_upi_vpa || "Not configured"} mono />
                <Info label="Booking" value={`${payment.service_type || "Consultation"} · ${payment.booking_id.slice(0, 8)} · ${payment.booking_status || "unknown"}`} />
                <Info label="Claimed amount" value={`${formatPaiseToInr(payment.amount_paise)} (booking ${formatPaiseToInr(Math.round((payment.booking_price || 0) * 100))})`} />
                <Info label="UTR / reference" value={payment.utr} mono />
                <Info label="Payment date" value={payment.payment_date} />
                <Info label="Submitted" value={new Date(payment.submitted_at).toLocaleString()} />
                <Info label="Status" value={payment.status.toUpperCase()} />
              </div>

              <label className="block text-xs font-medium text-midnight">
                Evidence review note
                <textarea
                  value={notes[payment.id] || ""}
                  onChange={(event) => setNotes((current) => ({ ...current, [payment.id]: event.target.value }))}
                  rows={2}
                  maxLength={1000}
                  placeholder="Record how the UTR, amount, date, and recipient were matched in bank/UPI records."
                  className="mt-1 w-full rounded-lg border border-line bg-ivory/70 px-3 py-2 text-xs"
                />
              </label>

              {payment.status === "pending" && (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-[220px] flex-1 text-xs font-medium text-midnight">
                    Rejection reason (required to reject)
                    <input
                      value={reasons[payment.id] || ""}
                      onChange={(event) => setReasons((current) => ({ ...current, [payment.id]: event.target.value }))}
                      maxLength={500}
                      className="mt-1 w-full rounded-lg border border-line bg-ivory/70 px-3 py-2 text-xs"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busyId === payment.id}
                    onClick={() => reviewPayment(payment.id, "reject")}
                    className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={busyId === payment.id}
                    onClick={() => reviewPayment(payment.id, "approve")}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {busyId === payment.id ? "Saving..." : "Approve verified payment"}
                  </button>
                </div>
              )}

              {payment.status === "verified" && (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-[220px] flex-1 text-xs font-medium text-midnight">
                    Refund reason (required to reverse commission)
                    <input
                      value={reasons[payment.id] || ""}
                      onChange={(event) => setReasons((current) => ({ ...current, [payment.id]: event.target.value }))}
                      maxLength={500}
                      className="mt-1 w-full rounded-lg border border-line bg-ivory/70 px-3 py-2 text-xs"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busyId === payment.id}
                    onClick={() => reviewPayment(payment.id, "refund")}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Mark refunded
                  </button>
                </div>
              )}
            </article>
          ))
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-display text-lg font-bold text-midnight">Astrologer commission settlements</h2>
          <p className="text-xs text-muted">
            UTRs submitted here remain pending and do not reduce the astrologer&apos;s dues until verified.
          </p>
        </div>
        {settlements.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gold/30 bg-white p-8 text-center text-sm text-muted">
            No commission settlements awaiting verification.
          </div>
        ) : (
          settlements.map((settlement) => (
            <article key={settlement.id} className="space-y-3 rounded-2xl border border-gold/25 bg-white p-4 shadow-sm">
              <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <Info label="Astrologer" value={settlement.display_name || settlement.consultant_id} />
                <Info label="Settlement" value={settlement.settlement_number} mono />
                <Info label="Amount" value={formatPaiseToInr(settlement.amount_paise)} />
                <Info label="UTR / reference" value={settlement.submitted_utr} mono />
                <Info label="Payment date" value={settlement.payment_date || "Not recorded"} />
                <Info label="Submitted" value={settlement.submitted_at ? new Date(settlement.submitted_at).toLocaleString() : "Unknown"} />
              </div>

              <label className="block text-xs font-medium text-midnight">
                Evidence review note
                <textarea
                  value={notes[settlement.id] || ""}
                  onChange={(event) => setNotes((current) => ({ ...current, [settlement.id]: event.target.value }))}
                  rows={2}
                  maxLength={1000}
                  placeholder="Record how the UTR, amount, date, and receiving account were matched."
                  className="mt-1 w-full rounded-lg border border-line bg-ivory/70 px-3 py-2 text-xs"
                />
              </label>

              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-[220px] flex-1 text-xs font-medium text-midnight">
                  Rejection reason (required to reject)
                  <input
                    value={reasons[settlement.id] || ""}
                    onChange={(event) => setReasons((current) => ({ ...current, [settlement.id]: event.target.value }))}
                    maxLength={500}
                    className="mt-1 w-full rounded-lg border border-line bg-ivory/70 px-3 py-2 text-xs"
                  />
                </label>
                <button
                  type="button"
                  disabled={busyId === settlement.id}
                  onClick={() => reviewSettlement(settlement, "reject")}
                  className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50"
                >
                  Reject
                </button>
                <button
                  type="button"
                  disabled={busyId === settlement.id}
                  onClick={() => reviewSettlement(settlement, "approve")}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {busyId === settlement.id ? "Saving..." : "Approve verified settlement"}
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-0.5 break-words font-medium text-midnight ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
