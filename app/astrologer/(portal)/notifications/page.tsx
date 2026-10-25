import React from "react";
import Link from "next/link";
import { ArrowLeft, Bell, CheckCircle2, Clock, Calendar, MessageSquare, ShieldAlert } from "lucide-react";
import { requireAstrologerPage } from "@/lib/astrologer/guard";
import { getAstrologerNotificationsAction, markAstrologerNotificationReadAction } from "@/app/actions/astrologer-portal";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { formatExactDateTime } from "@/lib/astrologer/format";
import AstrologerNotificationsClient from "./AstrologerNotificationsClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Astrologer Activity & Notifications | JyotishSetu",
  description: "View important consultation requests, lead assignments, and system notifications.",
};

export default async function AstrologerNotificationsPage() {
  await requireAstrologerPage();
  const res = await getAstrologerNotificationsAction();
  const notifications = res.success && res.data ? res.data : [];

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Link
          href="/astrologer/dashboard"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gold/30 bg-white text-gold-deep hover:bg-parchment transition-colors"
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <CardTitle>Notifications & Activity</CardTitle>
          <p className="text-xs text-muted">
            Important updates regarding assigned enquiries, customer consultation requests, and listing status.
          </p>
        </div>
      </div>

      <AstrologerNotificationsClient initialNotifications={notifications} />
    </div>
  );
}
