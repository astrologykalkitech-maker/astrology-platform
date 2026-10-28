import React from "react";
import Link from "next/link";
import { ArrowLeft, Receipt, ShieldCheck } from "lucide-react";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import { getCustomerBillingHistory } from "@/app/actions/customer";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { formatExactDateTime } from "@/lib/astrologer/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Consultation History & Receipts | JyotishSetu",
  description: "View verified consultation transaction receipts and fee records.",
};

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

export default async function BillingHistoryPage() {
  const [, res] = await Promise.all([requireCustomerPage(), getCustomerBillingHistory()]);
  const billingRecords = res.success && res.data ? res.data : [];

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Link
          href="/customer"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gold/30 bg-white text-gold-deep hover:bg-parchment transition-colors"
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <CardTitle>Consultation Fee & Receipt History</CardTitle>
          <p className="text-xs text-muted">
            Authoritative records of completed and scheduled Vedic consultations.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 p-3.5 rounded-xl border border-gold/20 bg-parchment/50 text-xs text-ink/80">
        <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
        <span>
          Payment gateway integration is planned for our next release. Existing consultations display recorded fee schedules and session status.
        </span>
      </div>

      {billingRecords.length === 0 ? (
        <div className={`${CARD} py-16 px-6 text-center`}>
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep mb-4">
            <Receipt className="h-8 w-8" />
          </span>
          <h2 className="text-lg font-semibold text-midnight">No Recorded Transactions</h2>
          <p className="text-xs text-muted max-w-md mx-auto mt-1 mb-6">
            When you complete or schedule consultations with verified astrologers, transaction receipts will appear here automatically.
          </p>
          <Link
            href="/customer/astrologers"
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-4 py-2 text-xs font-semibold text-midnight shadow"
          >
            Browse Astrologers
          </Link>
        </div>
      ) : (
        <div className={`${CARD} overflow-hidden p-0`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gold/20 bg-parchment/40 text-xs font-semibold uppercase tracking-wider text-muted">
                  <th className="py-3.5 px-4">Receipt Ref</th>
                  <th className="py-3.5 px-4">Astrologer</th>
                  <th className="py-3.5 px-4">Service & Mode</th>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Recorded Amount</th>
                  <th className="py-3.5 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gold/10">
                {billingRecords.map((item) => (
                  <tr key={item.id} className="hover:bg-parchment/20 transition-colors">
                    <td className="py-4 px-4 font-mono text-xs font-semibold text-midnight">
                      {item.transaction_ref}
                    </td>
                    <td className="py-4 px-4 font-semibold text-midnight">
                      {item.astrologer_name}
                    </td>
                    <td className="py-4 px-4 text-xs">
                      <p className="font-medium text-midnight">{item.service_type}</p>
                      <p className="text-[11px] text-muted">{item.consultation_mode}</p>
                    </td>
                    <td className="py-4 px-4 text-xs text-muted">
                      {formatExactDateTime(item.created_at)}
                    </td>
                    <td className="py-4 px-4 font-bold text-midnight">
                      ₹{item.amount.toFixed(2)}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <span
                        className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                          item.payment_status === "paid"
                            ? "border-emerald/30 bg-emerald/10 text-emerald-800"
                            : item.payment_status === "complimentary"
                            ? "border-sky-200 bg-sky-50 text-sky-800"
                            : "border-amber-200 bg-amber-50 text-amber-800"
                        }`}
                      >
                        {item.payment_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
