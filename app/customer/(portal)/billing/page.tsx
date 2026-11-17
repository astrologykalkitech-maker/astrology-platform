import React from "react";
import Link from "next/link";
import { ArrowLeft, Receipt, ShieldCheck } from "lucide-react";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import { getCustomerBillingHistory } from "@/app/actions/customer";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { CustomerBillingClient } from "@/components/customer/CustomerBillingClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Consultation History & Receipts | Karmic Ascension",
  description: "View verified consultation transaction receipts, pay invoices, and download receipts.",
};

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

export default async function BillingHistoryPage() {
  const [ctx, res] = await Promise.all([requireCustomerPage(), getCustomerBillingHistory()]);
  const billingRecords = res.success && res.data ? res.data : [];
  const customerName = ctx.user.user_metadata?.full_name || ctx.user.email?.split("@")[0] || "Valued Seeker";

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Link
          href="/customer/astrologers"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gold/30 bg-white text-gold-deep hover:bg-parchment transition-colors"
          aria-label="Back to astrologers"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <CardTitle>Consultation Billing & Receipts</CardTitle>
          <p className="text-xs text-muted">
            Official tax invoices, verified Instamojo payments, and consultation receipts.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 p-3.5 rounded-xl border border-gold/20 bg-parchment/50 text-xs text-ink/80">
        <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
        <span>
          All transactions are secured via 256-bit encrypted Instamojo gateway. Download PDF tax receipts anytime.
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
            Find Verified Astrologers
          </Link>
        </div>
      ) : (
        <CustomerBillingClient
          records={billingRecords}
          customerName={customerName}
          customerEmail={ctx.user.email}
        />
      )}
    </div>
  );
}
