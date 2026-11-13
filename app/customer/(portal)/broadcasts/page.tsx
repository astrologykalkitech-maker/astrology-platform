import React from "react";
import Link from "next/link";
import { ArrowLeft, Radio, Sparkles, Video, Users } from "lucide-react";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import { getActiveLiveBroadcasts, getUpcomingScheduledBroadcasts } from "@/app/actions/broadcast";
import { getCustomerFollowedAstrologers } from "@/app/actions/follows";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { CustomerBroadcastListClient } from "@/components/customer/CustomerBroadcastListClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Live Astrologer Broadcasts | JyotishSetu",
  description: "Join live spiritual streams, planetary guidance sessions, and interactive Vedic discourses.",
};

export default async function CustomerBroadcastsPage() {
  await requireCustomerPage();
  const [liveRes, upcomingRes, followsRes] = await Promise.all([
    getActiveLiveBroadcasts(),
    getUpcomingScheduledBroadcasts(),
    getCustomerFollowedAstrologers(),
  ]);

  const broadcasts = liveRes.success && liveRes.data ? liveRes.data : [];
  const upcoming = upcomingRes.success && upcomingRes.data ? upcomingRes.data : [];
  const followedIds = followsRes.success && followsRes.astrologerIds ? followsRes.astrologerIds : [];

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

      <CustomerBroadcastListClient
        initialBroadcasts={broadcasts}
        upcomingBroadcasts={upcoming}
        followedAstrologerIds={followedIds}
      />
    </div>
  );
}
