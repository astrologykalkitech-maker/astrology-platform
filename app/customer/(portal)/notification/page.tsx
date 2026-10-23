import React from "react";
import Link from "next/link";
import { ArrowLeft, Bell, BellOff, ArrowRight } from "lucide-react";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import { getCustomerEnquiries } from "@/app/actions/customer";
import { buttonStyles } from "@/components/astrologer/ui/Button";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";

export const dynamic = "force-dynamic";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

export default async function NotificationsPage() {
  await requireCustomerPage();
  const res = await getCustomerEnquiries();
  const enquiries = res.success && res.data ? res.data : [];

  // Derive notifications from customer enquiries
  const recentUpdates = enquiries.filter(
    (e) => e.status === "assigned" || e.status === "closed" || e.status === "new"
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href="/customer"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gold/30 bg-white text-gold-deep hover:bg-parchment transition-colors"
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <CardTitle>Activity & Notifications</CardTitle>
          <p className="text-xs text-muted">
            Status notifications, consultation updates, and astrologer communications.
          </p>
        </div>
      </div>

      {recentUpdates.length === 0 ? (
        <div className={`${CARD} py-16 px-6 text-center`}>
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep mb-4">
            <BellOff className="h-8 w-8" />
          </span>
          <h2 className="text-lg font-semibold text-midnight">All Caught Up</h2>
          <p className="text-xs text-muted max-w-md mx-auto mt-1 mb-6">
            You have no unread notifications. Updates will appear here as soon as an astrologer reviews your enquiry.
          </p>
          <Link href="/customer/enquiries" className={buttonStyles({ variant: "gold", size: "sm" })}>
            View My Enquiries
          </Link>
        </div>
      ) : (
        <div className={`${CARD} p-0 overflow-hidden`}>
          <div className="p-4 sm:p-5 border-b border-gold/20 bg-parchment/30">
            <h3 className="text-sm font-semibold text-midnight">Recent Activity Feed</h3>
          </div>
          <div className="divide-y divide-gold/10">
            {recentUpdates.slice(0, 10).map((item) => {
              const displayDate = new Date(item.created_at).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              });

              return (
                <div
                  key={item.id}
                  className="p-4 sm:p-5 flex items-start gap-4 hover:bg-parchment/30 transition-colors"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold-deep">
                    <Bell className="h-5 w-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-midnight truncate">
                        {item.subject}
                      </p>
                      <span className="text-[11px] text-muted whitespace-nowrap">{displayDate}</span>
                    </div>
                    <p className="text-xs text-ink/75 mt-0.5">
                      Status is currently{" "}
                      <span className="font-semibold text-gold-deep uppercase">
                        {item.status}
                      </span>
                      {item.astrologer_name ? ` with ${item.astrologer_name}` : " in platform review"}.
                    </p>
                  </div>
                  <Link
                    href="/customer/enquiries"
                    className="shrink-0 p-2 text-muted hover:text-gold-deep transition-colors"
                    aria-label="View enquiry details"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}