import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAstrologerPage, getOwnAstrologerProfile } from "@/lib/astrologer/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { AstrologerBroadcastHostClient } from "@/components/astrologer/AstrologerBroadcastHostClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Host Live Broadcast | Karmic Ascension Astrologer Portal",
  description: "Start a real-time live streaming session for seekers on the Karmic Ascension platform.",
};

export default async function AstrologerBroadcastPage() {
  await requireAstrologerPage();
  const { profile } = await getOwnAstrologerProfile();
  const admin = await createAdminClient("main");

  const astroId = profile?.id || "";
  const astroName = profile?.display_name || "Vedic Astrologer";

  // Fetch astrologer active broadcast if any
  const { data: activeBroadcast } = astroId
    ? await admin
        .from("astrologer_live_broadcasts")
        .select("*")
        .eq("astrologer_id", astroId)
        .eq("status", "live")
        .maybeSingle()
    : { data: null };

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
          <CardTitle>Astrologer Live Broadcasting Studio</CardTitle>
          <p className="text-xs text-muted">
            Host live interactive Vedic discourses, address general queries, and connect directly with seekers.
          </p>
        </div>
      </div>

      <AstrologerBroadcastHostClient
        astrologerId={astroId}
        astrologerName={astroName}
        existingBroadcast={activeBroadcast}
      />
    </div>
  );
}

