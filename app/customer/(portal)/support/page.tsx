import React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  LifeBuoy,
  HelpCircle,
  ShieldCheck,
  Mail,
  Send,
} from "lucide-react";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import { buttonStyles } from "@/components/astrologer/ui/Button";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";

export const dynamic = "force-dynamic";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

export default async function CustomerSupportPage() {
  await requireCustomerPage();

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
          <CardTitle>Customer Support & Escalations</CardTitle>
          <p className="text-xs text-muted">
            Assistance with consultation enquiries, booking issues, or platform guidance.
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
              <h3 className="text-sm font-semibold text-midnight">Consultation Assistance</h3>
              <p className="text-xs text-muted">Direct escalation to platform administrators</p>
            </div>
          </div>

          <p className="text-xs text-ink/80 leading-relaxed">
            If you encounter delays with an enquiry response, technical issues during a consultation, or require clarification regarding astrologer qualifications, our administrative team is here to assist.
          </p>

          <div className="pt-2 border-t border-gold/15 space-y-2.5 text-xs text-muted">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>All consultations are backed by Vedic ethical standards.</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-gold-deep" />
              <span>Email: <strong className="text-midnight">support@jyotishsetu.com</strong></span>
            </div>
          </div>

          <div className="pt-2">
            <Link
              href="/customer/enquiries/new?priority=urgent"
              className={buttonStyles({ variant: "gold", size: "sm" })}
            >
              <Send className="h-3.5 w-3.5" /> Submit Support Request
            </Link>
          </div>
        </div>

        {/* FAQs & Escalation policies */}
        <div className={`${CARD} p-6 space-y-4`}>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
              <HelpCircle className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-midnight">Frequently Asked Questions</h3>
              <p className="text-xs text-muted">Quick answers to common questions</p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-parchment/40 border border-gold/15">
              <p className="font-semibold text-midnight">How long does an enquiry review take?</p>
              <p className="text-muted mt-1">Direct astrologer enquiries are typically reviewed within 24 hours. Platform enquiries are routed to our senior astrologer panel.</p>
            </div>

            <div className="p-3 rounded-xl bg-parchment/40 border border-gold/15">
              <p className="font-semibold text-midnight">Can I reschedule or cancel a booking?</p>
              <p className="text-muted mt-1">Yes, you can cancel any scheduled consultation from your Bookings tab at any time prior to session start.</p>
            </div>

            <div className="p-3 rounded-xl bg-parchment/40 border border-gold/15">
              <p className="font-semibold text-midnight">What if an astrologer becomes unavailable?</p>
              <p className="text-muted mt-1">If an astrologer is suspended or unavailable, your enquiry will be safely re-routed or refunded with immediate notification.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
