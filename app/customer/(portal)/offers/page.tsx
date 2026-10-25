import React from "react";
import Link from "next/link";
import { ArrowLeft, Gift, Sparkles, Compass } from "lucide-react";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import { HeroArt } from "@/components/astrologer/art/HeroArt";
import { buttonStyles } from "@/components/astrologer/ui/Button";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";

export const dynamic = "force-dynamic";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

export default async function OffersPage() {
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
          <CardTitle>Platform Blessings & Special Offers</CardTitle>
          <p className="text-xs text-muted">
            Community announcements, seasonal muhurat discounts, and referral rewards.
          </p>
        </div>
      </div>

      <section className="relative isolate min-h-[170px] overflow-hidden rounded-2xl border border-gold/50 bg-midnight shadow-[0_22px_44px_-26px_rgba(21,16,39,0.95)]">
        <HeroArt priority />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-midnight/90 via-midnight/60 to-transparent"
        />
        <div className="relative z-10 max-w-lg px-6 py-6 sm:px-8">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-champagne/40 bg-midnight/80 px-2.5 py-0.5 text-[11px] font-semibold text-champagne">
            <Sparkles className="h-3 w-3" /> WELCOME BLESSING
          </span>
          <h2 className="mt-2 font-display text-xl font-semibold text-ivory sm:text-2xl">
            Introductory Guidance Consultations
          </h2>
          <p className="mt-1 text-xs text-ivory/85">
            Connect with verified Vedic astrologers with transparent introductory consultation fees.
          </p>
        </div>
      </section>

      <div className={`${CARD} p-6 sm:p-8 space-y-4`}>
        <div className="flex items-start gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <Gift className="h-5 w-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-midnight">
                Rewards Program & Referral Wallet
              </h3>
              <span className="rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800 uppercase tracking-wide">
                Coming Soon
              </span>
            </div>
            <p className="mt-1 text-xs text-muted leading-relaxed max-w-xl">
              This preview illustrates platform blessings planned for our next release. Referral tokens, seasonal Muhurat vouchers, and loyalty wallet balances cannot be credited or redeemed at this time. Standard consultations proceed directly through verified astrologer profiles.
            </p>
          </div>
        </div>

        <div className="pt-2 flex flex-wrap gap-3">
          <Link
            href="/customer/astrologers"
            className={buttonStyles({ variant: "gold", size: "sm" })}
          >
            <Compass className="h-4 w-4" /> Browse Verified Astrologers
          </Link>
          <Link
            href="/customer/enquiries/new"
            className={buttonStyles({ variant: "outline", size: "sm" })}
          >
            Submit an Enquiry
          </Link>
        </div>
      </div>
    </div>
  );
}