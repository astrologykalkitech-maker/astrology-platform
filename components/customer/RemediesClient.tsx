"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, Shield, Gem, Heart, Compass } from "lucide-react";
import type { SavedKundliRecord } from "@/lib/types/database.types";
import type { FullAstrologyReport } from "@/lib/astrology/types";

interface RemediesClientProps {
  kundlis: SavedKundliRecord[];
  initialReport: FullAstrologyReport | null;
}

export function RemediesClient({ kundlis, initialReport }: RemediesClientProps) {
  const [selectedKundliId] = useState<string>(
    kundlis[0]?.id || ""
  );

  if (kundlis.length === 0 || !initialReport) {
    return (
      <div className="rounded-2xl border border-gold/25 bg-white p-8 text-center text-midnight shadow-[0_14px_30px_-22px_rgba(60,35,90,0.25)]">
        <Shield className="mx-auto h-12 w-12 text-gold-deep mb-4" />
        <h2 className="font-display text-2xl font-bold text-midnight">
          No Kundli Found For Remedial Guidance
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Personalized Vedic Upayas (Gemstones, Rudraksha, Beej Mantras, and Charity) are formulated strictly based on your Janam Lagna and planetary strengths.
        </p>
        <Link
          href="/customer/kundli"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gold-deep px-5 py-2.5 font-semibold text-white shadow-sm transition hover:bg-gold-dark"
        >
          <Compass className="h-4 w-4" />
          Create or View Kundli First
        </Link>
      </div>
    );
  }

  const remedies = initialReport.remedies;
  const kundli = initialReport.kundli;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gold-deep">
            <Sparkles className="h-3.5 w-3.5" /> Authentic Vedic Upaya
          </span>
          <h1 className="mt-2 font-display text-3xl font-bold text-midnight sm:text-4xl">
            Vedic Remedies & Protection Rituals
          </h1>
          <p className="mt-1 text-sm text-muted">
            Prescribed for <strong className="text-midnight">{initialReport.subject.name}</strong> (Lagna: {kundli.ascendant.rashi}, Moon: {kundli.moonSign})
          </p>
        </div>
      </div>

      {/* Primary Remedial Cards Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* 1. Auspicious Gemstones */}
        <div className="rounded-2xl border border-gold/25 bg-white p-6 text-midnight shadow-[0_14px_30px_-22px_rgba(60,35,90,0.25)]">
          <div className="flex items-center gap-3 border-b border-gold/15 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold-deep">
              <Gem className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-midnight">Prescribed Gemstones (Ratna)</h3>
              <p className="text-xs text-muted">Energizes auspicious planetary vibrations</p>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-gold/20 bg-parchment/60 p-4">
              <span className="text-xs font-bold uppercase tracking-wider text-gold-deep">Primary Life Stone</span>
              <p className="text-lg font-bold text-midnight mt-0.5">{remedies.gemstones.primaryLife.name}</p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted">
                <div><span className="font-semibold text-midnight">Planet:</span> {remedies.gemstones.primaryLife.planet}</div>
                <div><span className="font-semibold text-midnight">Finger:</span> {remedies.gemstones.primaryLife.finger}</div>
                <div><span className="font-semibold text-midnight">Metal:</span> {remedies.gemstones.primaryLife.metal}</div>
              </div>
            </div>

            <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-4">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">Benefic Lucky Stone</span>
              <p className="text-lg font-bold text-midnight mt-0.5">{remedies.gemstones.benefic.name}</p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted">
                <div><span className="font-semibold text-midnight">Planet:</span> {remedies.gemstones.benefic.planet}</div>
                <div><span className="font-semibold text-midnight">Finger:</span> {remedies.gemstones.benefic.finger}</div>
                <div><span className="font-semibold text-midnight">Metal:</span> {remedies.gemstones.benefic.metal}</div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Sacred Rudraksha */}
        <div className="rounded-2xl border border-gold/25 bg-white p-6 text-midnight shadow-[0_14px_30px_-22px_rgba(60,35,90,0.25)]">
          <div className="flex items-center gap-3 border-b border-gold/15 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold-deep">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-midnight">Sacred Rudraksha</h3>
              <p className="text-xs text-muted">Bio-magnetic electromagnetic harmony</p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-gold/20 bg-parchment/60 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gold-deep">Recommended Bead</span>
              <span className="rounded-full bg-gold/20 px-2.5 py-0.5 text-xs font-semibold text-gold-deep">
                Planet: {remedies.rudraksha.planet}
              </span>
            </div>
            <p className="text-xl font-bold text-midnight mt-1">{remedies.rudraksha.mukhi} Mukhi Rudraksha</p>
            <p className="mt-2 text-sm text-midnight/80 leading-relaxed">{remedies.rudraksha.benefits}</p>
          </div>
        </div>

        {/* 3. Vedic Beej Mantra */}
        <div className="rounded-2xl border border-gold/25 bg-white p-6 text-midnight shadow-[0_14px_30px_-22px_rgba(60,35,90,0.25)]">
          <div className="flex items-center gap-3 border-b border-gold/15 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold-deep">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-midnight">Sacred Japa Mantra</h3>
              <p className="text-xs text-muted">Vibrational sound alignment</p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-gold/20 bg-parchment/60 p-4">
            <p className="text-xs text-muted">Prescribed Deity: <strong className="text-midnight">{remedies.mantra.deity}</strong></p>
            <blockquote className="mt-2 border-l-2 border-gold-deep pl-3 font-serif text-lg italic text-gold-dark font-semibold">
              &quot;{remedies.mantra.text}&quot;
            </blockquote>
            <p className="mt-3 text-xs text-muted">
              Recite daily with a Rudraksha Mala ({remedies.mantra.japaCount} chants) facing East during sunrise.
            </p>
          </div>
        </div>

        {/* 4. Vedic Charity (Daan) */}
        <div className="rounded-2xl border border-gold/25 bg-white p-6 text-midnight shadow-[0_14px_30px_-22px_rgba(60,35,90,0.25)]">
          <div className="flex items-center gap-3 border-b border-gold/15 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold-deep">
              <Heart className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-midnight">Karmic Charity (Daan)</h3>
              <p className="text-xs text-muted">Neutralizes afflicted past karmic impressions</p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-gold/20 bg-parchment/60 p-4">
            <span className="text-xs font-bold uppercase tracking-wider text-gold-deep">Recommended Offering</span>
            <p className="text-base font-bold text-midnight mt-1">{remedies.charity.item}</p>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted">
              <span className="rounded bg-gold/20 px-2 py-0.5 font-semibold text-gold-deep">Timing:</span>
              <span className="font-medium text-midnight">{remedies.charity.day}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
