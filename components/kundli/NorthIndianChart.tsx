"use client";

import React, { useId } from "react";
import type { PlanetaryPosition, AscendantInfo, PlanetName } from "@/lib/astrology/types";

interface NorthIndianChartProps {
  ascendant: AscendantInfo;
  planets: Record<PlanetName, PlanetaryPosition>;
  chartTitle?: string;
  className?: string;
}

const PLANET_SHORT_CODES: Record<PlanetName, string> = {
  Sun: "Su",
  Moon: "Mo",
  Mars: "Ma",
  Mercury: "Me",
  Jupiter: "Ju",
  Venus: "Ve",
  Saturn: "Sa",
  Rahu: "Ra",
  Ketu: "Ke",
};

/**
 * Traditional Diamond-Style North Indian Kundli SVG Component
 */
export function NorthIndianChart({ ascendant, planets, chartTitle = "Lagna Kundli (D1)", className = "" }: NorthIndianChartProps) {
  const gradientId = useId();

  // Group planets by house (1 to 12)
  const planetsByHouse: Record<number, PlanetaryPosition[]> = {};
  for (let h = 1; h <= 12; h++) {
    planetsByHouse[h] = [];
  }
  Object.values(planets).forEach((p) => {
    if (p.house >= 1 && p.house <= 12) {
      planetsByHouse[p.house].push(p);
    }
  });

  const lagnaRashiNum = ascendant.rashiNumber;
  const getHouseRashi = (h: number) => {
    return ((lagnaRashiNum + h - 2) % 12) + 1;
  };

  const houseLabels: Record<number, { rashiX: number; rashiY: number; planetsX: number; planetsY: number }> = {
    1: { rashiX: 300, rashiY: 260, planetsX: 300, planetsY: 180 },
    2: { rashiX: 180, rashiY: 90, planetsX: 150, planetsY: 55 },
    3: { rashiX: 90, rashiY: 180, planetsX: 55, planetsY: 150 },
    4: { rashiX: 260, rashiY: 300, planetsX: 180, planetsY: 300 },
    5: { rashiX: 90, rashiY: 420, planetsX: 55, planetsY: 450 },
    6: { rashiX: 180, rashiY: 510, planetsX: 150, planetsY: 545 },
    7: { rashiX: 300, rashiY: 340, planetsX: 300, planetsY: 420 },
    8: { rashiX: 420, rashiY: 510, planetsX: 450, planetsY: 545 },
    9: { rashiX: 510, rashiY: 420, planetsX: 545, planetsY: 450 },
    10: { rashiX: 340, rashiY: 300, planetsX: 420, planetsY: 300 },
    11: { rashiX: 510, rashiY: 180, planetsX: 545, planetsY: 150 },
    12: { rashiX: 420, rashiY: 90, planetsX: 450, planetsY: 55 },
  };

  return (
    <div className={`relative flex flex-col items-center justify-center p-3 sm:p-5 bg-gradient-to-b from-[#1c1432] to-[#120c22] rounded-2xl border border-gold/40 shadow-xl overflow-hidden ${className}`}>
      {/* Chart Title Header */}
      <div className="w-full flex items-center justify-between pb-3 mb-2 border-b border-gold/20 text-xs sm:text-sm">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-gold animate-pulse" />
          <span className="font-semibold text-champagne font-display tracking-wider">{chartTitle}</span>
        </div>
        <div className="text-[11px] text-ivory/70">
          Ascendant: <span className="text-gold font-semibold">{ascendant.rashi}</span> ({ascendant.formattedDegrees})
        </div>
      </div>

      {/* SVG Canvas */}
      <svg
        viewBox="0 0 600 600"
        className="w-full max-w-[500px] h-auto aspect-square select-none drop-shadow-md"
      >
        <defs>
          <linearGradient id={`gold-line-${gradientId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f5e0a9" />
            <stop offset="50%" stopColor="#c49a4a" />
            <stop offset="100%" stopColor="#8a6420" />
          </linearGradient>
          <linearGradient id={`inner-bg-${gradientId}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#251a3e" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#151027" stopOpacity="0.95" />
          </linearGradient>
        </defs>

        <rect
          x="10"
          y="10"
          width="580"
          height="580"
          fill={`url(#inner-bg-${gradientId})`}
          stroke={`url(#gold-line-${gradientId})`}
          strokeWidth="3"
        />

        <line x1="10" y1="10" x2="590" y2="590" stroke={`url(#gold-line-${gradientId})`} strokeWidth="2" />
        <line x1="590" y1="10" x2="10" y2="590" stroke={`url(#gold-line-${gradientId})`} strokeWidth="2" />

        <polygon
          points="300,10 590,300 300,590 10,300"
          fill="none"
          stroke={`url(#gold-line-${gradientId})`}
          strokeWidth="2.5"
        />

        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((houseNum) => {
          const config = houseLabels[houseNum];
          const rashi = getHouseRashi(houseNum);
          const occupyingPlanets = planetsByHouse[houseNum];
          const isLagna = houseNum === 1;

          return (
            <g key={houseNum}>
              <text
                x={config.rashiX}
                y={config.rashiY}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#e8d4a6"
                fontSize="16"
                fontWeight="700"
                className="font-mono opacity-80"
              >
                {rashi}
              </text>

              <g transform={`translate(${config.planetsX}, ${config.planetsY})`}>
                {isLagna && (
                  <text
                    x="0"
                    y={occupyingPlanets.length > 0 ? "-24" : "0"}
                    textAnchor="middle"
                    fill="#ffda79"
                    fontSize="13"
                    fontWeight="800"
                    className="tracking-wider uppercase"
                  >
                    Asc (Lg)
                  </text>
                )}

                {occupyingPlanets.map((p, idx) => {
                  const offset = (idx - (occupyingPlanets.length - 1) / 2) * 16;
                  const shortName = PLANET_SHORT_CODES[p.name] || p.name.slice(0, 2);
                  const isRetro = p.isRetrograde ? "(R)" : "";
                  const isCombust = p.isCombust ? "*" : "";

                  return (
                    <text
                      key={p.name}
                      x="0"
                      y={offset}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={p.isRetrograde ? "#ff9f43" : p.name === "Sun" || p.name === "Jupiter" ? "#ffd32a" : "#ffffff"}
                      fontSize="13"
                      fontWeight="600"
                      className="cursor-default"
                    >
                      {shortName} {isRetro}{isCombust}
                      <title>{`${p.name} in ${p.rashi} (${p.formattedDegrees}) - House ${p.house}${p.isRetrograde ? " [Retrograde]" : ""}${p.isCombust ? " [Combust]" : ""}`}</title>
                    </text>
                  );
                })}
              </g>
            </g>
          );
        })}
      </svg>

      <div className="mt-3 w-full flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-ivory/60">
        <span><strong className="text-champagne">Lg:</strong> Ascendant</span>
        <span><strong className="text-[#ff9f43]">(R):</strong> Retrograde</span>
        <span><strong className="text-gold">*</strong> Combust</span>
        <span>Numbers in corners: Zodiac Sign (1: Aries ... 12: Pisces)</span>
      </div>
    </div>
  );
}
