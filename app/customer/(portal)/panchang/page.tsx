import React from "react";
import type { Metadata } from "next";
import { Sun, Moon, Compass, Clock, Sparkles } from "lucide-react";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import { calculatePanchang } from "@/lib/astrology/panchang";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Daily Vedic Panchang | JyotishSetu Seeker Portal",
  description: "Real-time daily Vedic Panchang, Tithi, Nakshatra, Yoga, Karana, and Shubh Muhurat timings.",
};

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white p-5 shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)]";

export default async function CustomerPanchangPage() {
  await requireCustomerPage();

  const now = new Date();
  const panchang = calculatePanchang(now, {
    latitude: 28.6139,
    longitude: 77.2090,
    timezoneOffsetHours: 5.5,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-midnight">
          Daily Vedic Panchang & Shubh Muhurat
        </h1>
        <p className="text-xs sm:text-sm text-muted mt-1">
          The five sacred limbs of time computed according to traditional Surya Siddhanta and Lahiri Ayanamsa.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={CARD}>
          <div className="flex items-center gap-2 text-gold-deep">
            <Moon className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Tithi (Lunar Day)</span>
          </div>
          <p className="mt-2 font-display text-xl font-bold text-midnight">{panchang.tithi.name}</p>
          <span className="mt-1 inline-block text-[10px] font-semibold text-muted">
            {panchang.tithi.paksha} Paksha (#{panchang.tithi.number})
          </span>
        </div>

        <div className={CARD}>
          <div className="flex items-center gap-2 text-gold-deep">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Nakshatra</span>
          </div>
          <p className="mt-2 font-display text-xl font-bold text-midnight">{panchang.nakshatra.name}</p>
          <span className="mt-1 inline-block text-[10px] font-semibold text-muted">
            Ruler: {panchang.nakshatra.rulingPlanet} (#{panchang.nakshatra.number})
          </span>
        </div>

        <div className={CARD}>
          <div className="flex items-center gap-2 text-gold-deep">
            <Compass className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Yoga & Karana</span>
          </div>
          <p className="mt-2 font-display text-xl font-bold text-midnight">{panchang.yoga.name}</p>
          <span className="mt-1 inline-block text-[10px] font-semibold text-muted">
            Karana: {panchang.karana.name}
          </span>
        </div>

        <div className={CARD}>
          <div className="flex items-center gap-2 text-gold-deep">
            <Sun className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Vara (Day)</span>
          </div>
          <p className="mt-2 font-display text-xl font-bold text-midnight">{panchang.dayOfWeek}</p>
          <span className="mt-1 inline-block text-[10px] font-semibold text-muted">
            Sunrise: {panchang.sunrise} • Sunset: {panchang.sunset}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={CARD}>
          <h3 className="font-display text-base font-semibold text-midnight mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-emerald-600" />
            Auspicious Timings (Shubh Muhurat)
          </h3>
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
              <span className="font-semibold text-emerald-900">Abhijit Muhurat</span>
              <span className="font-mono font-bold text-emerald-700">
                {panchang.abhijitMuhurat.start} - {panchang.abhijitMuhurat.end}
              </span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-parchment/60 border border-gold/30">
              <span className="font-semibold text-midnight">Brahma Muhurat</span>
              <span className="font-mono font-bold text-midnight">
                {panchang.brahmaMuhurat.start} - {panchang.brahmaMuhurat.end}
              </span>
            </div>
          </div>
        </div>

        <div className={CARD}>
          <h3 className="font-display text-base font-semibold text-midnight mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-rose-600" />
            Inauspicious Periods (Ashubh Timings)
          </h3>
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-rose-50/70 border border-rose-200">
              <span className="font-semibold text-rose-900">Rahu Kalam</span>
              <span className="font-mono font-bold text-rose-700">
                {panchang.rahukalam.start} - {panchang.rahukalam.end}
              </span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50/70 border border-amber-200">
              <span className="font-semibold text-amber-900">Yamaganda</span>
              <span className="font-mono font-bold text-amber-700">
                {panchang.yamaganda.start} - {panchang.yamaganda.end}
              </span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50/70 border border-amber-200">
              <span className="font-semibold text-amber-900">Gulika Kalam</span>
              <span className="font-mono font-bold text-amber-700">
                {panchang.gulikakalam.start} - {panchang.gulikakalam.end}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
