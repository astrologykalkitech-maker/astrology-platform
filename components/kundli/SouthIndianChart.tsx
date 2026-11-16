"use client";

import React, { useId } from "react";
import type { PlanetaryPosition, AscendantInfo, PlanetName, RashiName } from "@/lib/astrology/types";

interface SouthIndianChartProps {
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
 * Classical South Indian Vedic Square Chart
 * In South Indian style:
 * - Signs (Rashis) are fixed in clockwise order starting with Mesha (Aries) at top 2nd box:
 *   Top row: Meena (Pisces, col 0), Mesha (Aries, col 1), Vrishabha (Taurus, col 2), Mithuna (Gemini, col 3)
 *   Right col: Karka (Cancer, row 1), Simha (Leo, row 2)
 *   Bottom row: Kanya (Virgo, col 3), Tula (Libra, col 2), Vrishchika (Scorpio, col 1), Dhanu (Sagittarius, col 0)
 *   Left col: Makara (Capricorn, row 2), Kumbha (Aquarius, row 1)
 * - The Lagna (Ascendant) is indicated with "ASC" or a diagonal slash in that sign box.
 * - Central area (2x2) is open for chart info.
 */
export function SouthIndianChart({ ascendant, planets, chartTitle = "South Indian Kundli", className = "" }: SouthIndianChartProps) {
  const gradientId = useId();

  // Grid coordinates (col 0-3, row 0-3) for each of the 12 fixed Signs:
  // 1: Mesha, 2: Vrishabha, 3: Mithuna, 4: Karka, 5: Simha, 6: Kanya,
  // 7: Tula, 8: Vrishchika, 9: Dhanu, 10: Makara, 11: Kumbha, 12: Meena
  const signGridPositions: Record<number, { col: number; row: number; name: RashiName; label: string }> = {
    12: { col: 0, row: 0, name: "Meena", label: "Pisces (12)" },
    1: { col: 1, row: 0, name: "Mesha", label: "Aries (1)" },
    2: { col: 2, row: 0, name: "Vrishabha", label: "Taurus (2)" },
    3: { col: 3, row: 0, name: "Mithuna", label: "Gemini (3)" },

    4: { col: 3, row: 1, name: "Karka", label: "Cancer (4)" },
    5: { col: 3, row: 2, name: "Simha", label: "Leo (5)" },

    6: { col: 3, row: 3, name: "Kanya", label: "Virgo (6)" },
    7: { col: 2, row: 3, name: "Tula", label: "Libra (7)" },
    8: { col: 1, row: 3, name: "Vrishchika", label: "Scorpio (8)" },
    9: { col: 0, row: 3, name: "Dhanu", label: "Sagittarius (9)" },

    10: { col: 0, row: 2, name: "Makara", label: "Capricorn (10)" },
    11: { col: 0, row: 1, name: "Kumbha", label: "Aquarius (11)" },
  };

  // Group planets by their Rashi Number (1-12)
  const planetsByRashi: Record<number, PlanetaryPosition[]> = {};
  for (let r = 1; r <= 12; r++) {
    planetsByRashi[r] = [];
  }
  Object.values(planets).forEach((p) => {
    if (p.rashiNumber >= 1 && p.rashiNumber <= 12) {
      planetsByRashi[p.rashiNumber].push(p);
    }
  });

  const boxSize = 140;
  const padding = 20;

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
          <linearGradient id={`gold-border-${gradientId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f5e0a9" />
            <stop offset="50%" stopColor="#c49a4a" />
            <stop offset="100%" stopColor="#8a6420" />
          </linearGradient>
          <linearGradient id={`box-bg-${gradientId}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#251a3e" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#151027" stopOpacity="0.95" />
          </linearGradient>
        </defs>

        {/* Outer 4x4 Frame */}
        <rect
          x={padding}
          y={padding}
          width={boxSize * 4}
          height={boxSize * 4}
          fill="none"
          stroke={`url(#gold-border-${gradientId})`}
          strokeWidth="3"
        />

        {/* Central 2x2 Open Box */}
        <rect
          x={padding + boxSize}
          y={padding + boxSize}
          width={boxSize * 2}
          height={boxSize * 2}
          fill={`url(#box-bg-${gradientId})`}
          stroke={`url(#gold-border-${gradientId})`}
          strokeWidth="2"
        />

        {/* Center Label */}
        <text
          x={300}
          y={285}
          textAnchor="middle"
          fill="#ffda79"
          fontSize="16"
          fontWeight="700"
          className="font-display tracking-wider"
        >
          {chartTitle.toUpperCase()}
        </text>
        <text
          x={300}
          y={315}
          textAnchor="middle"
          fill="#e8d4a6"
          fontSize="12"
          className="opacity-75"
        >
          Lagna: {ascendant.rashi}
        </text>

        {/* Render each of the 12 perimeter boxes */}
        {Object.entries(signGridPositions).map(([rashiNumStr, pos]) => {
          const rashiNum = Number(rashiNumStr);
          const x = padding + pos.col * boxSize;
          const y = padding + pos.row * boxSize;
          const isLagna = ascendant.rashiNumber === rashiNum;
          const occupyingPlanets = planetsByRashi[rashiNum] || [];

          return (
            <g key={rashiNum}>
              {/* Box border */}
              <rect
                x={x}
                y={y}
                width={boxSize}
                height={boxSize}
                fill={isLagna ? "#33224f" : `url(#box-bg-${gradientId})`}
                stroke={`url(#gold-border-${gradientId})`}
                strokeWidth="1.5"
              />

              {/* Lagna marker diagonal bar if ascendant */}
              {isLagna && (
                <line
                  x1={x}
                  y1={y}
                  x2={x + 35}
                  y2={y + 35}
                  stroke="#ffd32a"
                  strokeWidth="2.5"
                />
              )}

              {/* Sign label header */}
              <text
                x={x + 8}
                y={y + 16}
                fill="#e8d4a6"
                fontSize="10"
                fontWeight="600"
                className="opacity-75"
              >
                {pos.name}
              </text>

              {isLagna && (
                <text
                  x={x + boxSize - 8}
                  y={y + 16}
                  textAnchor="end"
                  fill="#ffd32a"
                  fontSize="11"
                  fontWeight="800"
                >
                  ASC
                </text>
              )}

              {/* Occupying Planets */}
              <g transform={`translate(${x + boxSize / 2}, ${y + boxSize / 2 + 10})`}>
                {occupyingPlanets.map((p, idx) => {
                  const numPlanets = occupyingPlanets.length;
                  // If 1-3 planets, single column; if 4+, 2 columns to prevent overflow
                  const isMultiCol = numPlanets > 3;
                  const colIdx = isMultiCol ? (idx % 2 === 0 ? -28 : 28) : 0;
                  const rowIdx = isMultiCol
                    ? (Math.floor(idx / 2) - Math.floor((numPlanets - 1) / 4)) * 17
                    : (idx - (numPlanets - 1) / 2) * 16;
                  const shortName = PLANET_SHORT_CODES[p.name] || p.name.slice(0, 2);
                  const isRetro = p.isRetrograde ? "(R)" : "";
                  const isCombust = p.isCombust ? "*" : "";

                  return (
                    <text
                      key={p.name}
                      x={colIdx}
                      y={rowIdx}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={p.isRetrograde ? "#ff9f43" : p.name === "Sun" || p.name === "Jupiter" ? "#ffd32a" : "#ffffff"}
                      fontSize={numPlanets > 4 ? "11" : "12"}
                      fontWeight="600"
                      className="cursor-default"
                    >
                      {shortName} {isRetro}{isCombust}
                      <title>{`${p.name} in ${p.rashi} (${p.formattedDegrees}) - House ${p.house}${p.isRetrograde ? " [Retrograde]" : ""}`}</title>
                    </text>
                  );
                })}
              </g>
            </g>
          );
        })}
      </svg>

      {/* Legend Footer */}
      <div className="mt-3 w-full flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-ivory/60">
        <span><strong className="text-champagne">ASC / Slash:</strong> Ascendant Lagna</span>
        <span><strong className="text-[#ff9f43]">(R):</strong> Retrograde</span>
        <span><strong className="text-gold">*</strong> Combust</span>
        <span>Fixed Zodiac sign layout (Clockwise from Pisces top-left)</span>
      </div>
    </div>
  );
}

