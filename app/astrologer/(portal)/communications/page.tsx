import React from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { requireAstrologerPage } from "@/lib/astrologer/guard";
import { getAstrologerAdminCommunicationsAction } from "@/app/actions/astrologer-admin-chat";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import AstrologerAdminCommunicationsClient from "./AstrologerAdminCommunicationsClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Super Admin Direct Communications | JyotishSetu",
  description: "Direct official channel between Super Admin operations and verified Vedic astrologers.",
};

export default async function AstrologerCommunicationsPage() {
  await requireAstrologerPage();
  const res = await getAstrologerAdminCommunicationsAction();
  const messages = res.success && res.data ? res.data.messages : [];

  return (
    <div className="space-y-5 max-w-4xl mx-auto pb-12">
      <div className="flex items-center gap-3">
        <Link
          href="/astrologer/notifications"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gold/30 bg-white text-gold-deep hover:bg-parchment transition-colors"
          aria-label="Back to notifications"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-gold-deep" />
            Super Admin Official Communications Desk
          </CardTitle>
          <p className="text-xs text-muted">
            Direct, authenticated communication channel with platform owners, management, and compliance administrators.
          </p>
        </div>
      </div>

      <AstrologerAdminCommunicationsClient initialMessages={messages} />
    </div>
  );
}
