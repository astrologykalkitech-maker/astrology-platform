"use client";

import React, { useState, useTransition } from "react";
import {
  Sparkles,
  Calendar,
  Compass,
  TrendingUp,
  Heart,
  Briefcase,
  Coins,
  Activity,
  Users,
  GraduationCap,
  Bookmark,
  Trash2,
  Loader2,
  CheckCircle2,
  ShieldAlert,
  Clock,
} from "lucide-react";
import { ZODIAC_SIGNS } from "@/lib/astrology/transits";
import {
  type HoroscopeForecast,
  type HoroscopePeriod,
} from "@/lib/astrology/horoscope";
import {
  getHoroscopeAction,
  getPersonalizedHoroscopeAction,
  saveCustomerHoroscopeAction,
  deleteCustomerHoroscopeAction,
} from "@/app/actions/horoscope";
import type { SavedHoroscopeRecord, SavedKundliRecord } from "@/lib/types/database.types";

interface HoroscopeClientProps {
  initialForecast: HoroscopeForecast;
  customerKundlis: SavedKundliRecord[];
  initialHistory: SavedHoroscopeRecord[];
}

const PERIOD_LABELS: { id: HoroscopePeriod; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
];

const CARD_CLASS =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white p-5 shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)]";

export function HoroscopeClient({
  initialForecast,
  customerKundlis,
  initialHistory,
}: HoroscopeClientProps) {
  const [selectedSign, setSelectedSign] = useState<string>(initialForecast.zodiacSign);
  const [selectedPeriod, setSelectedPeriod] = useState<HoroscopePeriod>(initialForecast.predictionPeriod);
  const [forecast, setForecast] = useState<HoroscopeForecast>(initialForecast);
  const [selectedKundliId, setSelectedKundliId] = useState<string>(customerKundlis[0]?.id || "");
  const [savedHistory, setSavedHistory] = useState<SavedHoroscopeRecord[]>(initialHistory);
  const [isPending, startTransition] = useTransition();
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [aiSynthesized, setAiSynthesized] = useState<boolean>(false);

  // Active Zodiac Sign metadata
  const currentSignMeta =
    ZODIAC_SIGNS.find((s) => s.id === selectedSign) || ZODIAC_SIGNS[0];

  const fetchForecast = (signId: string, period: HoroscopePeriod, ai: boolean = false) => {
    setErrorMsg(null);
    setAiSynthesized(false);
    startTransition(async () => {
      const res = await getHoroscopeAction({
        signId,
        period,
        useAiEnrichment: ai,
      });
      if (res.success && res.data) {
        setForecast(res.data);
      } else {
        setErrorMsg(res.error || "Failed to load horoscope prediction.");
      }
    });
  };

  const handleSignChange = (signId: string) => {
    setSelectedSign(signId);
    fetchForecast(signId, selectedPeriod);
  };

  const handlePeriodChange = (period: HoroscopePeriod) => {
    setSelectedPeriod(period);
    fetchForecast(selectedSign, period);
  };

  // AI-Powered Synthesis
  const handleAiSynthesize = async () => {
    setIsAiLoading(true);
    setErrorMsg(null);
    try {
      const res = forecast.isPersonalized && selectedKundliId
        ? await getPersonalizedHoroscopeAction({
            kundliId: selectedKundliId,
            period: selectedPeriod,
            useAiEnrichment: true,
          })
        : await getHoroscopeAction({
            signId: selectedSign,
            period: selectedPeriod,
            useAiEnrichment: true,
          });

      if (res.success && res.data) {
        setForecast(res.data);
        setAiSynthesized(true);
      } else {
        setErrorMsg(res.error || "AI synthesis failed. Showing verified calculation.");
      }
    } finally {
      setIsAiLoading(false);
    }
  };

  // Personalized Horoscope using Customer's Janam Kundli
  const handlePersonalizedGenerate = () => {
    if (!selectedKundliId) return;
    setErrorMsg(null);
    setAiSynthesized(false);
    startTransition(async () => {
      const res = await getPersonalizedHoroscopeAction({
        kundliId: selectedKundliId,
        period: selectedPeriod,
      });
      if (res.success && res.data) {
        setForecast(res.data);
      } else {
        setErrorMsg(res.error || "Could not generate personalized horoscope.");
      }
    });
  };

  // Save Horoscope to History
  const handleSaveHoroscope = async () => {
    setSaveStatus("Saving...");
    const res = await saveCustomerHoroscopeAction(forecast, forecast.isPersonalized ? selectedKundliId : undefined);
    if (res.success && res.data) {
      setSavedHistory((prev) => [res.data as SavedHoroscopeRecord, ...prev]);
      setSaveStatus("Saved to Profile!");
      setTimeout(() => setSaveStatus(null), 3000);
    } else {
      setSaveStatus("Save failed");
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  // Delete saved horoscope
  const handleDeleteHistory = async (id: string) => {
    const res = await deleteCustomerHoroscopeAction(id);
    if (res.success) {
      setSavedHistory((prev) => prev.filter((item) => item.id !== id));
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="rounded-2xl border border-gold/30 bg-gradient-to-br from-parchment/80 via-white to-parchment/40 p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-gold/15 text-gold-deep border border-gold/30">
                <Sparkles className="h-3 w-3" />
                Vedic Gochara & Transit Forecaster
              </span>
              <span className="text-xs text-muted">
                Ayanamsa: {forecast.transits.ayanamsaName} ({forecast.transits.ayanamsa}°)
              </span>
            </div>
            <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-midnight tracking-tight">
              Vedic Horoscope & Planetary Transit Forecast
            </h1>
            <p className="text-xs sm:text-sm text-muted mt-0.5">
              Accurate predictions synthesized from real-time planetary positions across all 12 Rashis.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              onClick={handleSaveHoroscope}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-gold/40 bg-white hover:bg-gold/10 text-midnight transition-colors"
            >
              <Bookmark className="h-3.5 w-3.5 text-gold-deep" />
              {saveStatus || "Save Forecast"}
            </button>
            <button
              onClick={handleAiSynthesize}
              disabled={isAiLoading}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl text-white shadow-sm transition-all disabled:opacity-50 ${
                aiSynthesized
                  ? "bg-gradient-to-r from-emerald-600 to-teal-700 ring-2 ring-emerald-400"
                  : "bg-gradient-to-r from-gold-deep to-amber-700 hover:brightness-110"
              }`}
            >
              {isAiLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : aiSynthesized ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-white" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {isAiLoading ? "Synthesizing..." : aiSynthesized ? "AI Synthesized" : "AI Deep Synthesis"}
            </button>
          </div>
        </div>

        {/* Period Selector Tabs */}
        <div className="mt-5 flex flex-wrap items-center gap-2 pt-4 border-t border-gold/20">
          <span className="text-xs font-semibold text-midnight mr-1 flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-gold-deep" /> Period:
          </span>
          {PERIOD_LABELS.map((p) => (
            <button
              key={p.id}
              onClick={() => handlePeriodChange(p.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                selectedPeriod === p.id
                  ? "bg-midnight text-white shadow-sm"
                  : "bg-white text-muted hover:text-midnight border border-gold/25"
              }`}
            >
              {p.label}
            </button>
          ))}
          <span className="ml-auto text-[11px] font-mono font-medium text-muted">
            {forecast.periodStart} {forecast.periodStart !== forecast.periodEnd ? `to ${forecast.periodEnd}` : ""}
          </span>
        </div>
      </div>

      {/* 2. Twelve Zodiac Signs Grid Carousel / Selector */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1">
            <Compass className="h-3.5 w-3.5 text-gold-deep" /> Select Zodiac Rashi (12 Rashis)
          </h2>
          <span className="text-[11px] text-gold-deep font-semibold">
            Active: {currentSignMeta.englishName} ({currentSignMeta.sanskritName})
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
          {ZODIAC_SIGNS.map((s) => {
            const isSelected = s.id === selectedSign;
            return (
              <button
                key={s.id}
                onClick={() => handleSignChange(s.id)}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all ${
                  isSelected
                    ? "border-gold-deep bg-gold/15 shadow-sm ring-1 ring-gold"
                    : "border-gold/20 bg-white hover:border-gold/50 hover:bg-gold/5"
                }`}
              >
                <span className="text-xl">{s.symbol}</span>
                <div className="min-w-0">
                  <p className="font-display text-xs font-bold text-midnight truncate">{s.englishName}</p>
                  <p className="text-[10px] text-muted truncate">{s.sanskritName}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading state indicator */}
      {isPending && (
        <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-gold/10 border border-gold/30 text-xs font-semibold text-gold-deep animate-pulse">
          <Loader2 className="h-4 w-4 animate-spin" />
          Calculating Gochara transits and synthesizing forecast for {currentSignMeta.englishName}...
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-800 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 3. Personalized Customer Kundli Integration Banner */}
      {customerKundlis.length > 0 && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <span className="text-2xl shrink-0">🕉️</span>
              <div>
                <h3 className="font-display text-sm font-bold text-indigo-950">
                  Personalize with your Janam Kundli
                </h3>
                <p className="text-xs text-indigo-800">
                  Synthesize current Gochar transits directly against your natal Moon sign and Vimshottari Dasha.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
              <select
                value={selectedKundliId}
                onChange={(e) => setSelectedKundliId(e.target.value)}
                className="max-w-full sm:max-w-xs md:max-w-md text-xs font-semibold px-3 py-2 rounded-xl border border-indigo-200 bg-white text-indigo-950 truncate focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                {customerKundlis.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name} ({k.birth_place})
                  </option>
                ))}
              </select>
              <button
                onClick={handlePersonalizedGenerate}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors whitespace-nowrap text-center shrink-0"
              >
                Personalize
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Active Horoscope Prediction Showcase */}
      <div className={CARD_CLASS}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-4 border-b border-gold/20">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{currentSignMeta.symbol}</span>
              <div>
                <h2 className="font-display text-xl font-bold text-midnight">{forecast.title}</h2>
                <p className="text-xs text-muted">
                  Ruler: <strong className="text-midnight">{currentSignMeta.rulingPlanet}</strong> • Element:{" "}
                  <strong className="text-midnight">{currentSignMeta.element}</strong> • Modality:{" "}
                  <strong className="text-midnight">{currentSignMeta.modality}</strong>
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {aiSynthesized && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
                <Sparkles className="h-3 w-3 text-emerald-600" />
                AI Enriched
              </span>
            )}
            <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-gold/15 text-gold-deep border border-gold/30 font-semibold">
              {forecast.calculationMethodology}
            </span>
          </div>
        </div>

        {/* General Overview */}
        <div className="mt-4 p-4 rounded-xl bg-parchment/60 border border-gold/25">
          <h3 className="font-display text-sm font-bold text-midnight mb-1 flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-gold-deep" /> Comprehensive Overview
          </h3>
          <p className="text-xs sm:text-sm text-midnight leading-relaxed">{forecast.generalOverview}</p>
        </div>

        {/* 6 Core Life Dimensions Grid */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {/* Career */}
          <div className="p-3.5 rounded-xl border border-gold/20 bg-white">
            <div className="flex items-center gap-2 text-indigo-700 mb-2">
              <Briefcase className="h-4 w-4" />
              <h4 className="font-display text-xs font-bold uppercase tracking-wider">Career & Profession</h4>
            </div>
            <p className="text-xs text-muted leading-relaxed">{forecast.career}</p>
          </div>

          {/* Love & Relationships */}
          <div className="p-3.5 rounded-xl border border-gold/20 bg-white">
            <div className="flex items-center gap-2 text-rose-600 mb-2">
              <Heart className="h-4 w-4" />
              <h4 className="font-display text-xs font-bold uppercase tracking-wider">Love & Relationships</h4>
            </div>
            <p className="text-xs text-muted leading-relaxed">{forecast.love}</p>
          </div>

          {/* Finance & Wealth */}
          <div className="p-3.5 rounded-xl border border-gold/20 bg-white">
            <div className="flex items-center gap-2 text-emerald-700 mb-2">
              <Coins className="h-4 w-4" />
              <h4 className="font-display text-xs font-bold uppercase tracking-wider">Finance & Money</h4>
            </div>
            <p className="text-xs text-muted leading-relaxed">{forecast.finance}</p>
          </div>

          {/* Health & Vitality */}
          <div className="p-3.5 rounded-xl border border-gold/20 bg-white">
            <div className="flex items-center gap-2 text-amber-700 mb-2">
              <Activity className="h-4 w-4" />
              <h4 className="font-display text-xs font-bold uppercase tracking-wider">Health & Wellness</h4>
            </div>
            <p className="text-xs text-muted leading-relaxed">{forecast.health}</p>
          </div>

          {/* Family & Social */}
          <div className="p-3.5 rounded-xl border border-gold/20 bg-white">
            <div className="flex items-center gap-2 text-violet-700 mb-2">
              <Users className="h-4 w-4" />
              <h4 className="font-display text-xs font-bold uppercase tracking-wider">Family & Domestic Life</h4>
            </div>
            <p className="text-xs text-muted leading-relaxed">{forecast.family}</p>
          </div>

          {/* Education & Intellect */}
          <div className="p-3.5 rounded-xl border border-gold/20 bg-white">
            <div className="flex items-center gap-2 text-teal-700 mb-2">
              <GraduationCap className="h-4 w-4" />
              <h4 className="font-display text-xs font-bold uppercase tracking-wider">Education & Intellect</h4>
            </div>
            <p className="text-xs text-muted leading-relaxed">{forecast.education}</p>
          </div>
        </div>

        {/* Lucky Matrix Bar */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pt-4 border-t border-gold/15">
          <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200 text-center">
            <span className="text-[10px] font-semibold text-amber-800 uppercase tracking-wider">Lucky Number</span>
            <p className="font-display text-lg font-bold text-midnight mt-0.5">{forecast.luckyNumber}</p>
          </div>
          <div className="p-3 rounded-xl bg-rose-50/60 border border-rose-200 text-center">
            <span className="text-[10px] font-semibold text-rose-800 uppercase tracking-wider">Lucky Color</span>
            <p className="font-display text-xs font-bold text-midnight mt-1 truncate" title={forecast.luckyColor}>
              {forecast.luckyColor}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-200 text-center">
            <span className="text-[10px] font-semibold text-indigo-900 uppercase tracking-wider">Favorable Time</span>
            <p className="font-display text-xs font-bold text-midnight mt-1">{forecast.favourableTime}</p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200 text-center">
            <span className="text-[10px] font-semibold text-emerald-900 uppercase tracking-wider">Favorable Gem</span>
            <p className="font-display text-xs font-bold text-midnight mt-1 truncate" title={currentSignMeta.favorableGem}>
              {currentSignMeta.favorableGem}
            </p>
          </div>
        </div>

        {/* Period Breakdown (Day-by-Day or Quarter-by-Quarter) */}
        {forecast.breakdowns && forecast.breakdowns.length > 0 && (
          <div className="mt-5 pt-5 border-t border-gold/20">
            <h3 className="font-display text-sm font-bold text-midnight mb-3 flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-gold-deep" />
              Detailed {selectedPeriod === "weekly" ? "Day-by-Day" : selectedPeriod === "monthly" ? "Weekly" : "Quarterly"} Trajectory
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {forecast.breakdowns.map((b, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-parchment/40 border border-gold/20">
                  <h4 className="font-display text-xs font-bold text-gold-deep">{b.label}</h4>
                  <p className="mt-1 text-xs text-muted leading-relaxed">{b.summary}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actionable Vedic Recommendations */}
        <div className="mt-5 p-4 rounded-xl bg-emerald-50/50 border border-emerald-200">
          <h3 className="font-display text-sm font-bold text-emerald-950 mb-2 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-700" />
            Vedic Guidance & Upaya (Recommendations)
          </h3>
          <ul className="space-y-1.5 text-xs text-emerald-900">
            {forecast.recommendations.map((r, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-emerald-600 font-bold">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 5. Real-Time Planetary Transit (Gochar) Dashboard */}
      <div className={CARD_CLASS}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="font-display text-lg font-bold text-midnight flex items-center gap-2">
              <Compass className="h-5 w-5 text-gold-deep" />
              Planetary Transit Positions from {currentSignMeta.englishName} ({currentSignMeta.sanskritName})
            </h3>
            <p className="text-xs text-muted">
              Astronomical Nirayana longitudes and house activation relative to your selected sign.
            </p>
          </div>
          {forecast.transits.sadeSatiStatus?.isActive && (
            <span className="self-start sm:self-auto px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
              <ShieldAlert className="h-3.5 w-3.5 text-amber-700" />
              Sade Sati Active ({forecast.transits.sadeSatiStatus.phase})
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-gold/20 text-muted uppercase tracking-wider text-[11px]">
                <th className="pb-3 font-semibold">Planet</th>
                <th className="pb-3 font-semibold">Current Sign</th>
                <th className="pb-3 font-semibold">Degree</th>
                <th className="pb-3 font-semibold">Movement</th>
                <th className="pb-3 font-semibold">House from {currentSignMeta.sanskritName}</th>
                <th className="pb-3 font-semibold">Nature</th>
                <th className="pb-3 font-semibold">Classical Gochar Impact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gold/15">
              {Object.values(forecast.transits.planets).map((p) => (
                <tr key={p.planet} className="hover:bg-gold/5 transition-colors">
                  <td className="py-2.5 font-bold text-midnight">{p.planet}</td>
                  <td className="py-2.5 font-medium text-midnight">{p.currentSign}</td>
                  <td className="py-2.5 font-mono text-muted">{p.degree}°</td>
                  <td className="py-2.5">
                    {p.isRetrograde ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                        Retrograde (Vakri)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        Direct (Marga)
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 font-bold text-gold-deep">House {p.houseFromRef}</td>
                  <td className="py-2.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        p.effectType === "Favorable"
                          ? "bg-emerald-100 text-emerald-800"
                          : p.effectType === "Challenging"
                          ? "bg-rose-100 text-rose-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {p.effectType}
                    </span>
                  </td>
                  <td className="py-2.5 text-muted max-w-xs">{p.traditionalEffect}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Saved Horoscope History */}
      {savedHistory.length > 0 && (
        <div className={CARD_CLASS}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-base font-bold text-midnight flex items-center gap-2">
              <Bookmark className="h-4 w-4 text-gold-deep" /> Saved Horoscope Forecasts
            </h3>
            <span className="text-xs text-muted font-mono">{savedHistory.length} saved</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {savedHistory.map((item) => (
              <div key={item.id} className="p-3 rounded-xl border border-gold/20 bg-parchment/30 flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gold/15 text-gold-deep">
                    {item.period_type}
                  </span>
                  <h4 className="mt-1 font-display text-xs font-bold text-midnight capitalize">
                    {item.zodiac_sign} ({item.period_start})
                  </h4>
                  <p className="text-[11px] text-muted">
                    {item.is_personalized ? "Personalized Janam Kundli" : "General Gochar"}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteHistory(item.id)}
                  className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors"
                  title="Delete from history"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
