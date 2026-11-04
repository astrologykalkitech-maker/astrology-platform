"use client";

import React from "react";
import { Compass, Sparkles, Shield } from "lucide-react";
import type { FullAstrologyReport } from "@/lib/astrology/types";

interface AstrologyReportViewProps {
  report: FullAstrologyReport;
}

export function AstrologyReportView({ report }: AstrologyReportViewProps) {
  const { kundli, panchang, numerology, remedies } = report;

  return (
    <div className="w-full space-y-6">
      {/* 1. Panchang at Birth */}
      <div className="rounded-2xl border border-gold/25 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-gold/15 pb-3">
          <Compass className="h-5 w-5 text-gold-deep" />
          <div>
            <h3 className="font-display text-base font-bold text-midnight">
              Vedic Panchang at Time of Birth
            </h3>
            <p className="text-xs text-muted">
              The 5 cosmic limbs of time (Tithi, Vara, Nakshatra, Yoga, Karana) active during birth.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-parchment/50 border border-gold/15">
            <span className="text-[10px] text-muted uppercase font-semibold">Tithi</span>
            <p className="font-bold text-midnight mt-0.5">{panchang.tithi.name}</p>
            <span className="text-[10px] text-gold-deep">{panchang.tithi.paksha} Paksha</span>
          </div>

          <div className="p-3 rounded-xl bg-parchment/50 border border-gold/15">
            <span className="text-[10px] text-muted uppercase font-semibold">Vara (Day)</span>
            <p className="font-bold text-midnight mt-0.5">{panchang.dayOfWeek}</p>
            <span className="text-[10px] text-muted">Solar day</span>
          </div>

          <div className="p-3 rounded-xl bg-parchment/50 border border-gold/15">
            <span className="text-[10px] text-muted uppercase font-semibold">Nakshatra</span>
            <p className="font-bold text-midnight mt-0.5">{panchang.nakshatra.name}</p>
            <span className="text-[10px] text-gold-deep">Lord: {panchang.nakshatra.rulingPlanet}</span>
          </div>

          <div className="p-3 rounded-xl bg-parchment/50 border border-gold/15">
            <span className="text-[10px] text-muted uppercase font-semibold">Yoga</span>
            <p className="font-bold text-midnight mt-0.5">{panchang.yoga.name}</p>
            <span className="text-[10px] text-muted">Auspicious Angle</span>
          </div>

          <div className="p-3 rounded-xl bg-parchment/50 border border-gold/15">
            <span className="text-[10px] text-muted uppercase font-semibold">Karana</span>
            <p className="font-bold text-midnight mt-0.5">{panchang.karana.name}</p>
            <span className="text-[10px] text-muted">Half-Tithi</span>
          </div>
        </div>
      </div>

      {/* 2. Numerology Profile */}
      <div className="rounded-2xl border border-gold/25 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-gold/15 pb-3">
          <Sparkles className="h-5 w-5 text-gold-deep" />
          <div>
            <h3 className="font-display text-base font-bold text-midnight">
              Vedic & Chaldean Numerology Profile
            </h3>
            <p className="text-xs text-muted">
              Numerical vibrations governing life path, natural talents, and fortune.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-gold/20 bg-parchment/40 text-center">
            <span className="text-xs text-muted uppercase font-semibold">Moolank (Birth Number)</span>
            <p className="font-display text-3xl font-extrabold text-gold-deep mt-1">{numerology.birthNumber}</p>
            <p className="text-xs text-muted mt-1">Reflects your core nature, instincts, and outer persona.</p>
          </div>

          <div className="p-4 rounded-xl border border-gold/20 bg-parchment/40 text-center">
            <span className="text-xs text-muted uppercase font-semibold">Bhagyank (Destiny Number)</span>
            <p className="font-display text-3xl font-extrabold text-midnight mt-1">{numerology.lifePathNumber}</p>
            <p className="text-xs text-muted mt-1">Reflects your karmic destiny and life purpose.</p>
          </div>

          <div className="p-4 rounded-xl border border-gold/20 bg-parchment/40 text-center">
            <span className="text-xs text-muted uppercase font-semibold">Namank (Name Number)</span>
            <p className="font-display text-3xl font-extrabold text-gold-deep mt-1">{numerology.nameNumber}</p>
            <p className="text-xs text-muted mt-1">Chaldean vibration of your recorded full name.</p>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-gold/5 border border-gold/20 text-xs text-midnight">
          <p className="leading-relaxed">{numerology.summary}</p>
          <div className="mt-3 flex flex-wrap gap-4 text-[11px]">
            <span><strong className="text-gold-deep">Lucky Numbers:</strong> {numerology.luckyNumbers.join(", ")}</span>
            <span><strong className="text-gold-deep">Lucky Gemstone:</strong> {numerology.luckyGemstone}</span>
            <span><strong className="text-gold-deep">Lucky Colors:</strong> {numerology.luckyColors.join(", ")}</span>
          </div>
        </div>
      </div>

      {/* 3. Vedic Remedies & Gemstone Recommendations */}
      <div className="rounded-2xl border border-gold/25 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-gold/15 pb-3">
          <Shield className="h-5 w-5 text-gold-deep" />
          <div>
            <h3 className="font-display text-base font-bold text-midnight">
              Prescribed Vedic Remedies & Spiritual Protection
            </h3>
            <p className="text-xs text-muted">
              Harmonizing planetary energies for {kundli.ascendant.rashi} Ascendant according to Parashari principles.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl border border-gold/20 bg-parchment/40 space-y-2">
            <h4 className="font-semibold text-midnight flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-gold" />
              Primary Life Gemstone (Bhagya Ratna)
            </h4>
            <p className="text-base font-bold font-display text-gold-deep">
              {remedies.gemstones.primaryLife.name}
            </p>
            <p className="text-muted text-[11px]">
              Ruling Graha: <span className="font-medium text-midnight">{remedies.gemstones.primaryLife.planet}</span> • Wear on{" "}
              <span className="font-medium text-midnight">{remedies.gemstones.primaryLife.finger}</span> in{" "}
              <span className="font-medium text-midnight">{remedies.gemstones.primaryLife.metal}</span>.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-gold/20 bg-parchment/40 space-y-2">
            <h4 className="font-semibold text-midnight flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-gold" />
              Auspicious Rudraksha
            </h4>
            <p className="text-base font-bold font-display text-gold-deep">
              {remedies.rudraksha.mukhi}-Mukhi Rudraksha
            </p>
            <p className="text-muted text-[11px] leading-relaxed">
              {remedies.rudraksha.benefits}
            </p>
          </div>

          <div className="p-4 rounded-xl border border-gold/20 bg-parchment/40 space-y-1.5">
            <h4 className="font-semibold text-midnight">Sattvic Mantra Japa</h4>
            <p className="font-mono text-xs font-bold text-midnight p-2 bg-white rounded border border-gold/15">
              {remedies.mantra.text}
            </p>
            <p className="text-[11px] text-muted">
              Presiding Deity: {remedies.mantra.deity} • Recite {remedies.mantra.japaCount} times at dawn.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-gold/20 bg-parchment/40 space-y-1.5">
            <h4 className="font-semibold text-midnight">Daan / Sacred Charity</h4>
            <p className="font-medium text-midnight">
              Item to donate: <span className="font-bold text-gold-deep">{remedies.charity.item}</span>
            </p>
            <p className="text-[11px] text-muted">
              Recommended Day: {remedies.charity.day} to pacify challenging transits.
            </p>
          </div>
        </div>
      </div>

      {/* 4. Astrological Notice */}
      <div className="p-4 rounded-2xl bg-parchment/30 border border-gold/20 text-[11px] text-muted leading-relaxed">
        <strong className="text-midnight font-semibold">Traditional Notice: </strong>
        Vedic astrology represents a classical symbolic and interpretive tradition aimed at spiritual contemplation, self-awareness, and psychological alignment. JyotishSetu calculations are based on high-precision sidereal Lahiri Ayanamsa and do not constitute legal, medical, or financial guarantees.
      </div>
    </div>
  );
}
