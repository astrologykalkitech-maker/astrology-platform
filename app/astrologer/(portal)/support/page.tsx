import React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  LifeBuoy,
  ShieldCheck,
  Mail,
  Send,
  HelpCircle,
  FileCheck,
} from "lucide-react";
import { requireAstrologerPage } from "@/lib/astrologer/guard";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Astrologer Support & Escalations | JyotishSetu",
  description: "Get technical assistance with lead management, profile moderation, or customer enquiries.",
};

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

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
          <CardTitle>Astrologer Support & Platform Guidance</CardTitle>
          <p className="text-xs text-muted">
            Assistance with consultation leads, profile review statuses, and technical issues.
          </p>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Support Options */}
        <div className={`${CARD} p-6 space-y-4`}>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold/15 text-gold-deep">
              <LifeBuoy className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-midnight">Consultant Helpdesk</h3>
              <p className="text-xs text-muted">Direct escalation to super administrators</p>
            </div>
          </div>

          <p className="text-xs text-ink/80 leading-relaxed">
            If you have questions regarding your profile verification, need assistance with an assigned lead, or experience technical errors during a consultation session, our administrative support team is available to assist you.
          </p>

          <div className="pt-2 border-t border-gold/15 space-y-2.5 text-xs text-muted">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>Priority consultant support & ticket routing</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-sky-600" />
              <span>Direct email: <strong className="text-midnight">astrologers@jyotishsetu.com</strong></span>
            </div>
          </div>
        </div>

        {/* Quick Astrologer FAQ */}
        <div className={`${CARD} p-6 space-y-4`}>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold/15 text-gold-deep">
              <HelpCircle className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-midnight">Frequent Questions</h3>
              <p className="text-xs text-muted">Guidelines for consultants</p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-parchment/40 border border-line">
              <p className="font-semibold text-midnight">How do lead status updates work?</p>
              <p className="text-muted mt-0.5">
                Moving a lead from &ldquo;New&rdquo; to &ldquo;Contacted&rdquo; indicates you have reached out. Marking it &ldquo;Closed&rdquo; completes the consultation and unlocks the customer review form.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-parchment/40 border border-line">
              <p className="font-semibold text-midnight">When does my profile appear in the directory?</p>
              <p className="text-muted mt-0.5">
                Profiles appear publicly in the customer directory once reviewed and approved by the Super Admin team.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
