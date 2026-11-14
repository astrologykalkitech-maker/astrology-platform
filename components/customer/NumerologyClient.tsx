"use client";

import React, { useState, useTransition } from "react";
import {
  Hash,
  Calendar,
  User,
  Clock,
  MapPin,
  RefreshCw,
  Sparkles,
  Download,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  ChevronRight,
  Flame,
  Globe2,
} from "lucide-react";
import {
  LocationAutocomplete,
  type LocationSuggestion,
} from "@/components/common/LocationAutocomplete";
import {
  calculateAndSaveNumerologyAction,
  compareNameSpellingsAction,
} from "@/app/actions/numerology";
import type {
  ComprehensiveNumerologyReport,
  NameSpellingComparison,
} from "@/lib/astrology/numerology-engine";
import { generateNumerologyPdf } from "@/lib/pdf/numerology-pdf";

interface NumerologyClientProps {
  initialReport: ComprehensiveNumerologyReport;
  userDefaultName: string;
  userDefaultDob: string;
}

export function NumerologyClient({
  initialReport,
  userDefaultName,
  userDefaultDob,
}: NumerologyClientProps) {
  // Form input state
  const [fullName, setFullName] = useState(initialReport.input.fullName || userDefaultName);
  const [birthDate, setBirthDate] = useState(initialReport.input.dateOfBirth || userDefaultDob);
  const [birthTime, setBirthTime] = useState(initialReport.input.birthTime || "");
  const [birthPlace, setBirthPlace] = useState(initialReport.input.birthPlace || "");
  const [latitude, setLatitude] = useState<number | null>(initialReport.input.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(initialReport.input.longitude ?? null);
  const [timezone, setTimezone] = useState<number>(initialReport.input.timezone ?? 5.5);

  // Active Report state
  const [report, setReport] = useState<ComprehensiveNumerologyReport>(initialReport);
  const [isOutdated, setIsOutdated] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Alternative Name Spellings Explorer state
  const [altSpellings, setAltSpellings] = useState<string[]>([""]);
  const [comparisons, setComparisons] = useState<NameSpellingComparison[]>([]);
  const [comparing, setComparing] = useState(false);

  // Mark results as outdated on input change
  const handleInputChange = (field: "name" | "dob" | "time" | "place", value: any) => {
    setIsOutdated(true);
    setErrorMessage(null);
    if (field === "name") setFullName(value);
    if (field === "dob") setBirthDate(value);
    if (field === "time") setBirthTime(value);
    if (field === "place") setBirthPlace(value);
  };

  const handleLocationSelect = (suggestion: LocationSuggestion) => {
    setIsOutdated(true);
    setBirthPlace(suggestion.formatted || suggestion.name);
    if (suggestion.latitude && suggestion.longitude) {
      setLatitude(suggestion.latitude);
      setLongitude(suggestion.longitude);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !birthDate) return;

    setErrorMessage(null);
    startTransition(async () => {
      const res = await calculateAndSaveNumerologyAction({
        fullName: fullName.trim(),
        dateOfBirth: birthDate,
        birthTime: birthTime.trim() || null,
        birthPlace: birthPlace.trim() || null,
        latitude,
        longitude,
        timezone,
        saveToProfile: true,
      });

      if (res.success && res.report) {
        setReport(res.report);
        setIsOutdated(false);
      } else {
        setErrorMessage(res.error || "Failed to calculate cosmic vibrations.");
      }
    });
  };

  const handleCompareSpellings = async () => {
    const list = [fullName, ...altSpellings].filter((s) => s.trim().length > 0);
    if (list.length === 0) return;

    setComparing(true);
    try {
      const res = await compareNameSpellingsAction({
        names: list,
        moolank: report.moolank.number,
        bhagyank: report.bhagyank.number,
      });
      if (res.success) {
        setComparisons(res.comparisons);
      }
    } finally {
      setComparing(false);
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gold-deep">
            <Hash className="h-3.5 w-3.5" /> Authentic Vedic & Chaldean Numerology
          </span>
          <h1 className="mt-2 font-display text-3xl font-bold text-midnight sm:text-4xl">
            Cosmic Number Vibrations
          </h1>
          <p className="mt-1 text-sm text-muted">
            Accurate, calculation-driven mathematical synthesis of Moolank (Birth Number), Bhagyank (Destiny), and Namank (Chaldean Name Frequency).
          </p>
        </div>

        <button
          type="button"
          onClick={() => generateNumerologyPdf(report)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-midnight text-ivory px-4 py-2.5 text-xs font-bold hover:bg-midnight/90 shadow transition cursor-pointer"
        >
          <Download className="h-4 w-4 text-gold" /> Download Official PDF Report
        </button>
      </div>

      {/* Outdated State Notice */}
      {isOutdated && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 text-xs text-amber-900 transition-all animate-pulse">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>
              Your personal details have changed. Click <strong>"Calculate Vibrations"</strong> below to refresh your calculations.
            </span>
          </div>
          <button
            onClick={handleSubmit}
            className="rounded-lg bg-amber-600 px-3 py-1 font-bold text-white hover:bg-amber-700 cursor-pointer shadow-xs"
          >
            Recalculate
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-800">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Input Form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-gold/25 bg-white p-6 shadow-[0_14px_30px_-22px_rgba(60,35,90,0.25)] space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Full Name */}
          <div>
            <label className="block text-xs font-semibold text-midnight mb-1">
              Full Legal / Known Name *
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gold-deep" />
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => handleInputChange("name", e.target.value)}
                className="w-full rounded-xl border border-gold/30 bg-white py-2 pl-9 pr-3 text-xs text-midnight placeholder:text-muted focus:border-gold-deep focus:outline-none"
                placeholder="e.g. Aditya Agarwal"
              />
            </div>
          </div>

          {/* Date of Birth */}
          <div>
            <label className="block text-xs font-semibold text-midnight mb-1">
              Date of Birth *
            </label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gold-deep" />
              <input
                type="date"
                required
                max={new Date().toISOString().split("T")[0]}
                value={birthDate}
                onChange={(e) => handleInputChange("dob", e.target.value)}
                className="w-full rounded-xl border border-gold/30 bg-white py-2 pl-9 pr-3 text-xs text-midnight focus:border-gold-deep focus:outline-none"
              />
            </div>
          </div>

          {/* Time of Birth */}
          <div>
            <label className="block text-xs font-semibold text-midnight mb-1">
              Time of Birth (Optional for Vedic)
            </label>
            <div className="relative">
              <Clock className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gold-deep" />
              <input
                type="time"
                value={birthTime}
                onChange={(e) => handleInputChange("time", e.target.value)}
                className="w-full rounded-xl border border-gold/30 bg-white py-2 pl-9 pr-3 text-xs text-midnight focus:border-gold-deep focus:outline-none"
              />
            </div>
          </div>

          {/* Place of Birth */}
          <div>
            <label className="block text-xs font-semibold text-midnight mb-1">
              Birthplace (City, Town)
            </label>
            <LocationAutocomplete
              value={birthPlace}
              onChange={(val: string) => handleInputChange("place", val)}
              onSelectSuggestion={handleLocationSelect}
              placeholder="Search birth city..."
              className="text-xs"
              inputClassName="py-2 pl-9 text-xs"
            />
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between flex-wrap gap-3">
          <p className="text-[11px] text-muted flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-gold-deep" />
            Birth Time & Place activate supplementary Vedic Lagna, Moon Sign & Nakshatra alignments.
          </p>

          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-6 py-2.5 text-xs font-bold text-midnight shadow hover:opacity-95 disabled:opacity-50 cursor-pointer"
          >
            {isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 fill-midnight" />
            )}
            Calculate Cosmic Vibrations
          </button>
        </div>
      </form>

      {/* Core Numbers Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Moolank Card */}
        <div className="rounded-2xl border border-gold/25 bg-white p-6 text-midnight shadow-[0_14px_30px_-22px_rgba(60,35,90,0.25)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gold-deep">
                Moolank (Birth Number)
              </span>
              <span className="text-[10px] bg-gold/15 text-gold-dark font-bold px-2 py-0.5 rounded-md">
                Compound: {report.moolank.compoundNumber}
              </span>
            </div>

            <div className="my-4 flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-gold/40 bg-gold/15 text-3xl font-extrabold text-gold-dark">
                {report.moolank.number}
              </div>
              <div>
                <p className="text-sm font-bold text-midnight">Ruler: {report.moolank.rulingPlanet}</p>
                <p className="text-[11px] text-muted">{report.moolank.deity}</p>
              </div>
            </div>

            <div className="rounded-lg bg-parchment/60 p-2.5 text-[11px] font-mono text-muted border border-gold/15 mb-3">
              {report.moolank.calculation}
            </div>

            <p className="text-xs text-midnight/80 leading-relaxed">
              {report.moolank.interpretation}
            </p>
          </div>
        </div>

        {/* Bhagyank Card */}
        <div className="rounded-2xl border border-gold/25 bg-white p-6 text-midnight shadow-[0_14px_30px_-22px_rgba(60,35,90,0.25)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                Bhagyank (Destiny Number)
              </span>
              <span className="text-[10px] bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 rounded-md">
                Compound: {report.bhagyank.compoundNumber}
              </span>
            </div>

            <div className="my-4 flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/40 bg-emerald-50 text-3xl font-extrabold text-emerald-700">
                {report.bhagyank.number}
              </div>
              <div>
                <p className="text-sm font-bold text-midnight">Ruler: {report.bhagyank.rulingPlanet}</p>
                <p className="text-[11px] text-muted">Cosmic Life Path</p>
              </div>
            </div>

            <div className="rounded-lg bg-emerald-50/60 p-2.5 text-[11px] font-mono text-muted border border-emerald-500/20 mb-3">
              {report.bhagyank.calculation}
            </div>

            <p className="text-xs text-midnight/80 leading-relaxed">
              {report.bhagyank.interpretation}
            </p>
          </div>
        </div>

        {/* Namank Card */}
        <div className="rounded-2xl border border-gold/25 bg-white p-6 text-midnight shadow-[0_14px_30px_-22px_rgba(60,35,90,0.25)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                Namank (Chaldean Name)
              </span>
              <span className="text-[10px] bg-indigo-50 text-indigo-800 font-bold px-2 py-0.5 rounded-md">
                Compound: {report.namankChaldean.compoundNumber}
              </span>
            </div>

            <div className="my-4 flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-indigo-500/40 bg-indigo-50 text-3xl font-extrabold text-indigo-700">
                {report.namankChaldean.number}
              </div>
              <div>
                <p className="text-sm font-bold text-midnight">Pythagorean: {report.namankPythagorean.number}</p>
                <p className="text-[11px] text-muted">Social Magnetism</p>
              </div>
            </div>

            <div className="rounded-lg bg-indigo-50/60 p-2.5 text-[11px] font-mono text-muted border border-indigo-500/20 mb-3">
              {report.namankChaldean.calculation}
            </div>

            <p className="text-xs text-midnight/80 leading-relaxed">
              {report.namankChaldean.interpretation}
            </p>
          </div>
        </div>
      </div>

      {/* Harmonic Affinities & Synthesis */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Harmonic Affinities */}
        <div className="rounded-2xl border border-gold/25 bg-white p-6 text-midnight shadow-[0_14px_30px_-22px_rgba(60,35,90,0.25)] space-y-4">
          <h3 className="font-display text-lg font-bold text-midnight border-b border-gold/15 pb-3">
            Harmonic Affinities & Remedial Alignments
          </h3>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-gold/10">
              <span className="text-muted">Friendly Resonant Numbers:</span>
              <span className="font-bold text-emerald-700">
                {report.harmonicAffinities.friendlyNumbers.join(", ")}
              </span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-gold/10">
              <span className="text-muted">Challenging / Neutral Numbers:</span>
              <span className="font-bold text-rose-700">
                {report.harmonicAffinities.challengingNumbers.join(", ")}
              </span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-gold/10">
              <span className="text-muted">Auspicious Weekdays:</span>
              <span className="font-bold text-midnight">
                {report.harmonicAffinities.luckyDays.join(", ")}
              </span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-gold/10">
              <span className="text-muted">Harmonic Aura Colors:</span>
              <span className="font-bold text-midnight">
                {report.harmonicAffinities.luckyColors.join(", ")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Sacred Consecrated Gemstone:</span>
              <span className="font-bold text-gold-deep">
                {report.harmonicAffinities.recommendedGem}
              </span>
            </div>
          </div>
        </div>

        {/* Synthesis */}
        <div className="rounded-2xl border border-gold/25 bg-white p-6 text-midnight shadow-[0_14px_30px_-22px_rgba(60,35,90,0.25)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-gold/15 pb-3">
              <h3 className="font-display text-lg font-bold text-midnight">
                Numerological Synthesis
              </h3>
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-gold/15 text-gold-deep border border-gold/30">
                {report.synthesis.harmonyLevel}
              </span>
            </div>

            <p className="mt-4 text-xs text-midnight/80 leading-relaxed">
              {report.synthesis.synthesis}
            </p>
            <p className="mt-3 text-xs text-midnight/70 leading-relaxed border-t border-gold/10 pt-3">
              {report.synthesis.advice}
            </p>
          </div>
        </div>
      </div>

      {/* Supplementary Vedic Natal Alignment (If Available) */}
      {report.vedicBirthChart?.availability === "available" && (
        <div className="rounded-2xl border border-gold/30 bg-gradient-to-r from-amber-500/5 via-white to-purple-500/5 p-6 shadow-sm">
          <div className="flex items-center gap-2 pb-3 border-b border-gold/15">
            <Flame className="h-4 w-4 text-amber-600" />
            <h3 className="font-display text-sm font-bold text-midnight">
              Supplementary Vedic Natal Integration
            </h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 text-xs">
            <div className="p-3 rounded-xl bg-white border border-gold/20">
              <span className="text-[10px] text-muted block">Lagna (Ascendant)</span>
              <span className="font-bold text-midnight">
                {report.vedicBirthChart.ascendantSign} ({report.vedicBirthChart.ascendantDegree})
              </span>
            </div>
            <div className="p-3 rounded-xl bg-white border border-gold/20">
              <span className="text-[10px] text-muted block">Chandra Rashi (Moon)</span>
              <span className="font-bold text-midnight">
                {report.vedicBirthChart.moonSign}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-white border border-gold/20">
              <span className="text-[10px] text-muted block">Janma Nakshatra</span>
              <span className="font-bold text-midnight">
                {report.vedicBirthChart.nakshatra} (Pada {report.vedicBirthChart.nakshatraPada})
              </span>
            </div>
            <div className="p-3 rounded-xl bg-white border border-gold/20">
              <span className="text-[10px] text-muted block">Current Mahadasha</span>
              <span className="font-bold text-midnight">
                {report.vedicBirthChart.currentMahadasha || "Active Period"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Alternative Name Spellings Explorer */}
      <div className="rounded-2xl border border-gold/25 bg-white p-6 shadow-[0_14px_30px_-22px_rgba(60,35,90,0.25)] space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-gold/15">
          <div>
            <h3 className="font-display text-base font-bold text-midnight">
              Explore Alternative Name Spellings
            </h3>
            <p className="text-xs text-muted">
              Compare letter vibrations and compatibility against your Moolank ({report.moolank.number}) and Bhagyank ({report.bhagyank.number}).
            </p>
          </div>
          <button
            type="button"
            onClick={handleCompareSpellings}
            disabled={comparing}
            className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-bold text-midnight hover:bg-gold/20 cursor-pointer disabled:opacity-50"
          >
            {comparing ? "Analyzing..." : "Compare Vibrations"}
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted w-32 shrink-0">Current Name:</span>
            <span className="font-bold text-xs text-midnight">{fullName}</span>
          </div>

          {altSpellings.map((spelling, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <span className="text-xs text-muted w-32 shrink-0">Alternative #{idx + 1}:</span>
              <input
                type="text"
                value={spelling}
                onChange={(e) => {
                  const copy = [...altSpellings];
                  copy[idx] = e.target.value;
                  setAltSpellings(copy);
                }}
                placeholder="e.g. Aadhitya Agarwal"
                className="max-w-md w-full rounded-xl border border-gold/30 bg-white py-1.5 px-3 text-xs text-midnight placeholder:text-muted focus:border-gold-deep focus:outline-none"
              />
            </div>
          ))}

          {altSpellings.length < 3 && (
            <button
              type="button"
              onClick={() => setAltSpellings([...altSpellings, ""])}
              className="text-xs text-gold-deep hover:underline cursor-pointer font-medium"
            >
              + Add another spelling variation
            </button>
          )}
        </div>

        {comparisons.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs border border-gold/20 rounded-xl overflow-hidden">
              <thead className="bg-parchment/60 font-bold text-midnight border-b border-gold/20">
                <tr>
                  <th className="p-2.5">Name Variant</th>
                  <th className="p-2.5">Chaldean (Compound ➔ Single)</th>
                  <th className="p-2.5">Pythagorean</th>
                  <th className="p-2.5">Root Harmony</th>
                  <th className="p-2.5">Destiny Harmony</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gold/10">
                {comparisons.map((c, i) => (
                  <tr key={i} className="hover:bg-gold/5">
                    <td className="p-2.5 font-bold text-midnight">{c.name}</td>
                    <td className="p-2.5">
                      <span className="font-bold text-gold-deep">{c.chaldeanSingle}</span> (Compound {c.chaldeanTotal})
                    </td>
                    <td className="p-2.5">
                      <span className="font-bold text-indigo-700">{c.pythagoreanSingle}</span> (Compound {c.pythagoreanTotal})
                    </td>
                    <td className="p-2.5">
                      <span
                        className={`font-semibold ${
                          c.compatibilityWithMoolank === "Harmonious"
                            ? "text-emerald-700"
                            : c.compatibilityWithMoolank === "Challenging"
                            ? "text-rose-700"
                            : "text-muted"
                        }`}
                      >
                        {c.compatibilityWithMoolank}
                      </span>
                    </td>
                    <td className="p-2.5">
                      <span
                        className={`font-semibold ${
                          c.compatibilityWithBhagyank === "Harmonious"
                            ? "text-emerald-700"
                            : c.compatibilityWithBhagyank === "Challenging"
                            ? "text-rose-700"
                            : "text-muted"
                        }`}
                      >
                        {c.compatibilityWithBhagyank}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
