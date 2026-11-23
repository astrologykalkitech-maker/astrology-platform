import React from "react";
import Link from "next/link";
import { ArrowLeft, Gift, Sparkles, Compass } from "lucide-react";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import { HeroArt } from "@/components/astrologer/art/HeroArt";
import { buttonStyles } from "@/components/astrologer/ui/Button";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { getCustomerReferralOverview } from "@/app/actions/customer-referrals";
import { CustomerReferralClient } from "@/components/customer/CustomerReferralClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Blessings & Referral Program | Karmic Ascension",
  description: "Share Vedic blessings with fellow seekers and earn promotional consultation credits.",
};

export default async function OffersPage() {
  await requireCustomerPage();
  const res = await getCustomerReferralOverview();
  const overview = res.success && res.data ? res.data : {
    referralCode: "KA000000",
    totalReferredCount: 0,
    totalRewardsEarnedPaise: 0,
    rewardPerReferralPaise: 5000,
    recentClaims: [],
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Link
          href="/customer/astrologers"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gold/30 bg-white text-gold-deep hover:bg-parchment transition-colors"
          aria-label="Back to astrologers"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <CardTitle>Platform Blessings & Referral Program</CardTitle>
          <p className="text-xs text-muted">
            Share Vedic guidance with friends and earn promotional wallet credits for consultations.
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
            <Sparkles className="h-3 w-3" /> WELCOME BLESSINGS
          </span>
          <h2 className="mt-2 font-display text-xl font-semibold text-ivory sm:text-2xl">
            Spiritual Guidance Rewards
          </h2>
          <p className="mt-1 text-xs text-ivory/85">
            Introduce new seekers to verified astrologers. Receive ₹50 promotional credit for every friend who joins.
          </p>
        </div>
      </section>

      <CustomerReferralClient
        referralCode={overview.referralCode}
        totalReferredCount={overview.totalReferredCount}
        totalRewardsEarnedPaise={overview.totalRewardsEarnedPaise}
        rewardPerReferralPaise={overview.rewardPerReferralPaise}
        recentClaims={overview.recentClaims}
      />
    </div>
  );
}
