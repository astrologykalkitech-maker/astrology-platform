import React from "react";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import {
  getSuperAdminBroadcasts,
  getSuperAdminModerationReports,
} from "@/app/actions/super-admin-broadcasts";
import { SuperAdminBroadcastsClient } from "@/components/admin/SuperAdminBroadcastsClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Live Broadcast Monitoring | JyotishSetu Super Admin",
  description: "Monitor real-time LiveKit audio/video sessions and administrative room controls.",
};

export default async function SuperAdminBroadcastsPage() {
  await requireSuperAdmin();
  const [bRes, rRes] = await Promise.all([
    getSuperAdminBroadcasts(),
    getSuperAdminModerationReports(),
  ]);

  const broadcasts = bRes.success ? bRes.data : [];
  const reports = rRes.success ? rRes.data : [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6">
      <div>
        <CardTitle>Live Broadcast Monitoring & WebRTC Oversight</CardTitle>
        <p className="text-xs text-muted">
          Authoritative oversight of LiveKit SFU media rooms, participant activity, seeker moderation, and emergency session termination.
        </p>
      </div>

      <SuperAdminBroadcastsClient
        initialBroadcasts={broadcasts}
        initialReports={reports}
      />
    </div>
  );
}
