import React from "react";
import Link from "next/link";
import { ArrowLeft, Wallet, ShieldCheck, TrendingUp, Clock, CheckCircle } from "lucide-react";
import { requireAstrologerPage } from "@/lib/astrologer/guard";
import { getAstrologerEarningsAction } from "@/app/actions/astrologer-portal";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { formatExactDateTime } from "@/lib/astrologer/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Earnings & Consultation Breakdown | JyotishSetu",
  description: "View verified consultation fees and performance breakdown.",
};

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

export default async function AstrologerEarningsPage() {
  await requireAstrologerPage();
  const res = await getAstrologerEarningsAction();
  const summary =
    res.success && res.data
      ? res.data
      : { totalConsultations: 0, completedConsultations: 0, totalEarningsValue: 0, pendingEarningsValue: 0, records: [] };

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
          Automated payout processing is scheduled for our upcoming release. Consultation fees shown below reflect your authoritative booking rate schedules.
        </span>
      </div>

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
          <span className="text-xs text-muted">Settled Value</span>
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
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
