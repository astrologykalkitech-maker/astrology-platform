import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAstrologerPage } from "@/lib/astrologer/guard";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import AstrologerSupportInteractiveClient from "./AstrologerSupportInteractiveClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Astrologer Support & Escalations | JyotishSetu",
  description: "AI-powered assistance and direct Super Admin escalation for lead management, profile moderation, or consultations.",
};

export default async function AstrologerSupportPage() {
  await requireAstrologerPage();

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Link
          href="/astrologer/dashboard"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gold/30 bg-white text-gold-deep hover:bg-parchment transition-colors"
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <CardTitle>Astrologer Support & Escalations Desk</CardTitle>
          <p className="text-xs text-muted">
            AI-powered consultation guidance and direct escalation to the Super Admin moderation team.
          </p>
        </div>
      </div>

      <AstrologerSupportInteractiveClient />
    </div>
  );
}

