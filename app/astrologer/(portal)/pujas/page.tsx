import React from "react";
import Link from "next/link";
import { ArrowLeft, Flame } from "lucide-react";
import { requireAstrologerPage, getOwnAstrologerProfile } from "@/lib/astrologer/guard";
import { getAstrologerAssignedPujas } from "@/app/actions/astrologer-pujas";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { AstrologerPujasClient } from "@/components/astrologer/AstrologerPujasClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Assigned Puja Rituals | Karmic Ascension Astrologer Portal",
  description: "Conduct scheduled Vedic Pujas, host Live Video Darshan, and upload consecration evidence.",
};

export default async function AstrologerPujasPage() {
  await requireAstrologerPage();
  const { profile } = await getOwnAstrologerProfile();
  
  // Pass the already resolved astrologer profile directly (handling both main & admin DB contexts)
  const res = await getAstrologerAssignedPujas(profile?.id || profile?.display_name);
  const initialBookings = res.success && res.data ? res.data : [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/astrologer/dashboard"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gold/30 bg-white text-gold-deep hover:bg-parchment transition-colors"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-gold-deep" />
              <CardTitle>Assigned Puja Rituals</CardTitle>
            </div>
            <p className="text-xs text-muted">
              Preside over sacred ceremonies, conduct Live Video Darshan for devotees, and submit completion evidence.
            </p>
          </div>
        </div>
      </div>

      {/* Main Client Console */}
      <AstrologerPujasClient
        initialBookings={initialBookings}
        profileHint={profile?.id || profile?.display_name || undefined}
      />
    </div>
  );
}

