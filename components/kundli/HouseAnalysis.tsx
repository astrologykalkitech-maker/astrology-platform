"use client";

import React from "react";
import type { BhavaCusp, PlanetName, RashiName } from "@/lib/astrology/types";

interface HouseAnalysisProps {
  houses: BhavaCusp[];
}

const HOUSE_METADATA: Record<number, { name: string; title: string; significance: string }> = {
  1: {
    name: "Tanu Bhava",
    title: "1st House – Self & Personality",
    significance: "Physical body, vitality, character, aura, longevity, and overall life path.",
  },
  2: {
    name: "Dhana Bhava",
    title: "2nd House – Wealth & Family",
    significance: "Accumulated wealth, family lineage, speech, truthfulness, and food habits.",
  },
  3: {
    name: "Sahaja Bhava",
    title: "3rd House – Courage & Communication",
    significance: "Valor, younger siblings, artistic talents, short travels, and writing skills.",
  },
  4: {
    name: "Bandhu / Sukha Bhava",
    title: "4th House – Home, Mother & Mind",
    significance: "Mother, landed property, real estate, domestic contentment, education, and vehicles.",
  },
  5: {
    name: "Putra Bhava",
    title: "5th House – Intellect & Children",
    significance: "Past life merit (Purva Punya), intelligence, children, creativity, and investments.",
  },
  6: {
    name: "Ari / Shatru Bhava",
    title: "6th House – Health & Competition",
    significance: "Resistance to diseases, service, debts, litigations, daily work, and obstacles.",
  },
  7: {
    name: "Kalatra Bhava",
    title: "7th House – Marriage & Partnerships",
    significance: "Spouse, conjugal harmony, business partners, public relations, and foreign travels.",
  },
  8: {
    name: "Ayur / Randhra Bhava",
    title: "8th House – Transformation & Longevity",
    significance: "Longevity, occult knowledge, unearned wealth, sudden changes, and spiritual research.",
  },
  9: {
    name: "Bhagya / Dharma Bhava",
    title: "9th House – Fortune, Guru & Dharma",
    significance: "Luck, pilgrimage, father, spiritual preceptors, higher philosophy, and righteousness.",
  },
  10: {
    name: "Karma Bhava",
    title: "10th House – Career & Status",
    significance: "Profession, leadership, public fame, authority, achievements, and dignity in society.",
  },
  11: {
    name: "Labha Bhava",
    title: "11th House – Gains & Desires",
    significance: "Financial windfalls, elder siblings, network circles, fulfillment of life ambitions.",
  },
  12: {
    name: "Vyaya Bhava",
    title: "12th House – Expenses & Liberation",
    significance: "Moksha (liberation), foreign residency, spiritual seclusion, dreams, and expenditure.",
  },
};

const RASHI_LORDS_MAP: Record<RashiName, PlanetName> = {
  Mesha: "Mars",
  Vrishabha: "Venus",
  Mithuna: "Mercury",
  Karka: "Moon",
  Simha: "Sun",
  Kanya: "Mercury",
  Tula: "Venus",
  Vrishchika: "Mars",
  Dhanu: "Jupiter",
  Makara: "Saturn",
  Kumbha: "Saturn",
  Meena: "Jupiter",
};

export function HouseAnalysis({ houses }: HouseAnalysisProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-base font-bold text-midnight">
          Twelve Bhavas (House Analysis & Interpretations)
        </h3>
        <p className="text-xs text-muted mt-0.5">
          Detailed breakdown of all 12 astrological houses, ruling zodiac signs, lord grahas, and occupying planets.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {houses.map((h) => {
          const meta = HOUSE_METADATA[h.houseNumber] || {
            name: `House ${h.houseNumber}`,
            title: `House ${h.houseNumber}`,
            significance: "Key astrological area of life.",
          };
          const houseLord = RASHI_LORDS_MAP[h.rashi] || "Sun";
          const hasPlanets = h.planetsInHouse && h.planetsInHouse.length > 0;

          return (
            <div
              key={h.houseNumber}
              className="p-4 rounded-2xl border border-gold/20 bg-white shadow-sm flex flex-col justify-between hover:border-gold/40 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between border-b border-gold/15 pb-2.5 mb-2.5">
                  <span className="font-display text-xs font-bold text-midnight">
                    {meta.title}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-parchment text-gold-deep font-semibold">
                    {meta.name}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Zodiac Sign:</span>
                    <span className="font-semibold text-midnight">{h.rashi}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">House Lord:</span>
                    <span className="font-semibold text-gold-deep">{houseLord}</span>
                  </div>
                  <div className="flex items-start justify-between">
                    <span className="text-muted">Occupying Planets:</span>
                    <span className="font-semibold text-right">
                      {hasPlanets ? (
                        <span className="text-midnight bg-gold/15 px-2 py-0.5 rounded text-[11px]">
                          {h.planetsInHouse.join(", ")}
                        </span>
                      ) : (
                        <span className="text-muted italic text-[11px]">None (Empty)</span>
                      )}
                    </span>
                  </div>
                </div>

                <p className="mt-3 text-[11px] text-muted line-clamp-2 leading-relaxed">
                  {meta.significance}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

