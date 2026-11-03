"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Download } from "lucide-react";
import { KundliChartViewer } from "@/components/kundli/KundliChartViewer";
import { PlanetaryTable } from "@/components/kundli/PlanetaryTable";
import { HouseAnalysis } from "@/components/kundli/HouseAnalysis";
import { NakshatraSection } from "@/components/kundli/NakshatraSection";
import { DashaTimeline } from "@/components/kundli/DashaTimeline";
import { AstrologyReportView } from "@/components/kundli/AstrologyReportView";
import { generateKundliPdf } from "@/lib/pdf/kundli-pdf";
import type { SavedKundliRecord } from "@/lib/types/database.types";
import type { FullAstrologyReport, PlanetaryPosition, AscendantInfo, PlanetName } from "@/lib/astrology/types";

interface KundliDetailClientProps {
  kundli: SavedKundliRecord;
}

type TabKey = "chart" | "planets" | "houses" | "nakshatra" | "dasha" | "report";

export default function KundliDetailClient({ kundli }: KundliDetailClientProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("chart");

  const report = kundli.generated_report as unknown as FullAstrologyReport;
  const chart = report.kundli;
  const planets = chart.planets as Record<PlanetName, PlanetaryPosition>;
  const ascendant = chart.ascendant as AscendantInfo;

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    setIsGeneratingPdf(true);
    try {
      generateKundliPdf(kundli, report);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: "chart", label: "Birth Charts (D1/D9)" },
    { key: "planets", label: "Planetary Positions" },
    { key: "houses", label: "12 Bhavas (Houses)" },
    { key: "nakshatra", label: "Nakshatra Analysis" },
    { key: "dasha", label: "Vimshottari Dasha" },
    { key: "report", label: "Comprehensive Vedic Report" },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Top Navigation & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gold/15 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/customer/kundli"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gold/30 bg-white text-gold-deep hover:bg-parchment transition-colors"
            aria-label="Back to My Kundlis"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-xl sm:text-2xl font-bold text-midnight">
                {kundli.name}&apos;s Kundli
              </h1>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-gold/15 text-gold-deep font-bold border border-gold/25">
                Lagna: {ascendant.rashi}
              </span>
            </div>
            <p className="text-xs text-muted mt-0.5 flex flex-wrap items-center gap-2">
              <span>DOB: {new Date(kundli.date_of_birth).toLocaleDateString("en-IN", { dateStyle: "medium" })} ({kundli.time_of_birth})</span>
              <span>•</span>
              <span>{kundli.birth_place}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gold-deep text-white text-xs font-semibold hover:bg-gold-deep/90 transition-all shadow-sm disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{isGeneratingPdf ? "Generating PDF..." : "Download Official PDF"}</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-midnight text-champagne text-xs font-semibold hover:bg-midnight/90 transition-all shadow-sm"
          >
            <Printer className="h-3.5 w-3.5 text-gold" />
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 border-b border-gold/20 pb-2 overflow-x-auto text-xs no-scrollbar">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-3.5 py-2 rounded-xl font-semibold transition-all whitespace-nowrap ${
                isActive
                  ? "bg-midnight text-champagne shadow-sm"
                  : "text-muted hover:text-midnight hover:bg-parchment/60"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div className="mt-4">
        {activeTab === "chart" && (
          <KundliChartViewer ascendant={ascendant} planets={planets} />
        )}

        {activeTab === "planets" && (
          <PlanetaryTable ascendant={ascendant} planets={planets} />
        )}

        {activeTab === "houses" && (
          <HouseAnalysis houses={chart.houses} />
        )}

        {activeTab === "nakshatra" && (
          <NakshatraSection
            birthNakshatra={chart.birthNakshatra}
            birthPada={chart.birthPada}
            moonSign={chart.moonSign}
          />
        )}

        {activeTab === "dasha" && (
          <DashaTimeline dashas={chart.dashas} currentDasha={chart.currentDasha} />
        )}

        {activeTab === "report" && (
          <AstrologyReportView report={report} />
        )}
      </div>
    </div>
  );
}
