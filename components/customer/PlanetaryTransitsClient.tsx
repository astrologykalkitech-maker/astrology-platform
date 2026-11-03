"use client";

import { useState } from "react";
import { Calendar, Orbit, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";
import { calculateTransitSnapshot, ZODIAC_SIGNS, type TransitSnapshot } from "@/lib/astrology/transits";
import type { SavedKundliRecord } from "@/lib/types/database.types";
import type { RashiName } from "@/lib/astrology/types";

interface PlanetaryTransitsClientProps {
  initialSnapshot: TransitSnapshot;
  kundlis: SavedKundliRecord[];
  defaultRashi: RashiName;
}

export function PlanetaryTransitsClient({
  initialSnapshot,
  kundlis,
  defaultRashi,
}: PlanetaryTransitsClientProps) {
  const [referenceRashi, setReferenceRashi] = useState<RashiName>(defaultRashi);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [snapshot, setSnapshot] = useState<TransitSnapshot>(initialSnapshot);

  const handleUpdate = (rashi: RashiName, dateStr: string) => {
    setReferenceRashi(rashi);
    setSelectedDate(dateStr);
    const date = new Date(`${dateStr}T12:00:00Z`);
    const newSnapshot = calculateTransitSnapshot(date, rashi);
    setSnapshot(newSnapshot);
  };

  const planetsList = Object.values(snapshot.planets);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gold-deep">
            <Orbit className="h-3.5 w-3.5" /> Live Vedic Gochara Engine
          </span>
          <h1 className="mt-2 font-display text-3xl font-bold text-midnight sm:text-4xl">
            Planetary Transits & Gochara
          </h1>
          <p className="mt-1 text-sm text-muted">
            Astronomical positions of all 9 Grahas with house placements relative to your chosen Rashi.
          </p>
        </div>
      </div>

      {/* Control Filters */}
      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-gold/25 bg-white p-6 shadow-[0_14px_30px_-22px_rgba(60,35,90,0.25)] sm:grid-cols-2 lg:grid-cols-3">
        {/* Reference Rashi */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-midnight">
            Reference Sign (Moon / Lagna)
          </label>
          <select
            value={referenceRashi}
            onChange={(e) => handleUpdate(e.target.value as RashiName, selectedDate)}
            className="mt-1 w-full rounded-xl border border-gold/30 bg-white px-3 py-2 text-sm text-midnight focus:border-gold-deep focus:outline-none"
          >
            {ZODIAC_SIGNS.map((s) => (
              <option key={s.id} value={s.rashi} className="bg-white text-midnight">
                {s.englishName} ({s.sanskritName})
              </option>
            ))}
          </select>
        </div>

        {/* Date Selector */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-midnight">
            Transit Calculation Date
          </label>
          <div className="relative mt-1">
            <Calendar className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gold-deep" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => handleUpdate(referenceRashi, e.target.value)}
              className="w-full rounded-xl border border-gold/30 bg-white py-2 pl-9 pr-3 text-sm text-midnight focus:border-gold-deep focus:outline-none"
            />
          </div>
        </div>

        {/* Quick Kundli Sync */}
        {kundlis.length > 0 && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-midnight">
              Load from Saved Kundli
            </label>
            <select
              onChange={(e) => {
                const k = kundlis.find((item) => item.id === e.target.value);
                if (k && k.chart_data?.moonSign) {
                  handleUpdate(k.chart_data.moonSign as RashiName, selectedDate);
                }
              }}
              className="mt-1 w-full rounded-xl border border-gold/30 bg-white px-3 py-2 text-sm text-midnight focus:border-gold-deep focus:outline-none"
            >
              <option value="">Select profile...</option>
              {kundlis.map((k) => (
                <option key={k.id} value={k.id} className="bg-white text-midnight">
                  {k.name} ({String(k.chart_data?.moonSign || "Moon")})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Special Vedic Transit Conditions */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Sade Sati */}
        <div className={`rounded-2xl border p-5 shadow-sm ${
          snapshot.sadeSatiStatus?.isActive
            ? "border-amber-400 bg-amber-50 text-amber-900"
            : "border-emerald-300 bg-emerald-50 text-emerald-900"
        }`}>
          <div className="flex items-center gap-2">
            {snapshot.sadeSatiStatus?.isActive ? (
              <AlertCircle className="h-5 w-5 text-amber-600" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            )}
            <h4 className="font-bold text-sm">Shani Sade Sati</h4>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-midnight/80">
            {snapshot.sadeSatiStatus?.isActive
              ? `Active: ${snapshot.sadeSatiStatus.phase}. ${snapshot.sadeSatiStatus.description}`
              : "No active Sade Sati. Saturn is transiting non-sensitive Bhavas from reference sign."}
          </p>
        </div>

        {/* Ashtama / Kantaka Shani */}
        <div className={`rounded-2xl border p-5 shadow-sm ${
          snapshot.ashtamaShani || snapshot.kantakaShani
            ? "border-amber-400 bg-amber-50 text-amber-900"
            : "border-gold/25 bg-white text-midnight"
        }`}>
          <div className="flex items-center gap-2">
            <Orbit className="h-5 w-5 text-gold-deep" />
            <h4 className="font-bold text-sm text-midnight">Dhaiya (Minor Saturn)</h4>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {snapshot.ashtamaShani
              ? "Ashtama Shani Active (Saturn in 8th Bhava). Measured caution advised in contracts."
              : snapshot.kantakaShani
              ? "Kantaka Shani Active (Saturn in 4th/10th Bhava). Steady workspace focus needed."
              : "Free from Kantaka & Ashtama Shani transits."}
          </p>
        </div>

        {/* Guru Gochara */}
        <div className={`rounded-2xl border p-5 shadow-sm ${
          snapshot.guruGocharFavorable
            ? "border-gold/40 bg-gold/15 text-midnight"
            : "border-gold/25 bg-white text-midnight"
        }`}>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-gold-deep" />
            <h4 className="font-bold text-sm text-midnight">Guru Gochar (Jupiter)</h4>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {snapshot.guruGocharFavorable
              ? `Auspicious 5th/9th/11th/2nd/7th house alignment. Divine blessings and clarity.`
              : "Jupiter transiting neutral/restorative Bhava. Fosters introspection and study."}
          </p>
        </div>
      </div>

      {/* Planetary Transit Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {planetsList.map((p) => (
          <div
            key={p.planet}
            className="rounded-2xl border border-gold/25 bg-white p-5 text-midnight shadow-[0_14px_30px_-22px_rgba(60,35,90,0.25)]"
          >
            <div className="flex items-center justify-between border-b border-gold/15 pb-3">
              <div>
                <h3 className="font-display text-lg font-bold text-midnight">{p.planet}</h3>
                <span className="text-xs text-muted">{p.sanskritSign} ({p.currentSign})</span>
              </div>
              <div className="text-right">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                  p.effectType === "Favorable"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-300"
                    : p.effectType === "Challenging"
                    ? "bg-rose-50 text-rose-700 border border-rose-300"
                    : "bg-gold/15 text-gold-deep border border-gold/30"
                }`}>
                  House {p.houseFromRef} • {p.effectType}
                </span>
                {p.isRetrograde && (
                  <span className="ml-1.5 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                    RETROGRADE
                  </span>
                )}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted">
              <div><span className="font-semibold text-midnight">Degree:</span> {p.degree.toFixed(2)}°</div>
              <div><span className="font-semibold text-midnight">Speed:</span> {p.speed.toFixed(3)}°/day</div>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-midnight/80">
              {p.traditionalEffect}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
