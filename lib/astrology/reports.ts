/**
 * Unified Vedic Astrology Report Engine
 * Synthesizes Kundli, Panchang, Numerology, and Remedies
 * into a structured, production-grade consultation report.
 */

import type { BirthDetails, FullAstrologyReport } from "./types";
import {
  calculateJulianDay,
  calculateLahiriAyanamsa,
  calculateAscendant,
  calculatePlanetaryPositions,
} from "./astronomy";
import { buildKundliChart } from "./vedic-core";
import { calculatePanchang } from "./panchang";
import { calculateNumerology } from "./numerology";
import { generateVedicRemedies } from "./remedies";

/**
 * Generates an end-to-end Vedic Astrology Report for any birth record.
 */
export function generateFullAstrologyReport(details: BirthDetails): FullAstrologyReport {
  const [yearStr, monthStr, dayStr] = details.date.split("-");
  const [hourStr, minuteStr] = details.time.split(":");

  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  const localHour = parseInt(hourStr, 10);
  const localMinute = parseInt(minuteStr, 10);

  // Convert local standard time to UTC using location timezone offset
  const tzOffset = details.location.timezoneOffsetHours ?? 5.5; // Default to IST (+5.5)
  let utcDecimalHours = localHour + localMinute / 60.0 - tzOffset;
  let utcDay = day;
  let utcMonth = month;
  let utcYear = year;

  if (utcDecimalHours < 0) {
    utcDecimalHours += 24.0;
    utcDay -= 1;
    if (utcDay < 1) {
      utcMonth -= 1;
      if (utcMonth < 1) {
        utcYear -= 1;
        utcMonth = 12;
      }
      utcDay = 28; // safe baseline
    }
  } else if (utcDecimalHours >= 24) {
    utcDecimalHours -= 24.0;
    utcDay += 1;
  }

  const utcH = Math.floor(utcDecimalHours);
  const utcM = Math.floor((utcDecimalHours - utcH) * 60);

  // 1. Julian Day & Ayanamsa
  const jd = calculateJulianDay(utcYear, utcMonth, utcDay, utcH, utcM);
  const ayanamsa = calculateLahiriAyanamsa(jd);

  // 2. Ascendant (Lagna)
  const nirayanaLagna = calculateAscendant(
    jd,
    details.location.latitude,
    details.location.longitude,
    ayanamsa
  );

  // 3. Planetary positions
  const rawPlanets = calculatePlanetaryPositions(jd, ayanamsa);

  // 4. Kundli chart with Bhavas and Dashas
  const birthDate = new Date(Date.UTC(utcYear, utcMonth - 1, utcDay, utcH, utcM));
  const kundli = buildKundliChart(nirayanaLagna, rawPlanets, ayanamsa, birthDate);

  // 5. Daily Panchang
  const panchang = calculatePanchang(birthDate, details.location);

  // 6. Numerology Profile
  const numerology = calculateNumerology(details.date, details.name || "Seeker");

  // 7. Vedic Remedies
  const remedies = generateVedicRemedies(kundli.ascendant.rashi);

  return {
    generatedAt: new Date().toISOString(),
    subject: {
      name: details.name || "Seeker",
      birthDate: details.date,
      birthTime: details.time,
      birthPlace: details.location.cityName || `${details.location.latitude}°, ${details.location.longitude}°`,
    },
    kundli,
    panchang,
    numerology,
    remedies,
  };
}

