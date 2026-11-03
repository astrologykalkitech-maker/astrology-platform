"use client";

import React, { useState } from "react";
import { Download, Maximize2, Minimize2 } from "lucide-react";
import { NorthIndianChart } from "./NorthIndianChart";
import { SouthIndianChart } from "./SouthIndianChart";
import type { AscendantInfo, PlanetaryPosition, PlanetName } from "@/lib/astrology/types";

interface ChartViewerProps {
  ascendant: AscendantInfo;
  planets: Record<PlanetName, PlanetaryPosition>;
}

export function KundliChartViewer({ ascendant, planets }: ChartViewerProps) {
  const [style, setStyle] = useState<"north" | "south">("north");
  const [chartType, setChartType] = useState<"D1" | "D9" | "D10">("D1");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const displayPlanets = React.useMemo(() => {
    if (chartType === "D1") return planets;

    const modified = { ...planets };
    Object.keys(modified).forEach((key) => {
      const p = modified[key as PlanetName];
      if (chartType === "D9" && p.navamsaRashi) {
        modified[key as PlanetName] = {
          ...p,
          rashi: p.navamsaRashi,
        };
      } else if (chartType === "D10" && p.dashamsaRashi) {
        modified[key as PlanetName] = {
          ...p,
          rashi: p.dashamsaRashi,
        };
      }
    });
    return modified;
  }, [planets, chartType]);

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
  };

  const handleDownloadImage = () => {
    window.print();
  };

  return (
    <div className={`space-y-4 ${isFullscreen ? "fixed inset-0 z-50 bg-midnight/95 p-6 overflow-y-auto flex flex-col justify-center items-center" : ""}`}>
      {/* Controls Bar */}
      <div className="w-full flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-gold/25 shadow-sm">
        {/* Style Toggle (North vs South) */}
        <div className="flex items-center gap-1.5 p-1 bg-parchment/60 rounded-xl border border-gold/20">
          <button
            type="button"
            onClick={() => setStyle("north")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              style === "north"
                ? "bg-midnight text-champagne shadow-sm"
                : "text-muted hover:text-midnight"
            }`}
          >
            North Indian (Diamond)
          </button>
          <button
            type="button"
            onClick={() => setStyle("south")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              style === "south"
                ? "bg-midnight text-champagne shadow-sm"
                : "text-muted hover:text-midnight"
            }`}
          >
            South Indian (Square)
          </button>
        </div>

        {/* Divisional Charts Toggle */}
        <div className="flex items-center gap-1.5 p-1 bg-parchment/60 rounded-xl border border-gold/20">
          <button
            type="button"
            onClick={() => setChartType("D1")}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
              chartType === "D1" ? "bg-gold-deep text-white" : "text-muted hover:text-midnight"
            }`}
          >
            D1 (Lagna)
          </button>
          <button
            type="button"
            onClick={() => setChartType("D9")}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
              chartType === "D9" ? "bg-gold-deep text-white" : "text-muted hover:text-midnight"
            }`}
          >
            D9 (Navamsa)
          </button>
          <button
            type="button"
            onClick={() => setChartType("D10")}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
              chartType === "D10" ? "bg-gold-deep text-white" : "text-muted hover:text-midnight"
            }`}
          >
            D10 (Dashamsa)
          </button>
        </div>

        {/* View Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 rounded-xl border border-gold/20 text-midnight hover:bg-parchment transition-colors"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen View"}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={handleDownloadImage}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gold/25 bg-white text-xs font-semibold text-midnight hover:bg-parchment transition-colors"
            title="Download Chart as Image/PDF"
          >
            <Download className="h-3.5 w-3.5 text-gold-deep" />
            <span>Print Chart</span>
          </button>
        </div>
      </div>

      {/* Chart Canvas Component */}
      <div className="w-full max-w-xl mx-auto">
        {style === "north" ? (
          <NorthIndianChart ascendant={ascendant} planets={displayPlanets} />
        ) : (
          <SouthIndianChart ascendant={ascendant} planets={displayPlanets} />
        )}
      </div>

      {isFullscreen && (
        <button
          type="button"
          onClick={toggleFullscreen}
          className="mt-4 px-4 py-2 rounded-xl bg-gold text-midnight font-bold text-xs"
        >
          Close Fullscreen
        </button>
      )}
    </div>
  );
}
