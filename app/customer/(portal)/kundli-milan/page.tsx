import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Heart, ArrowRight } from "lucide-react";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import { calculateAshtakoota } from "@/lib/astrology/compatibility";
import type { KootaScore } from "@/lib/astrology/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kundli Matching & Ashtakoota Milan | JyotishSetu",
  description: "Classical 36-guna Vedic compatibility matching for marriage, harmony, and longevity.",
};

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white p-5 shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)]";

export default async function KundliMilanPage() {
  await requireCustomerPage();

  // Demonstration calculation using canonical Rohini & Ashwini nakshatras
  const sampleMilan = calculateAshtakoota(
    "Rohini",
    "Vrishabha",
    "Ashwini",
    "Mesha"
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-midnight">
          Kundli Matching (Ashtakoota 36-Guna Milan)
        </h1>
        <p className="text-xs sm:text-sm text-muted mt-1">
          Authentic Vedic compatibility analysis evaluating all 8 Kootas: Varna, Vashya, Tara, Yoni, Graha Maitri, Gana, Bhakoot, and Nadi.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={CARD + " md:col-span-1 text-center flex flex-col justify-center items-center py-8"}>
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full border-4 border-gold bg-parchment">
            <span className="font-display text-3xl font-extrabold text-midnight">
              {sampleMilan.totalScore}
            </span>
            <span className="text-[10px] font-bold text-muted absolute bottom-3">/ 36 Gunas</span>
          </div>

          <h3 className="mt-4 font-display text-lg font-bold text-midnight">
            {sampleMilan.category} Match ({sampleMilan.percentage}%)
          </h3>
          <p className="mt-1 text-xs text-muted max-w-xs">
            {sampleMilan.recommendation}
          </p>

          <Link
            href="/customer/astrologers"
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-midnight text-champagne text-xs font-semibold hover:bg-midnight/90 transition-colors"
          >
            Consult Marriage Astrologer <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className={CARD + " md:col-span-2"}>
          <h3 className="font-display text-base font-semibold text-midnight mb-3 flex items-center gap-2">
            <Heart className="h-4 w-4 text-gold-deep" />
            Ashtakoota Score Breakdown (8 Pillars)
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {Object.entries(sampleMilan.scores).map(([key, value]) => {
              const koota = value as KootaScore;
              return (
                <div
                  key={key}
                  className="p-3 rounded-xl border border-gold/20 bg-parchment/40 flex items-center justify-between"
                >
                  <div>
                    <p className="font-semibold text-midnight capitalize">{koota.name}</p>
                    <p className="text-[10px] text-muted">{koota.area}</p>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-midnight">
                      {koota.obtainedPoints} / {koota.maxPoints}
                    </span>
                    <p className="text-[10px] text-gold-deep font-semibold">
                      {koota.obtainedPoints === koota.maxPoints ? "Full Points" : "Partial"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
