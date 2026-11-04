"use client";

import React from "react";
import type { PlanetaryPosition, AscendantInfo, PlanetName } from "@/lib/astrology/types";

interface PlanetaryTableProps {
  ascendant: AscendantInfo;
  planets: Record<PlanetName, PlanetaryPosition>;
}

export function PlanetaryTable({ ascendant, planets }: PlanetaryTableProps) {
  const planetList: (PlanetaryPosition | { isAscendant: true; name: string; rashi: string; formattedDegrees: string; nakshatra: string; pada: number; lord: string })[] = [
    {
      isAscendant: true,
      name: "Ascendant (Lagna)",
      rashi: ascendant.rashi,
      formattedDegrees: ascendant.formattedDegrees,
      nakshatra: ascendant.nakshatra,
      pada: ascendant.pada,
      lord: ascendant.lord,
    },
    ...Object.values(planets),
  ];

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-sm">
      <div className="p-4 border-b border-gold/15 bg-parchment/40 flex items-center justify-between">
        <div>
          <h3 className="font-display text-base font-bold text-midnight">
            Planetary Positions & Graha Kundli
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Exact sidereal longitudes, constellations (Nakshatra), Padas, houses, and dignity status.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#1c1432] text-champagne border-b border-gold/20 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="py-3 px-3 sm:px-4">Planet (Graha)</th>
              <th className="py-3 px-3">Zodiac Sign (Rashi)</th>
              <th className="py-3 px-3">Exact Degree</th>
              <th className="py-3 px-3">House (Bhava)</th>
              <th className="py-3 px-3">Nakshatra & Pada</th>
              <th className="py-3 px-3">Navamsa (D9)</th>
              <th className="py-3 px-3">Status / Dignity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gold/10 text-midnight font-medium">
            {planetList.map((item, idx) => {
              if ("isAscendant" in item) {
                return (
                  <tr key="ascendant" className="bg-gold/5 font-semibold">
                    <td className="py-3 px-3 sm:px-4 flex items-center gap-1.5 text-gold-deep">
                      <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                      Ascendant (Lagna)
                    </td>
                    <td className="py-3 px-3">{item.rashi}</td>
                    <td className="py-3 px-3 font-mono">{item.formattedDegrees}</td>
                    <td className="py-3 px-3 font-bold text-gold-deep">1st House</td>
                    <td className="py-3 px-3">{item.nakshatra} (Pada {item.pada})</td>
                    <td className="py-3 px-3 text-muted">—</td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-gold/15 text-gold-deep font-bold">
                        Lord: {item.lord}
                      </span>
                    </td>
                  </tr>
                );
              }

              const p = item as PlanetaryPosition;
              const isRetro = p.isRetrograde;
              const isCombust = p.isCombust;

              return (
                <tr key={p.name} className={idx % 2 === 0 ? "bg-white" : "bg-parchment/20"}>
                  <td className="py-3 px-3 sm:px-4 font-semibold text-midnight flex items-center gap-1.5">
                    {p.name}
                    {isRetro && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-bold" title="Vakra / Retrograde">
                        R
                      </span>
                    )}
                    {isCombust && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-red-100 text-red-800 font-bold" title="Asta / Combust">
                        Combust
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3">{p.rashi}</td>
                  <td className="py-3 px-3 font-mono text-muted">{p.formattedDegrees}</td>
                  <td className="py-3 px-3 font-semibold text-midnight">House {p.house}</td>
                  <td className="py-3 px-3">
                    {p.nakshatra} <span className="text-muted">(P{p.pada})</span>
                  </td>
                  <td className="py-3 px-3 font-medium text-purple-900">{p.navamsaRashi || "—"}</td>
                  <td className="py-3 px-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        p.dignity === "Exalted" || p.dignity === "Own Sign"
                          ? "bg-emerald-100 text-emerald-800"
                          : p.dignity === "Debilitated"
                          ? "bg-rose-100 text-rose-800"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {p.dignity}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

