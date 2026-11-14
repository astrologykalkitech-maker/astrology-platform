"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import {
  calculateKPChart,
  calculateAllDivisionalCharts,
  calculateShadbala,
  calculateAshtakavarga,
  type KPChartResult,
  type DivisionalChartSignPlacement,
  type ShadbalaResult,
  type AshtakavargaResult,
} from "@/lib/astrology/advanced-vedic";
import {
  drawTarotReading,
  calculateZodiacCompatibility,
  calculateFLAMES,
  calculateVehicleNumerology,
  calculateMobileNumerology,
  type TarotReadingResult,
} from "@/lib/astrology/tarot-and-tools";
import {
  calculateJulianDay,
  calculateLahiriAyanamsa,
  calculatePlanetaryPositions,
} from "@/lib/astrology/astronomy";
import type { PlanetName } from "@/lib/astrology/types";

/**
 * FEATURE-01 & FEATURE-02: TAROT READING WITH OPTIONAL SAVED RECORD
 */
export async function getTarotReadingAction(params: {
  spreadType: TarotReadingResult["spreadType"];
  question?: string;
  saveToHistory?: boolean;
}): Promise<{ success: boolean; data?: TarotReadingResult; error?: string }> {
  try {
    const reading = drawTarotReading(params.spreadType, params.question);

    if (params.saveToHistory) {
      try {
        const user = await getCurrentUser();

        if (user) {
          const admin = await createAdminClient("main");
          await admin.from("audit_logs").insert({
            actor_id: user.id,
            action: "tarot.reading",
            target_type: "tarot",
            details: {
              spread: params.spreadType,
              question: params.question || null,
              cards: reading.cards.map((c) => ({
                name: c.card.name,
                position: c.position,
                reversed: c.isReversed,
              })),
            },
          });
        }
      } catch {}
    }

    return { success: true, data: reading };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to generate Tarot reading." };
  }
}

/**
 * FEATURE-04: DREAM INTERPRETATION SERVICE
 */
export async function interpretDreamAction(params: {
  dreamText: string;
  category: string;
}): Promise<{
  success: boolean;
  data?: {
    summary: string;
    symbols: string[];
    vedicSignificance: string;
    psychologicalTheme: string;
    guidance: string;
  };
  error?: string;
}> {
  try {
    const text = params.dreamText.trim();
    if (!text || text.length < 5) {
      return { success: false, error: "Please describe your dream in a few sentences." };
    }

    // Traditional Vedic Svapna Shastra symbol breakdown
    const symbols: string[] = [];
    if (/water|ocean|river|rain/i.test(text)) symbols.push("Jala (Water — Emotional purification & renewal)");
    if (/snake|serpent|cobra/i.test(text)) symbols.push("Sarpa (Kundalini awakening & ancestral blessings)");
    if (/flying|sky|soar/i.test(text)) symbols.push("Vayu (Liberation & overcoming earthly limitations)");
    if (/temple|diety|god|puja/i.test(text)) symbols.push("Deva Sannidhi (Divine spiritual grace & protection)");
    if (/fire|light|sun/i.test(text)) symbols.push("Agni (Karmic transformation & clarity of vision)");
    if (symbols.length === 0) symbols.push("Manas Prana (Subconscious emotional reflection & release)");

    return {
      success: true,
      data: {
        summary: `Dream categorized under ${params.category}: Reflects inner subconscious processing and mental purification.`,
        symbols,
        vedicSignificance:
          "In classical Svapna Shastra, dreams during Brahma Muhurat often mirror energetic transitions and planetary alignments.",
        psychologicalTheme: "Realigning conscious intentions with unresolved emotional desires and spiritual growth.",
        guidance: "Spend 5 minutes in silent gratitude or chanting upon waking to ground the dream's beneficial insights.",
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * FEATURE-06, 08, 11, 12: QUICK COMPATIBILITY & NUMEROLOGY TOOLS
 */
export async function getZodiacCompatibilityAction(signA: string, signB: string) {
  return { success: true, data: calculateZodiacCompatibility(signA, signB) };
}

export async function getFLAMESAction(nameA: string, nameB: string) {
  return { success: true, data: calculateFLAMES(nameA, nameB) };
}

export async function getVehicleNumerologyAction(plateNumber: string) {
  return { success: true, data: calculateVehicleNumerology(plateNumber) };
}

export async function getMobileNumerologyAction(phoneNumber: string) {
  return { success: true, data: calculateMobileNumerology(phoneNumber) };
}

/**
 * FEATURE-14, 15, 16, 17: COMPLETE ADVANCED VEDIC ASTROLOGY CALCULATIONS
 * Centralized calculation engine utilizing high-precision planetary algorithms.
 */
export async function getAdvancedVedicCalculationsAction(params: {
  birthDate: string; // YYYY-MM-DD
  birthTime?: string; // HH:MM
  latitude?: number;
  longitude?: number;
}): Promise<{
  success: boolean;
  data?: {
    kpChart: KPChartResult;
    divisionalCharts: DivisionalChartSignPlacement[];
    shadbala: ShadbalaResult;
    ashtakavarga: AshtakavargaResult;
  };
  error?: string;
}> {
  try {
    const bDate = params.birthDate;
    const bTime = params.birthTime || "12:00";
    const dateObj = new Date(`${bDate}T${bTime}:00Z`);

    if (isNaN(dateObj.getTime())) {
      return { success: false, error: "Invalid birth date or time." };
    }

    // High-precision astronomical planetary ephemeris
    const [year, month, day] = bDate.split("-").map((v) => parseInt(v, 10));
    const [hours, minutes] = bTime.split(":").map((v) => parseInt(v, 10));
    const jd = calculateJulianDay(year, month, day, hours, minutes);
    const ayanamsa = calculateLahiriAyanamsa(jd);
    const astroPositions = calculatePlanetaryPositions(jd, ayanamsa);

    const planetLongitudes: Record<PlanetName, number> = {} as any;
    for (const p of Object.keys(astroPositions) as PlanetName[]) {
      planetLongitudes[p] = astroPositions[p].longitude;
    }

    // Approximate Ascendant (Lagna) based on time of day
    const dayFraction = (hours * 60 + minutes) / 1440;
    const sunLong = planetLongitudes["Sun"] || 0;
    const ascendantDeg = (sunLong + dayFraction * 360) % 360;

    // 1. KP Astrology
    const kpChart = calculateKPChart(planetLongitudes, ascendantDeg, bDate);

    // 2. All 16 Divisional Charts (Shodashvarga D1 to D60)
    const divisionalCharts = calculateAllDivisionalCharts(planetLongitudes, ascendantDeg);

    // 3. Shadbala & Bhavbala
    const shadbala = calculateShadbala(planetLongitudes, ascendantDeg);

    // 4. Ashtakavarga (BAV & SAV 337 bindus)
    const ashtakavarga = calculateAshtakavarga(planetLongitudes, ascendantDeg);

    return {
      success: true,
      data: {
        kpChart,
        divisionalCharts,
        shadbala,
        ashtakavarga,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to calculate advanced Vedic charts." };
  }
}
