import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireCustomerPage } from "@/lib/auth/customer-guard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vedic Horoscope & Planetary Transit | JyotishSetu",
  description: "Personalized Vedic horoscope predictions and planetary transit movements.",
};

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white p-5 shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)]";

const RASHIS = [
  { name: "Mesha (Aries)", ruler: "Mars", element: "Fire", icon: "♈" },
  { name: "Vrishabha (Taurus)", ruler: "Venus", element: "Earth", icon: "♉" },
  { name: "Mithuna (Gemini)", ruler: "Mercury", element: "Air", icon: "♊" },
  { name: "Karka (Cancer)", ruler: "Moon", element: "Water", icon: "♋" },
  { name: "Simha (Leo)", ruler: "Sun", element: "Fire", icon: "♌" },
  { name: "Kanya (Virgo)", ruler: "Mercury", element: "Earth", icon: "♍" },
  { name: "Tula (Libra)", ruler: "Venus", element: "Air", icon: "♎" },
  { name: "Vrishchika (Scorpio)", ruler: "Mars", element: "Water", icon: "♏" },
  { name: "Dhanu (Sagittarius)", ruler: "Jupiter", element: "Fire", icon: "♐" },
  { name: "Makara (Capricorn)", ruler: "Saturn", element: "Earth", icon: "♑" },
  { name: "Kumbha (Aquarius)", ruler: "Saturn", element: "Air", icon: "♒" },
  { name: "Meena (Pisces)", ruler: "Jupiter", element: "Water", icon: "♓" },
];

export default async function CustomerHoroscopePage() {
  await requireCustomerPage();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-midnight">
          Daily Vedic Horoscope & Transit Forecast
        </h1>
        <p className="text-xs sm:text-sm text-muted mt-1">
          Explore daily planetary movements, Gochara transits, and Vedic astrological insights across all 12 Rashis.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {RASHIS.map((rashi) => (
          <div key={rashi.name} className={CARD}>
            <div className="flex items-center justify-between">
              <span className="text-2xl">{rashi.icon}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-parchment text-gold-deep border border-gold/30">
                {rashi.element}
              </span>
            </div>

            <h3 className="mt-3 font-display text-base font-bold text-midnight">{rashi.name}</h3>
            <p className="text-xs text-muted">Ruler: {rashi.ruler}</p>

            <div className="mt-3 pt-3 border-t border-gold/15">
              <Link
                href={`/customer/astrologers?service=career`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-gold-deep hover:underline"
              >
                Consult Astrologer <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

