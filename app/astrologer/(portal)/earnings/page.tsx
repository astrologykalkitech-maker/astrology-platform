import React from "react";
import Link from "next/link";
import { ArrowLeft, Wallet, ShieldCheck, Scale } from "lucide-react";
import { requireAstrologerPage } from "@/lib/astrologer/guard";
import { getAstrologerEarningsAction } from "@/app/actions/astrologer-portal";
import { getConsultantCommissionStatement } from "@/lib/financial/commission-engine";
import { AstrologerCommissionBalanceClient } from "@/components/astrologer/AstrologerCommissionBalanceClient";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { formatExactDateTime } from "@/lib/astrologer/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Earnings & Commission Float | Karmic Ascension",
  description: "View verified consultation fees, 10% platform commission ledger, and settle dues.",
};

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

export default async function AstrologerEarningsPage() {
  const [, res, commissionRes] = await Promise.all([
    requireAstrologerPage(),
    getAstrologerEarningsAction(),
    getConsultantCommissionStatement(),
  ]);
  const summary = res.success ? res.data : null;

  const commissionData =
    commissionRes.success && commissionRes.data
      ? commissionRes.data.summary
        ? { ...commissionRes.data, summary: commissionRes.data.summary }
        : null
      : null;

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Link
          href="/astrologer/dashboard"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gold/30 bg-white text-gold-deep hover:bg-parchment transition-colors"
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <CardTitle>Earnings & Fee Summary</CardTitle>
          <p className="text-xs text-muted">
            Detailed ledger of consultation earnings, completed sessions, and scheduled fee accruals.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 p-3.5 rounded-xl border border-gold/20 bg-parchment/50 text-xs text-ink/80">
        <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
        <span>
          Direct customer payments are manually verified against bank/UPI records. Commission is accrued only after payment verification and booking completion.
        </span>
      </div>

      {summary ? (
        <>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className={`${CARD} p-4`}>
          <span className="text-xs text-muted">Total Consultations</span>
          <p className="text-xl font-bold text-midnight mt-1">{summary.totalConsultations}</p>
        </div>
        <div className={`${CARD} p-4`}>
          <span className="text-xs text-muted">Completed Sessions</span>
          <p className="text-xl font-bold text-emerald-600 mt-1">{summary.completedConsultations}</p>
        </div>
        <div className={`${CARD} p-4`}>
          <span className="text-xs text-muted">Verified Gross Earnings</span>
          <p className="text-xl font-bold text-midnight mt-1">₹{summary.totalEarningsValue}</p>
        </div>
        <div className={`${CARD} p-4`}>
          <span className="text-xs text-muted">Upcoming / In-Flight</span>
          <p className="text-xl font-bold text-amber-600 mt-1">₹{summary.pendingEarningsValue}</p>
        </div>
      </div>

      {/* Record Table */}
      {summary.records.length === 0 ? (
        <div className={`${CARD} py-16 px-6 text-center`}>
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep mb-4">
            <Wallet className="h-8 w-8" />
          </span>
          <h2 className="text-lg font-semibold text-midnight">No Consultation Financials Yet</h2>
          <p className="text-xs text-muted max-w-md mx-auto mt-1 mb-6">
            As you receive consultation bookings and complete Vedic reading sessions, detailed itemized records will populate here.
          </p>
          <Link
            href="/astrologer/profile/edit"
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-4 py-2 text-xs font-semibold text-midnight shadow"
          >
            Review Consultation Fee Settings
          </Link>
        </div>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="p-4 border-b border-line bg-parchment/30">
            <h3 className="font-semibold text-sm text-midnight">Consultation Fee Ledger</h3>
          </div>
          <div className="divide-y divide-line overflow-x-auto">
            {summary.records.map((rec) => (
              <div key={rec.id} className="p-4 flex items-center justify-between gap-4 text-xs">
                <div>
                  <p className="font-semibold text-midnight text-sm capitalize">{rec.service_type || "Vedic Consultation"}</p>
                  <p className="text-muted mt-0.5">
                    Client: <span className="text-ink font-medium">{rec.customer_name}</span> &bull; Mode: <span className="capitalize">{rec.consultation_mode}</span>
                  </p>
                  <p className="text-[11px] text-muted font-mono mt-0.5">
                    {formatExactDateTime(rec.scheduled_at)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm text-midnight">₹{rec.fee_amount}</p>
                  <span
                    className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                      rec.status === "completed"
                        ? "bg-emerald-100 text-emerald-800"
                        : rec.status === "confirmed"
                        ? "bg-sky-100 text-sky-800"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {rec.status}
                  </span>
                  <span className="block mt-1 text-[10px] text-muted">
                    Payment: {rec.payment_status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
        </>
      ) : (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          Could not load earnings: {res.error || "Earnings data is unavailable."}
        </div>
      )}

      {/* Platform 10% Commission Float & Dues Ledger */}
      {commissionData ? (
      <div className="pt-6 border-t border-gold/20">
        <div className="flex items-center gap-2 mb-4">
          <Scale className="h-5 w-5 text-gold-deep" />
          <div>
            <h2 className="font-display text-lg font-bold text-midnight">
              Marketplace Commission & Float Management
            </h2>
            <p className="text-xs text-muted">
              Configured Karmic Ascension platform commission ledger, negative balance tracking, and verified dues settlement.
            </p>
          </div>
        </div>
        <AstrologerCommissionBalanceClient
          summary={commissionData.summary}
          ledger={commissionData.ledger}
          directPayments={commissionData.directPayments}
          settlements={commissionData.settlements}
        />
      </div>
      ) : (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          Could not load commission wallet: {commissionRes.error || "Commission summary is unavailable."}
        </div>
      )}
    </div>
  );
}
