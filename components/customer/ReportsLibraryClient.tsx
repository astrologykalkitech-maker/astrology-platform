"use client";

import { useState } from "react";
import { FileText, Download } from "lucide-react";
import { generateAstrologyReportAction } from "@/app/actions/astrology";
import { generateKundliPdf } from "@/lib/pdf/kundli-pdf";
import type { SavedKundliRecord } from "@/lib/types/database.types";
import type { FullAstrologyReport } from "@/lib/astrology/types";

interface ReportsLibraryClientProps {
  kundlis: SavedKundliRecord[];
}

const REPORT_CATEGORIES = [
  { id: "full_kundli", title: "Comprehensive Janam Kundli Report", desc: "Complete 12-Bhava, Graha Spashta, and 120-Year Vimshottari Mahadasha Analysis" },
  { id: "career", title: "Career & Vocation Horoscope", desc: "Detailed 10th house Karmasthana, Dashamsa (D10), and planetary profession indicators" },
  { id: "marriage", title: "Marriage & Relationship Horoscope", desc: "7th house analysis, Venusian alignment, Manglik evaluation, and marital harmony" },
  { id: "dasha", title: "Vimshottari Dasha Analysis", desc: "Timeline of Mahadasha, Antardasha, and pivotal transit periods" },
];

export function ReportsLibraryClient({ kundlis }: ReportsLibraryClientProps) {
  const [selectedKundliId, setSelectedKundliId] = useState(kundlis[0]?.id || "");
  const [selectedCategory, setSelectedCategory] = useState("full_kundli");
  const [loading, setLoading] = useState(false);
  const [activeReport, setActiveReport] = useState<FullAstrologyReport | null>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const k = kundlis.find((item) => item.id === selectedKundliId);
    if (!k) return;

    setLoading(true);
    const res = await generateAstrologyReportAction({
      name: k.name,
      gender: k.gender === "male" || k.gender === "female" ? k.gender : "other",
      date: k.date_of_birth,
      time: (k.time_of_birth as string).slice(0, 5),
      location: {
        latitude: Number(k.latitude),
        longitude: Number(k.longitude),
        timezoneOffsetHours: Number(k.timezone || 5.5),
        cityName: k.birth_place,
      },
    });

    setLoading(false);
    if (res.success && res.data) {
      setActiveReport(res.data);
    }
  };

  const handleDownloadPdf = () => {
    const k = kundlis.find((item) => item.id === selectedKundliId);
    if (!k) return;
    generateKundliPdf(k, activeReport || undefined);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gold-deep">
          <FileText className="h-3.5 w-3.5" /> Advanced Astrology Report Library
        </span>
        <h1 className="mt-2 font-display text-3xl font-bold text-midnight sm:text-4xl">
          Astrology Reports & Document Vault
        </h1>
        <p className="mt-1 text-sm text-muted">
          Generate comprehensive multi-page Vedic reports and export high-resolution official PDFs.
        </p>
      </div>

      {/* Generation Form */}
      <form
        onSubmit={handleGenerate}
        className="rounded-2xl border border-gold/25 bg-white p-6 shadow-[0_14px_30px_-22px_rgba(60,35,90,0.25)] space-y-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-midnight">
              Select Saved Kundli Profile
            </label>
            <select
              value={selectedKundliId}
              onChange={(e) => setSelectedKundliId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gold/30 bg-white px-3 py-2 text-sm text-midnight focus:border-gold-deep focus:outline-none"
            >
              {kundlis.map((k) => (
                <option key={k.id} value={k.id} className="bg-white text-midnight">
                  {k.name} ({k.date_of_birth})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-midnight">
              Report Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gold/30 bg-white px-3 py-2 text-sm text-midnight focus:border-gold-deep focus:outline-none"
            >
              {REPORT_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id} className="bg-white text-midnight">
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || kundlis.length === 0}
          className="w-full rounded-xl bg-gold-deep py-3 font-semibold text-white shadow-sm transition hover:bg-gold-dark disabled:opacity-50"
        >
          {loading ? "Generating Report..." : "Generate Astrology Report"}
        </button>
      </form>

      {/* Report Viewer */}
      {activeReport && (
        <div className="space-y-6 rounded-2xl border border-gold/25 bg-white p-6 text-midnight shadow-[0_14px_30px_-22px_rgba(60,35,90,0.25)]">
          <div className="flex flex-col justify-between gap-4 border-b border-gold/15 pb-6 sm:flex-row sm:items-center">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-gold-deep">Generated Report</span>
              <h2 className="text-2xl font-bold text-midnight sm:text-3xl">
                {activeReport.subject.name}&apos;s Vedic Astrology Dossier
              </h2>
              <p className="text-xs text-muted mt-0.5">
                Lagna: {activeReport.kundli.ascendant.rashi} • Moon: {activeReport.kundli.moonSign} • Nakshatra: {activeReport.kundli.birthNakshatra}
              </p>
            </div>

            <button
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-2 rounded-xl bg-gold-deep px-5 py-2.5 font-semibold text-white shadow-sm transition hover:bg-gold-dark"
            >
              <Download className="h-4 w-4" />
              Download Official PDF
            </button>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-gold/20 bg-parchment/60 p-4">
              <span className="text-xs text-muted">Current Mahadasha</span>
              <p className="text-xl font-bold text-midnight mt-1">
                {activeReport.kundli.dashas[0]?.planet} Mahadasha
              </p>
              <p className="text-xs text-muted mt-1">
                Duration: {activeReport.kundli.dashas[0]?.durationYears} Years
              </p>
            </div>

            <div className="rounded-xl border border-gold/20 bg-parchment/60 p-4">
              <span className="text-xs text-muted">Ascendant (Lagna) Degree</span>
              <p className="text-xl font-bold text-midnight mt-1">
                {activeReport.kundli.ascendant.formattedDegrees}
              </p>
              <p className="text-xs text-muted mt-1">
                Lord: {activeReport.kundli.ascendant.lord}
              </p>
            </div>

            <div className="rounded-xl border border-gold/20 bg-parchment/60 p-4">
              <span className="text-xs text-muted">Primary Life Ratna</span>
              <p className="text-xl font-bold text-midnight mt-1">
                {activeReport.remedies.gemstones.primaryLife.name}
              </p>
              <p className="text-xs text-muted mt-1">
                Metal: {activeReport.remedies.gemstones.primaryLife.metal}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
