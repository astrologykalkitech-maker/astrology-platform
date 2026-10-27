import React from "react";
import Link from "next/link";
import {
  Plus,
  ClipboardList,
  ArrowRight,
} from "lucide-react";
import { getCustomerEnquiries } from "@/app/actions/customer";
import { formatExactDateTime } from "@/lib/astrologer/format";
import { buttonStyles } from "@/components/astrologer/ui/Button";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";

export const dynamic = "force-dynamic";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

// For the data table card we need overflow-x-auto at the card level, not overflow-hidden,
// otherwise the inner scroll container gets clipped and the Actions column disappears.
const CARD_TABLE =
  "relative overflow-x-auto rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

export default async function EnquiriesPage() {
  const result = await getCustomerEnquiries();

  if (!result.success || !result.data) {
    return (
      <div className={`${CARD} p-8 text-center`}>
        <h2 className="text-xl font-semibold text-red-600 mb-2">Unable to load enquiries</h2>
        <p className="text-sm text-muted mb-5">
          {result.error || "An error occurred while loading your enquiries."}
        </p>
        <Link href="/customer/enquiries" className={buttonStyles({ variant: "gold" })}>
          Retry
        </Link>
      </div>
    );
  }

  const enquiries = result.data;

  return (
    <div className="space-y-5">
      {/* Header bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>My Enquiries & Consultations</CardTitle>
          <p className="text-xs text-muted mt-1">
            Track all your consultations, questions, and responses from Vedic astrologers.
          </p>
        </div>
        <div>
          <Link
            href="/customer/enquiries/new"
            className={buttonStyles({ variant: "gold", size: "sm" })}
          >
            <Plus className="h-4 w-4" /> Ask for Guidance
          </Link>
        </div>
      </div>

      {/* Main Enquiries List */}
      {enquiries.length === 0 ? (
        <div className={`${CARD} py-16 px-6 text-center`}>
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep mb-4">
            <ClipboardList className="h-8 w-8" />
          </span>
          <h2 className="text-lg font-semibold text-midnight">No Enquiries Found</h2>
          <p className="text-sm text-muted max-w-md mx-auto mt-1 mb-6">
            You haven&apos;t asked any astrological questions yet. Submit your query to get comprehensive Vedic analysis.
          </p>
          <Link href="/customer/enquiries/new" className={buttonStyles({ variant: "gold" })}>
            <Plus className="h-4 w-4" /> Submit Your First Enquiry
          </Link>
        </div>
      ) : (
        <div className={`${CARD_TABLE} p-0`}>
          {/* Mobile Card Reflow (screens < md) */}
          <div className="divide-y divide-gold/10 md:hidden">
            {enquiries.map((item) => {
              const statusBadge =
                item.status === "new"
                  ? "bg-amber-100 text-amber-800 border-amber-200"
                  : item.status === "assigned"
                  ? "bg-sky-100 text-sky-800 border-sky-200"
                  : item.status === "contacted"
                  ? "bg-indigo-100 text-indigo-800 border-indigo-200"
                  : item.status === "closed" || item.status === "converted"
                  ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                  : "bg-slate-100 text-slate-800 border-slate-200";

              const displayStatus =
                item.status === "closed"
                  ? "Completed"
                  : item.status === "converted"
                  ? "Converted"
                  : item.status === "contacted"
                  ? "In Progress"
                  : item.status === "assigned"
                  ? "Assigned"
                  : "Pending";

              const displayDate = formatExactDateTime(item.created_at);

              return (
                <div key={item.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm text-midnight break-words flex-1">
                      {item.subject}
                    </h3>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadge}`}
                    >
                      {displayStatus}
                    </span>
                  </div>
                  <p className="text-xs text-ink/75 line-clamp-2">
                    {item.message}
                  </p>
                  <div className="flex items-center justify-between text-[11px] text-muted pt-2 border-t border-gold/10">
                    <span className="truncate max-w-[60%]">
                      <strong className="text-midnight/80">With:</strong> {item.astrologer_name || "Platform Pool"}
                    </span>
                    <span>{displayDate}</span>
                  </div>
                  <div className="pt-1 flex justify-end">
                    <Link
                      href={`/customer/enquiries/${item.id}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-gold-deep hover:text-gold"
                    >
                      View Guidance & Predictions <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View (screens >= md) */}
          <div className="hidden md:block">
            <table className="w-full min-w-0 text-left text-sm">
              <thead>
                <tr className="border-b border-gold/20 bg-parchment/40 text-xs font-semibold uppercase tracking-wider text-muted">
                  <th className="py-3.5 px-4 min-w-0">Subject</th>
                  <th className="py-3.5 px-4 min-w-0">Message Preview</th>
                  <th className="py-3.5 px-4 min-w-0">Assigned Astrologer</th>
                  <th className="py-3.5 px-4 min-w-0">Submitted Date</th>
                  <th className="py-3.5 px-4 text-center min-w-0">Status</th>
                  <th className="py-3.5 px-4 text-right min-w-0">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gold/10">
                {enquiries.map((item) => {
                  const statusBadge =
                    item.status === "new"
                      ? "bg-amber-100 text-amber-800 border-amber-200"
                      : item.status === "assigned"
                      ? "bg-sky-100 text-sky-800 border-sky-200"
                      : item.status === "contacted"
                      ? "bg-indigo-100 text-indigo-800 border-indigo-200"
                      : item.status === "closed" || item.status === "converted"
                      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                      : "bg-slate-100 text-slate-800 border-slate-200";

                  const displayStatus =
                    item.status === "closed"
                      ? "Completed"
                      : item.status === "converted"
                      ? "Converted"
                      : item.status === "contacted"
                      ? "In Progress"
                      : item.status === "assigned"
                      ? "Assigned"
                      : "Pending";

                  const displayDate = formatExactDateTime(item.created_at);

                  return (
                    <tr key={item.id} className="hover:bg-parchment/30 transition-colors">
                      <td className="py-4 px-4 font-semibold text-midnight">
                        {item.subject}
                      </td>
                      <td className="py-4 px-4 text-ink/75 max-w-[280px] truncate">
                        {item.message}
                      </td>
                      <td className="py-4 px-4 text-ink font-medium">
                        {item.astrologer_name || "Platform General Pool"}
                      </td>
                      <td className="py-4 px-4 text-xs text-muted whitespace-nowrap">
                        {displayDate}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span
                          className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${statusBadge}`}
                        >
                          {displayStatus}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right whitespace-nowrap">
                        <Link
                          href={`/customer/enquiries/${item.id}`}
                          className={buttonStyles({ variant: "outline", size: "sm" })}
                        >
                          View Guidance <ArrowRight className="h-3.5 w-3.5 ml-1" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}