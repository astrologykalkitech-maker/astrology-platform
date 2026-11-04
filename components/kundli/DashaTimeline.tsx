"use client";

import React, { useState } from "react";
import { Calendar, CheckCircle2 } from "lucide-react";
import type { DashaPeriod, PlanetName } from "@/lib/astrology/types";

interface DashaTimelineProps {
  dashas: DashaPeriod[];
  currentDasha?: {
    mahadasha: PlanetName;
    antardasha: PlanetName;
    endDate: string;
  };
}

export function DashaTimeline({ dashas, currentDasha }: DashaTimelineProps) {
  const [selectedMaha, setSelectedMaha] = useState<DashaPeriod>(() => {
    return dashas.find((d) => d.isCurrent) || dashas[0];
  });

  return (
    <div className="w-full rounded-2xl border border-gold/25 bg-white p-5 shadow-sm space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gold/15 pb-4">
        <div>
          <h3 className="font-display text-base font-bold text-midnight">
            Vimshottari Dasha System (120-Year Planetary Cycles)
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Calculated from birth Moon Nakshatra. Visualizes completed, active, and upcoming Mahadashas and Antardashas.
          </p>
        </div>

        {currentDasha && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gold/15 border border-gold/30">
            <span className="h-2 w-2 rounded-full bg-gold animate-pulse" />
            <div className="text-xs">
              <span className="text-muted text-[10px] block">Current Active Dasha:</span>
              <span className="font-bold text-midnight font-display">
                {currentDasha.mahadasha} / {currentDasha.antardasha}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Mahadasha Timeline Bar */}
      <div>
        <h4 className="text-xs font-semibold text-midnight mb-2">Select Mahadasha:</h4>
        <div className="grid grid-cols-3 sm:grid-cols-9 gap-1.5">
          {dashas.map((d) => {
            const isSelected = selectedMaha.planet === d.planet;
            const isCurrent = d.isCurrent;

            return (
              <button
                key={d.planet}
                type="button"
                onClick={() => setSelectedMaha(d)}
                className={`p-2.5 rounded-xl text-center border transition-all flex flex-col justify-between items-center ${
                  isSelected
                    ? "bg-midnight text-champagne border-gold shadow-md"
                    : isCurrent
                    ? "bg-gold/15 border-gold text-midnight font-bold"
                    : "bg-parchment/40 border-gold/15 text-muted hover:text-midnight hover:border-gold/30"
                }`}
              >
                <span className="text-xs font-bold font-display">{d.planet}</span>
                <span className="text-[10px] opacity-80 mt-1">
                  {new Date(d.startDate).getFullYear()} - {new Date(d.endDate).getFullYear()}
                </span>
                {isCurrent && (
                  <span className="mt-1 text-[9px] px-1 rounded bg-gold text-midnight font-bold">
                    Active
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Mahadasha Antardasha Sub-Periods */}
      <div className="p-4 rounded-xl border border-gold/20 bg-parchment/30">
        <div className="flex items-center justify-between border-b border-gold/15 pb-2.5 mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gold-deep" />
            <h4 className="font-display text-sm font-bold text-midnight">
              {selectedMaha.planet} Mahadasha Sub-Periods (Antardashas)
            </h4>
          </div>
          <span className="text-xs text-muted">
            {new Date(selectedMaha.startDate).toLocaleDateString()} to{" "}
            {new Date(selectedMaha.endDate).toLocaleDateString()}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
          {selectedMaha.subPeriods?.map((sub) => {
            const isSubCurrent = sub.isCurrent;
            return (
              <div
                key={sub.planet}
                className={`p-3 rounded-lg border flex items-center justify-between ${
                  isSubCurrent
                    ? "bg-white border-gold shadow-sm ring-1 ring-gold"
                    : "bg-white/80 border-gold/10"
                }`}
              >
                <div>
                  <span className="font-semibold text-midnight">
                    {selectedMaha.planet} - {sub.planet}
                  </span>
                  <p className="text-[10px] text-muted mt-0.5">
                    {new Date(sub.startDate).toLocaleDateString("en-IN", {
                      month: "short",
                      year: "numeric",
                    })}{" "}
                    —{" "}
                    {new Date(sub.endDate).toLocaleDateString("en-IN", {
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>

                {isSubCurrent && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Present
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
