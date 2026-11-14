import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireSuperAdminPage } from "@/lib/auth/admin-guard";
import { getManualVerificationQueueAction } from "@/app/actions/financial-verification";
import { ManualPaymentVerificationClient } from "@/components/admin/ManualPaymentVerificationClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Manual Payment Verification | JyotishSetu Super Admin",
  description: "Review direct consultation payment UTRs and commission settlement payments against bank evidence.",
};

export default async function ManualPaymentVerificationsPage() {
  await requireSuperAdminPage();
  const result = await getManualVerificationQueueAction();

  return (
    <div className="space-y-5">
      <Link
        href="/super-admin/financials/commissions"
        className="inline-flex items-center gap-2 text-xs font-semibold text-gold-deep hover:text-midnight"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Commission Ledger
      </Link>
      <div>
        <h1 className="font-display text-2xl font-bold text-midnight">Manual Payment Verification</h1>
        <p className="text-xs text-muted">
          UTR submission never verifies a payment. Check the actual transaction records before approving or refunding.
        </p>
      </div>
      {!result.success ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          Could not load verification queue: {result.error}
        </div>
      ) : (
        <ManualPaymentVerificationClient
          directPayments={result.directPayments || []}
          settlements={result.settlements || []}
          jyotishPayments={result.jyotishPayments || []}
        />
      )}
    </div>
  );
}
