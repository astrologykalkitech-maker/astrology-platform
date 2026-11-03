"use client";

import React, { useState } from "react";
import {
  Heart,
  Sparkles,
  Printer,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";
import { NorthIndianChart } from "@/components/kundli/NorthIndianChart";
import { SouthIndianChart } from "@/components/kundli/SouthIndianChart";
import type { SavedKundliMilanRecord } from "@/lib/types/database.types";
import type {
  KootaScore,
  AscendantInfo,
  PlanetaryPosition,
  PlanetName,
} from "@/lib/astrology/types";

interface KundliMilanResultViewProps {
  record: SavedKundliMilanRecord;
  onBack?: () => void;
}

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)]";

export function KundliMilanResultView({ record, onBack }: KundliMilanResultViewProps) {
  const [chartStyle, setChartStyle] = useState<"north" | "south">("north");

  const scores = record.ashtakoota_scores as Record<string, KootaScore>;
  const doshas = record.doshas as {
    nadiDosha?: boolean;
    bhakootDosha?: boolean;
    manglikPartnerA?: boolean;
    manglikPartnerB?: boolean;
    manglikReasonA?: string;
    manglikReasonB?: string;
    cancellations?: string[];
  };

  const chartA = record.partner_a_chart as {
    ascendant: AscendantInfo;
    planets: Record<PlanetName, PlanetaryPosition>;
    moonSign: string;
    birthNakshatra: string;
    birthPada: number;
  };

  const chartB = record.partner_b_chart as {
    ascendant: AscendantInfo;
    planets: Record<PlanetName, PlanetaryPosition>;
    moonSign: string;
    birthNakshatra: string;
    birthPada: number;
  };

  const fullReport = record.full_report as {
    recommendation?: string;
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gold/15 pb-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gold/30 bg-white text-gold-deep hover:bg-parchment transition-colors"
              title="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-midnight flex items-center gap-2">
              <Heart className="h-5 w-5 text-rose-500 fill-rose-500" />
              {record.partner_a_name} &amp; {record.partner_b_name}
            </h1>
            <p className="text-xs text-muted mt-0.5">
              36-Guna Vedic Ashtakoota Compatibility Matching
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-midnight text-champagne text-xs font-semibold hover:bg-midnight/90 shadow-sm"
          >
            <Printer className="h-3.5 w-3.5 text-gold" />
            <span>Print Report (PDF)</span>
          </button>
        </div>
      </div>

      {/* Primary Score Hero Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className={`${CARD} md:col-span-1 p-6 text-center flex flex-col justify-center items-center`}>
          <div className="relative flex h-28 w-28 items-center justify-center rounded-full border-4 border-gold bg-parchment shadow-inner">
            <span className="font-display text-3xl sm:text-4xl font-extrabold text-midnight">
              {record.total_score}
            </span>
            <span className="text-[10px] font-bold text-muted absolute bottom-3.5">/ 36 Gunas</span>
          </div>

          <h3 className="mt-4 font-display text-lg font-bold text-midnight">
            {record.category} Compatibility ({record.percentage}%)
          </h3>
          <p className="mt-1 text-xs text-muted max-w-xs leading-relaxed">
            {fullReport.recommendation ||
              "Authentic Vedic Guna Milan calculated from natal Moon constellations."}
          </p>

          <div className="mt-4 pt-3 border-t border-gold/15 w-full flex items-center justify-center gap-2">
            {record.is_compatible ? (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5" /> Auspicious Match
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5" /> Remedial Guidance Advised
              </span>
            )}
          </div>
        </div>

        {/* Both Partner Summary Comparison */}
        <div className={`${CARD} md:col-span-2 p-5 flex flex-col justify-between`}>
          <h3 className="font-display text-sm font-bold text-midnight border-b border-gold/15 pb-2 mb-3">
            Birth Profile &amp; Astrological Pillars
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {/* Partner A */}
            <div className="p-3.5 rounded-xl border border-gold/20 bg-parchment/40 space-y-2">
              <span className="text-[10px] font-bold uppercase text-gold-deep">
                Partner A (Person 1)
              </span>
              <p className="font-bold text-sm text-midnight">{record.partner_a_name}</p>
              <div className="text-muted text-[11px] space-y-1">
                <p>DOB: {new Date(record.partner_a_dob).toLocaleDateString()} at {record.partner_a_tob}</p>
                <p className="truncate">Place: {record.partner_a_birth_place}</p>
                <p className="pt-1 font-semibold text-midnight">
                  Lagna: <span className="text-gold-deep">{chartA.ascendant.rashi}</span> • Moon:{" "}
                  <span className="text-gold-deep">{chartA.moonSign}</span>
                </p>
                <p>
                  Nakshatra: <span className="font-medium text-midnight">{chartA.birthNakshatra}</span> (P{chartA.birthPada})
                </p>
              </div>
            </div>

            {/* Partner B */}
            <div className="p-3.5 rounded-xl border border-gold/20 bg-parchment/40 space-y-2">
              <span className="text-[10px] font-bold uppercase text-gold-deep">
                Partner B (Person 2)
              </span>
              <p className="font-bold text-sm text-midnight">{record.partner_b_name}</p>
              <div className="text-muted text-[11px] space-y-1">
                <p>DOB: {new Date(record.partner_b_dob).toLocaleDateString()} at {record.partner_b_tob}</p>
                <p className="truncate">Place: {record.partner_b_birth_place}</p>
                <p className="pt-1 font-semibold text-midnight">
                  Lagna: <span className="text-gold-deep">{chartB.ascendant.rashi}</span> • Moon:{" "}
                  <span className="text-gold-deep">{chartB.moonSign}</span>
                </p>
                <p>
                  Nakshatra: <span className="font-medium text-midnight">{chartB.birthNakshatra}</span> (P{chartB.birthPada})
                </p>
              </div>
            </div>
          </div>

          {/* Dosha Analysis Bar */}
          <div className="mt-4 pt-3 border-t border-gold/15 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px]">
            <div className="p-2.5 rounded-lg border border-gold/15 bg-white flex items-center justify-between">
              <span>Nadi Dosha:</span>
              <span className={`font-bold ${doshas.nadiDosha ? "text-rose-600" : "text-emerald-700"}`}>
                {doshas.nadiDosha ? "Observed" : "None"}
              </span>
            </div>
            <div className="p-2.5 rounded-lg border border-gold/15 bg-white flex items-center justify-between">
              <span>Bhakoot Dosha:</span>
              <span className={`font-bold ${doshas.bhakootDosha ? "text-rose-600" : "text-emerald-700"}`}>
                {doshas.bhakootDosha ? "Observed" : "None"}
              </span>
            </div>
            <div className="p-2.5 rounded-lg border border-gold/15 bg-white flex items-center justify-between">
              <span>Manglik Status:</span>
              <span className="font-bold text-midnight">
                {doshas.manglikPartnerA || doshas.manglikPartnerB
                  ? `${doshas.manglikPartnerA ? "P1" : ""}${doshas.manglikPartnerA && doshas.manglikPartnerB ? " & " : ""}${doshas.manglikPartnerB ? "P2" : ""} Manglik`
                  : "Both Non-Manglik"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Ashtakoota 8 Pillars Breakdown */}
      <div className={`${CARD} p-5 space-y-4`}>
        <div className="border-b border-gold/15 pb-3">
          <h3 className="font-display text-base font-bold text-midnight flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-gold-deep" />
            Ashtakoota Breakdown (All 8 Traditional Pillars)
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Evaluates Varna, Vashya, Tara, Yoni, Graha Maitri, Gana, Bhakoot, and Nadi out of 36 maximum points.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(scores).map(([key, koota]) => {
            const isFull = koota.obtainedPoints === koota.maxPoints;
            const isZero = koota.obtainedPoints === 0;

            return (
              <div
                key={key}
                className="p-3.5 rounded-xl border border-gold/20 bg-parchment/30 flex flex-col justify-between space-y-2"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-display font-bold text-xs text-midnight capitalize">
                      {koota.name} Koota
                    </span>
                    <span
                      className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded ${
                        isFull
                          ? "bg-emerald-100 text-emerald-800"
                          : isZero
                          ? "bg-rose-100 text-rose-800"
                          : "bg-gold/15 text-gold-deep"
                      }`}
                    >
                      {koota.obtainedPoints} / {koota.maxPoints}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted block mt-0.5">{koota.area}</span>
                </div>

                <p className="text-[11px] text-midnight/80 leading-relaxed border-t border-gold/10 pt-2">
                  {koota.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Side-by-Side Birth Charts */}
      <div className={`${CARD} p-5 space-y-4`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gold/15 pb-3">
          <div>
            <h3 className="font-display text-base font-bold text-midnight">
              Kundli Chart Comparison (Side-by-Side)
            </h3>
            <p className="text-xs text-muted">
              Compare Lagna and planetary alignments for both partners simultaneously.
            </p>
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-parchment/60 rounded-xl border border-gold/20 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setChartStyle("north")}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                chartStyle === "north" ? "bg-midnight text-champagne" : "text-muted hover:text-midnight"
              }`}
            >
              North Indian
            </button>
            <button
              type="button"
              onClick={() => setChartStyle("south")}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                chartStyle === "south" ? "bg-midnight text-champagne" : "text-muted hover:text-midnight"
              }`}
            >
              South Indian
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart Partner A */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-midnight px-1">
              <span>{record.partner_a_name} (Partner A)</span>
              <span className="text-gold-deep font-mono">Lagna: {chartA.ascendant.rashi}</span>
            </div>
            {chartStyle === "north" ? (
              <NorthIndianChart ascendant={chartA.ascendant} planets={chartA.planets} />
            ) : (
              <SouthIndianChart ascendant={chartA.ascendant} planets={chartA.planets} />
            )}
          </div>

          {/* Chart Partner B */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-midnight px-1">
              <span>{record.partner_b_name} (Partner B)</span>
              <span className="text-gold-deep font-mono">Lagna: {chartB.ascendant.rashi}</span>
            </div>
            {chartStyle === "north" ? (
              <NorthIndianChart ascendant={chartB.ascendant} planets={chartB.planets} />
            ) : (
              <SouthIndianChart ascendant={chartB.ascendant} planets={chartB.planets} />
            )}
          </div>
        </div>
      </div>

      {/* Traditional Astrological Guidance Notice */}
      <div className="p-4 rounded-2xl bg-parchment/30 border border-gold/20 text-[11px] text-muted leading-relaxed">
        <strong className="text-midnight font-semibold">Traditional Compatibility Guidance: </strong>
        Ashtakoota 36-Guna Milan is a classical Vedic framework intended to highlight natural mental, physical, and psychological temperaments. Astrological compatibility serves as spiritual guidance and does not guarantee legal or personal relationship outcomes.
      </div>
    </div>
  );
}
