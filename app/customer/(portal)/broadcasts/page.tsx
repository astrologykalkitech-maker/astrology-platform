import React from "react";
import Link from "next/link";
import { ArrowLeft, Radio, Sparkles, Video, Users } from "lucide-react";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import { getActiveLiveBroadcasts } from "@/app/actions/broadcast";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { CustomerBroadcastListClient } from "@/components/customer/CustomerBroadcastListClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Live Astrologer Broadcasts | JyotishSetu",
  description: "Join live spiritual streams, planetary guidance sessions, and interactive Vedic discourses.",
};

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

export default async function CustomerBroadcastsPage() {
  await requireCustomerPage();
  const res = await getActiveLiveBroadcasts();
  const broadcasts = res.success && res.data ? res.data : [];

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
          <CardTitle>Live Vedic Broadcasts</CardTitle>
          <p className="text-xs text-muted">
            Watch live interactive planetary discourses and spiritual guidance sessions from verified astrologers.
          </p>
        </div>
      </div>

      <CustomerBroadcastListClient initialBroadcasts={broadcasts} />
    </div>
  );
}

