import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import { getCustomerNotifications } from "@/app/actions/customer";
import CustomerNotificationsClient from "./CustomerNotificationsClient";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const [, res] = await Promise.all([requireCustomerPage(), getCustomerNotifications()]);
  const notifications = res.success && res.data ? res.data : [];

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

      <CustomerNotificationsClient initialNotifications={notifications} />
    </div>
  );
}