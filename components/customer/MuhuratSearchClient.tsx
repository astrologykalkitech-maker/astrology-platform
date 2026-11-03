"use client";

import { useState } from "react";
import { Clock, Calendar, MapPin } from "lucide-react";
import { calculateDailyPanchangAction } from "@/app/actions/astrology";
import type { PanchangResult } from "@/lib/astrology/types";

const MUHURAT_CATEGORIES = [
  { id: "marriage", name: "Marriage (Vivah)", desc: "Auspicious wedding dates and Lagna timings" },
  { id: "griha_pravesh", name: "House Warming (Griha Pravesh)", desc: "Entering a new home during auspicious lunar tithis" },
  { id: "business", name: "Business Opening", desc: "Commercial office or retail shop inauguration" },
  { id: "vehicle", name: "Vehicle Purchase", desc: "Acquiring two-wheelers, cars, or heavy machinery" },
  { id: "general", name: "General Auspicious (Shubh Muhurat)", desc: "Abhijit and Amrit Kaal daily windows" },
];

export function MuhuratSearchClient() {
  const [category, setCategory] = useState("marriage");
  const [targetDate, setTargetDate] = useState(new Date().toISOString().split("T")[0]);
  const [city, setCity] = useState("New Delhi, India");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PanchangResult | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const res = await calculateDailyPanchangAction(targetDate, {
      latitude: 28.6139,
      longitude: 77.2090,
      timezoneOffsetHours: 5.5,
      cityName: city,
    });

    setLoading(false);
    if (res.success && res.data) {
      setResult(res.data);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gold-deep">
          <Clock className="h-3.5 w-3.5" /> Event-Specific Vedic Muhurat Search
        </span>
        <h1 className="mt-2 font-display text-3xl font-bold text-midnight sm:text-4xl">
          Auspicious Timings (Shubh Muhurat)
        </h1>
        <p className="mt-1 text-sm text-muted">
          Search location-specific auspicious intervals powered by classical Panchang parameters.
        </p>
      </div>

      {/* Search Form */}
      <form
        onSubmit={handleSearch}
        className="grid grid-cols-1 gap-4 rounded-2xl border border-gold/25 bg-white p-6 shadow-[0_14px_30px_-22px_rgba(60,35,90,0.25)] sm:grid-cols-4"
      >
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-midnight">
            Event Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gold/30 bg-white px-3 py-2 text-sm text-midnight focus:border-gold-deep focus:outline-none"
          >
            {MUHURAT_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id} className="bg-white text-midnight">
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-midnight">
            Target Date
          </label>
          <div className="relative mt-1">
            <Calendar className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gold-deep" />
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full rounded-xl border border-gold/30 bg-white py-2 pl-9 pr-3 text-sm text-midnight focus:border-gold-deep focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-midnight">
            Location
          </label>
          <div className="relative mt-1">
            <MapPin className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gold-deep" />
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full rounded-xl border border-gold/30 bg-white py-2 pl-9 pr-3 text-sm text-midnight placeholder:text-muted focus:border-gold-deep focus:outline-none"
              placeholder="City, Country"
            />
          </div>
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-gold-deep py-2.5 font-semibold text-white shadow-sm transition hover:bg-gold-dark disabled:opacity-50"
          >
            {loading ? "Searching..." : "Find Muhurats"}
          </button>
        </div>
      </form>

      {/* Results */}
      {result && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-gold/25 bg-white p-6 text-midnight shadow-[0_14px_30px_-22px_rgba(60,35,90,0.25)]">
            <h3 className="font-display text-xl font-bold text-midnight border-b border-gold/15 pb-3">
              Daily Auspicious Windows for {targetDate}
            </h3>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Abhijit */}
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-50 p-4">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                  Most Auspicious Midday Window
                </span>
                <p className="text-lg font-bold text-midnight mt-1">Abhijit Muhurat</p>
                <p className="mt-2 text-sm font-semibold text-emerald-800">
                  {result.abhijitMuhurat.start} – {result.abhijitMuhurat.end}
                </p>
                <p className="mt-1 text-xs text-muted">Ideal for major beginnings and ceremonies.</p>
              </div>

              {/* Brahma */}
              <div className="rounded-xl border border-gold/30 bg-gold/10 p-4">
                <span className="text-xs font-bold uppercase tracking-wider text-gold-deep">
                  Pre-Dawn Spiritual Window
                </span>
                <p className="text-lg font-bold text-midnight mt-1">Brahma Muhurat</p>
                <p className="mt-2 text-sm font-semibold text-midnight">
                  {result.brahmaMuhurat.start} – {result.brahmaMuhurat.end}
                </p>
                <p className="mt-1 text-xs text-muted">Ideal for meditation, mantra, and sacred rites.</p>
              </div>

              {/* Rahu Kaal Restriction */}
              <div className="rounded-xl border border-rose-500/30 bg-rose-50 p-4">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-700">
                  Inauspicious Period (Avoid)
                </span>
                <p className="text-lg font-bold text-midnight mt-1">Rahu Kaal</p>
                <p className="mt-2 text-sm font-semibold text-rose-800">
                  {result.rahukalam.start} – {result.rahukalam.end}
                </p>
                <p className="mt-1 text-xs text-muted">Strictly avoid starting new contracts or journeys.</p>
              </div>
            </div>

            <div className="mt-6 border-t border-gold/15 pt-4 text-xs text-muted flex flex-wrap gap-4">
              <div><strong className="text-midnight">Tithi:</strong> {result.tithi.name} ({result.tithi.paksha} Paksha)</div>
              <div><strong className="text-midnight">Nakshatra:</strong> {result.nakshatra.name}</div>
              <div><strong className="text-midnight">Yoga:</strong> {result.yoga.name}</div>
              <div><strong className="text-midnight">Karana:</strong> {result.karana.name}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
