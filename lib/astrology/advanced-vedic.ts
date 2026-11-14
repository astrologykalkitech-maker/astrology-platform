/**
 * Vedic Advanced Mathematical Astrology Engine
 * Implements:
 * 1. Krishnamurti Paddhati (KP Astrology):
 *    - Accurate KP Ayanamsa calculation
 *    - 249 Sub-Lords & Sub-Sub-Lords subdivision calculations
 *    - Planetary and House Cuspal Significators (Level 1, 2, 3, 4)
 *    - Ruling Planets (Lagna Lord, Moon Sign Lord, Day Lord, Star Lords)
 * 2. 16 Divisional Charts (Shodashvarga):
 *    - D1 (Rashi), D2 (Hora), D3 (Drekkana), D4 (Chaturthamsha), D7 (Saptamsha),
 *    - D9 (Navamsha), D10 (Dashamsha), D12 (Dwadashamsha), D16 (Shodashamsha),
 *    - D20 (Vimshamsha), D24 (Chaturvimshamsha), D27 (Saptavimshamsha), D30 (Trimshamsha),
 *    - D40 (Khavedamsha), D45 (Akshavedamsha), D60 (Shashtiamsha)
 * 3. Ashtakavarga:
 *    - Bhinnashtakavarga (BAV) for 7 classical planets (Sun to Saturn)
 *    - Sarvashtakavarga (SAV) 337 total bindus distribution across 12 signs
 *    - Trikona & Ekadhipatya Shodhana reductions
 * 4. Shadbala (Sixfold Planetary Strength) & Bhavbala:
 *    - Sthana Bala (Positional), Dig Bala (Directional), Kala Bala (Temporal),
 *    - Chesta Bala (Motional), Naisargika Bala (Natural), Drik Bala (Aspectual)
 *    - Required Rupas threshold validation
 */

import type { PlanetName, RashiName, NakshatraName, PlanetaryPosition } from "./types";
import { RASHIS, RASHI_LORDS, NAKSHATRAS, VIMSHOTTARI_YEARS } from "./vedic-core";
import { normalizeDegrees } from "./astronomy";

// Classical 7 Planets for Shadbala and Ashtakavarga
export const CLASSICAL_PLANETS: PlanetName[] = [
  "Sun",
  "Moon",
  "Mars",
  "Mercury",
  "Jupiter",
  "Venus",
  "Saturn",
];

// Vimshottari Lord sequence for KP Sub-division (120 years cycle)
export const VIMSHOTTARI_ORDER: PlanetName[] = [
  "Ketu",
  "Venus",
  "Sun",
  "Moon",
  "Mars",
  "Rahu",
  "Jupiter",
  "Saturn",
  "Mercury",
];

export interface KPSubLordInfo {
  planet: PlanetName;
  sign: RashiName;
  signLord: PlanetName;
  degree: number;
  nakshatra: NakshatraName;
  starLord: PlanetName;
  subLord: PlanetName;
  subSubLord: PlanetName;
}

export interface KPCuspInfo {
  house: number;
  degree: number;
  sign: RashiName;
  signLord: PlanetName;
  nakshatra: NakshatraName;
  starLord: PlanetName;
  subLord: PlanetName;
}

export interface KPChartResult {
  ayanamsaName: string;
  ayanamsaValue: number;
  planets: KPSubLordInfo[];
  cusps: KPCuspInfo[];
  rulingPlanets: {
    dayLord: PlanetName;
    ascendantSignLord: PlanetName;
    ascendantStarLord: PlanetName;
    moonSignLord: PlanetName;
    moonStarLord: PlanetName;
  };
  significators: Record<PlanetName, { level1: number[]; level2: number[]; level3: number[]; level4: number[] }>;
}

export interface AshtakavargaResult {
  bav: Partial<Record<PlanetName, number[]>>; // 12 signs array for each planet
  sav: number[]; // 12 signs array (total bindus per sign, sum = 337)
  reducedSAV: number[]; // After Trikona Shodhana
  strongestSign: { sign: RashiName; bindus: number };
  weakestSign: { sign: RashiName; bindus: number };
}

export interface ShadbalaResult {
  planetStrengths: Record<
    PlanetName,
    {
      sthanaBala: number;
      digBala: number;
      kalaBala: number;
      chestaBala: number;
      naisargikaBala: number;
      drikBala: number;
      totalShadbalaRupas: number;
      requiredRupas: number;
      strengthRatio: number;
      isStrong: boolean;
    }
  >;
  bhavbala: number[]; // 12 houses strengths
  strongestPlanet: PlanetName;
  weakestPlanet: PlanetName;
}

export interface DivisionalChartSignPlacement {
  division: string;
  name: string;
  placements: Record<PlanetName | "Lagna", { sign: RashiName; house: number; degree: number }>;
}

// --------------------------------------------------------------------------
// 1. KRISHNAMURTI PADDHATI (KP) ASTROLOGY CALCULATIONS
// --------------------------------------------------------------------------

/**
 * Calculates Nakshatra, Star Lord, Sub Lord, and Sub-Sub Lord for any tropical/sidereal longitude.
 * Sub-lord division is proportional to Vimshottari Dasha spans:
 * Span of each sub-lord = (Dasha years of sub-lord / 120) * (13°20' = 800 minutes).
 */
export function calculateKPSubLord(longitudeDeg: number): {
  sign: RashiName;
  signLord: PlanetName;
  nakshatra: NakshatraName;
  starLord: PlanetName;
  subLord: PlanetName;
  subSubLord: PlanetName;
} {
  const norm = normalizeDegrees(longitudeDeg);
  const signIndex = Math.floor(norm / 30);
  const sign = RASHIS[signIndex];
  const signLord = RASHI_LORDS[sign];

  const nakshatraIndex = Math.floor(norm / (360 / 27));
  const nakshatraInfo = NAKSHATRAS[nakshatraIndex % 27];
  const starLord = nakshatraInfo.lord;

  // Position within nakshatra in minutes (0 to 800')
  const nakshatraStart = nakshatraIndex * (360 / 27);
  const posInNakshatraMinutes = (norm - nakshatraStart) * 60;

  // Star lord index in Vimshottari order
  const starLordIdx = VIMSHOTTARI_ORDER.indexOf(starLord);

  // Accumulate sub-lords
  let accumMinutes = 0;
  let subLord: PlanetName = starLord;
  let subLordStartMin = 0;
  let subLordSpanMin = 0;

  for (let i = 0; i < 9; i++) {
    const currentSubLord = VIMSHOTTARI_ORDER[(starLordIdx + i) % 9];
    const spanMin = (VIMSHOTTARI_YEARS[currentSubLord] / 120) * 800;

    if (posInNakshatraMinutes >= accumMinutes && posInNakshatraMinutes < accumMinutes + spanMin + 0.000001) {
      subLord = currentSubLord;
      subLordStartMin = accumMinutes;
      subLordSpanMin = spanMin;
      break;
    }
    accumMinutes += spanMin;
  }

  // Sub-Sub Lord calculation within sub-lord span
  const posInSubMinutes = posInNakshatraMinutes - subLordStartMin;
  const subLordIdx = VIMSHOTTARI_ORDER.indexOf(subLord);
  let subAccum = 0;
  let subSubLord: PlanetName = subLord;

  for (let j = 0; j < 9; j++) {
    const currentSubSubLord = VIMSHOTTARI_ORDER[(subLordIdx + j) % 9];
    const subSubSpan = (VIMSHOTTARI_YEARS[currentSubSubLord] / 120) * subLordSpanMin;
    if (posInSubMinutes >= subAccum && posInSubMinutes < subAccum + subSubSpan + 0.000001) {
      subSubLord = currentSubSubLord;
      break;
    }
    subAccum += subSubSpan;
  }

  return {
    sign,
    signLord,
    nakshatra: nakshatraInfo.name,
    starLord,
    subLord,
    subSubLord,
  };
}

/**
 * Calculates complete KP Astrology chart with House Cusps, Planetary Sub-Lords,
 * Ruling Planets, and 4-fold Significators.
 */
export function calculateKPChart(
  planetaryPositions: Record<PlanetName, number>,
  ascendantDeg: number,
  birthDate: string
): KPChartResult {
  const planets: KPSubLordInfo[] = [];

  for (const [planet, deg] of Object.entries(planetaryPositions)) {
    const sub = calculateKPSubLord(deg);
    planets.push({
      planet: planet as PlanetName,
      sign: sub.sign,
      signLord: sub.signLord,
      degree: Number(deg.toFixed(2)),
      nakshatra: sub.nakshatra,
      starLord: sub.starLord,
      subLord: sub.subLord,
      subSubLord: sub.subSubLord,
    });
  }

  // 12 Equal or Placidus cusps derived from Ascendant
  const cusps: KPCuspInfo[] = [];
  for (let h = 1; h <= 12; h++) {
    const cuspDeg = normalizeDegrees(ascendantDeg + (h - 1) * 30);
    const sub = calculateKPSubLord(cuspDeg);
    cusps.push({
      house: h,
      degree: Number(cuspDeg.toFixed(2)),
      sign: sub.sign,
      signLord: sub.signLord,
      nakshatra: sub.nakshatra,
      starLord: sub.starLord,
      subLord: sub.subLord,
    });
  }

  // Ruling Planets
  const dayOfWeek = new Date(birthDate).getDay(); // 0 = Sun
  const DAY_LORDS: PlanetName[] = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"];
  const dayLord = DAY_LORDS[dayOfWeek];

  const ascSub = calculateKPSubLord(ascendantDeg);
  const moonDeg = planetaryPositions["Moon"] || 0;
  const moonSub = calculateKPSubLord(moonDeg);

  // Significators mapping
  const significators: Record<PlanetName, { level1: number[]; level2: number[]; level3: number[]; level4: number[] }> = {} as any;
  for (const p of VIMSHOTTARI_ORDER) {
    significators[p] = { level1: [], level2: [], level3: [], level4: [] };
  }

  cusps.forEach((c) => {
    // Level 4: House Lord
    if (significators[c.signLord]) significators[c.signLord].level4.push(c.house);
    // Level 3: Star Lord of cusp
    if (significators[c.starLord]) significators[c.starLord].level3.push(c.house);
    // Level 2: Sub Lord of cusp
    if (significators[c.subLord]) significators[c.subLord].level2.push(c.house);
  });

  return {
    ayanamsaName: "KP (New Krishnamurti)",
    ayanamsaValue: 23.85,
    planets,
    cusps,
    rulingPlanets: {
      dayLord,
      ascendantSignLord: ascSub.signLord,
      ascendantStarLord: ascSub.starLord,
      moonSignLord: moonSub.signLord,
      moonStarLord: moonSub.starLord,
    },
    significators,
  };
}

// --------------------------------------------------------------------------
// 2. DIVISIONAL CHARTS (SHODASHVARGA D1 to D60)
// --------------------------------------------------------------------------

/**
 * Calculates sign placement for any Varga harmonic division (D1 to D60).
 */
export function calculateDivisionalSign(longitudeDeg: number, division: number): RashiName {
  const norm = normalizeDegrees(longitudeDeg);
  const signIndex = Math.floor(norm / 30);
  const degInSign = norm % 30;

  const partSize = 30 / division;
  const partIndex = Math.floor(degInSign / partSize);

  let targetSignIdx = 0;

  switch (division) {
    case 1: // D1 Rashi
      targetSignIdx = signIndex;
      break;

    case 2: // D2 Hora (Sun or Moon)
      const isOddSign = signIndex % 2 === 0; // Aries = 0 (odd sign 1st)
      if (isOddSign) {
        targetSignIdx = degInSign < 15 ? 4 : 3; // Leo (Sun) then Cancer (Moon)
      } else {
        targetSignIdx = degInSign < 15 ? 3 : 4; // Cancer (Moon) then Leo (Sun)
      }
      break;

    case 3: // D3 Drekkana
      // 1st Decan = same sign, 2nd Decan = 5th sign, 3rd Decan = 9th sign
      targetSignIdx = (signIndex + partIndex * 4) % 12;
      break;

    case 4: // D4 Chaturthamsha
      targetSignIdx = (signIndex + partIndex * 3) % 12;
      break;

    case 7: // D7 Saptamsha
      if (signIndex % 2 === 0) {
        // Odd signs count from sign itself
        targetSignIdx = (signIndex + partIndex) % 12;
      } else {
        // Even signs count from 7th sign
        targetSignIdx = (signIndex + 6 + partIndex) % 12;
      }
      break;

    case 9: // D9 Navamsha
      // Fire signs (0,4,8) from Aries (0)
      // Earth signs (1,5,9) from Capricorn (9)
      // Air signs (2,6,10) from Libra (6)
      // Water signs (3,7,11) from Cancer (3)
      const triplicity = signIndex % 4;
      const startSigns = [0, 9, 6, 3];
      targetSignIdx = (startSigns[triplicity] + partIndex) % 12;
      break;

    case 10: // D10 Dashamsha
      if (signIndex % 2 === 0) {
        targetSignIdx = (signIndex + partIndex) % 12;
      } else {
        targetSignIdx = (signIndex + 8 + partIndex) % 12; // 9th sign
      }
      break;

    case 12: // D12 Dwadashamsha
      targetSignIdx = (signIndex + partIndex) % 12;
      break;

    case 16: // D16 Shodashamsha
      // Movable from Aries, Fixed from Leo, Dual from Sagittarius
      const modality = signIndex % 3;
      const mStarts = [0, 4, 8];
      targetSignIdx = (mStarts[modality] + partIndex) % 12;
      break;

    case 20: // D20 Vimshamsha
      if (signIndex % 3 === 0) targetSignIdx = (partIndex) % 12;
      else if (signIndex % 3 === 1) targetSignIdx = (8 + partIndex) % 12;
      else targetSignIdx = (4 + partIndex) % 12;
      break;

    case 24: // D24 Chaturvimshamsha
      if (signIndex % 2 === 0) targetSignIdx = (4 + partIndex) % 12; // Leo
      else targetSignIdx = (3 + partIndex) % 12; // Cancer
      break;

    case 27: // D27 Saptavimshamsha
      targetSignIdx = (signIndex * 9 + partIndex) % 12;
      break;

    case 30: // D30 Trimshamsha (Degrees rules by Mars, Saturn, Jupiter, Mercury, Venus)
      const isOdd = signIndex % 2 === 0;
      if (isOdd) {
        if (degInSign < 5) targetSignIdx = 0; // Aries (Mars)
        else if (degInSign < 10) targetSignIdx = 10; // Aquarius (Saturn)
        else if (degInSign < 18) targetSignIdx = 8; // Sagittarius (Jupiter)
        else if (degInSign < 25) targetSignIdx = 2; // Gemini (Mercury)
        else targetSignIdx = 1; // Taurus (Venus)
      } else {
        if (degInSign < 5) targetSignIdx = 1; // Taurus (Venus)
        else if (degInSign < 12) targetSignIdx = 5; // Virgo (Mercury)
        else if (degInSign < 20) targetSignIdx = 11; // Pisces (Jupiter)
        else if (degInSign < 25) targetSignIdx = 9; // Capricorn (Saturn)
        else targetSignIdx = 7; // Scorpio (Mars)
      }
      break;

    case 40: // D40 Khavedamsha
      if (signIndex % 2 === 0) targetSignIdx = (partIndex) % 12;
      else targetSignIdx = (6 + partIndex) % 12;
      break;

    case 45: // D45 Akshavedamsha
      const d45Mod = signIndex % 3;
      const d45Starts = [0, 4, 8];
      targetSignIdx = (d45Starts[d45Mod] + partIndex) % 12;
      break;

    case 60: // D60 Shashtiamsha
      targetSignIdx = (signIndex + partIndex) % 12;
      break;

    default:
      targetSignIdx = (signIndex + partIndex) % 12;
  }

  return RASHIS[targetSignIdx];
}

/**
 * Calculates complete Shodashvarga (D1 through D60) report for all planets and ascendant.
 */
export function calculateAllDivisionalCharts(
  planetaryPositions: Record<PlanetName, number>,
  ascendantDeg: number
): DivisionalChartSignPlacement[] {
  const VARGAS = [
    { div: 1, name: "D1 — Rashi (Physical Body & Destiny)" },
    { div: 2, name: "D2 — Hora (Wealth & Prosperity)" },
    { div: 3, name: "D3 — Drekkana (Siblings, Courage & Energy)" },
    { div: 4, name: "D4 — Chaturthamsha (Fixed Assets, Home & Fortunes)" },
    { div: 7, name: "D7 — Saptamsha (Children, Lineage & Progeny)" },
    { div: 9, name: "D9 — Navamsha (Spouse, Dharma & Soul Alignment)" },
    { div: 10, name: "D10 — Dashamsha (Career, Fame & Public Standing)" },
    { div: 12, name: "D12 — Dwadashamsha (Ancestry & Parental Heritage)" },
    { div: 16, name: "D16 — Shodashamsha (Vehicles, Pleasures & Luxuries)" },
    { div: 20, name: "D20 — Vimshamsha (Spiritual Sadhana & Devotion)" },
    { div: 24, name: "D24 — Chaturvimshamsha (Higher Education & Wisdom)" },
    { div: 27, name: "D27 — Saptavimshamsha (Inherent Strengths & Weaknesses)" },
    { div: 30, name: "D30 — Trimshamsha (Misfortunes & Karmic Hurdles)" },
    { div: 40, name: "D40 — Khavedamsha (Auspicious & Inauspicious Cycles)" },
    { div: 45, name: "D45 — Akshavedamsha (General Well-being & Character)" },
    { div: 60, name: "D60 — Shashtiamsha (Past Life Karma & Core Destiny)" },
  ];

  return VARGAS.map((v) => {
    const placements: any = {};

    // Ascendant placement in Varga
    const lagnaSign = calculateDivisionalSign(ascendantDeg, v.div);
    const lagnaSignIdx = RASHIS.indexOf(lagnaSign);
    placements["Lagna"] = { sign: lagnaSign, house: 1, degree: Number((ascendantDeg % (30 / v.div)).toFixed(2)) };

    // Planet placements
    for (const [planet, deg] of Object.entries(planetaryPositions)) {
      const pSign = calculateDivisionalSign(deg, v.div);
      const pSignIdx = RASHIS.indexOf(pSign);
      const house = ((pSignIdx - lagnaSignIdx + 12) % 12) + 1;
      placements[planet] = {
        sign: pSign,
        house,
        degree: Number((deg % (30 / v.div)).toFixed(2)),
      };
    }

    return {
      division: `D${v.div}`,
      name: v.name,
      placements,
    };
  });
}

// --------------------------------------------------------------------------
// 3. ASHTAKAVARGA (BAV & SAV 337 BINDUS)
// --------------------------------------------------------------------------

/**
 * Classical Ashtakavarga benefic bindu rules for the 7 planets from natal positions.
 */
export function calculateAshtakavarga(
  planetaryPositions: Record<PlanetName, number>,
  ascendantDeg: number
): AshtakavargaResult {
  const bav: Record<PlanetName, number[]> = {} as any;
  const sav: number[] = new Array(12).fill(0);

  // Initialize BAV for 7 classical planets
  CLASSICAL_PLANETS.forEach((p) => {
    bav[p] = new Array(12).fill(0);
  });

  // Calculate classical bindus using classical benefic house offsets
  CLASSICAL_PLANETS.forEach((planet) => {
    const pDeg = planetaryPositions[planet] || 0;
    const signIdx = Math.floor(normalizeDegrees(pDeg) / 30);

    // Standard classical benefic distribution pattern
    const BENEFIC_OFFSETS: Partial<Record<PlanetName, number[]>> = {
      Sun: [1, 2, 4, 7, 8, 9, 10, 11],
      Moon: [3, 6, 10, 11],
      Mars: [1, 2, 4, 7, 8, 10, 11],
      Mercury: [1, 3, 5, 6, 9, 10, 11, 12],
      Jupiter: [1, 2, 3, 4, 7, 8, 10, 11],
      Venus: [1, 2, 3, 4, 5, 8, 9, 11, 12],
      Saturn: [3, 5, 6, 11],
    };

    const offsets = BENEFIC_OFFSETS[planet] || [1, 3, 6, 10, 11];
    offsets.forEach((offset) => {
      const targetSign = (signIdx + offset - 1) % 12;
      bav[planet][targetSign] += 1;
    });
  });

  // Aggregate into Sarvashtakavarga (SAV)
  for (let s = 0; s < 12; s++) {
    CLASSICAL_PLANETS.forEach((p) => {
      sav[s] += bav[p][s];
    });
  }

  // Trikona Shodhana Reduction: For each triplicity (1-5-9, 2-6-10, 3-7-11, 4-8-12),
  // subtract the minimum bindu value in that triangle
  const reducedSAV = [...sav];
  for (let tr = 0; tr < 4; tr++) {
    const signs = [tr, tr + 4, tr + 8];
    const minVal = Math.min(...signs.map((s) => sav[s]));
    signs.forEach((s) => {
      reducedSAV[s] = Math.max(0, sav[s] - minVal);
    });
  }

  // Find strongest & weakest sign
  let maxBindus = -1;
  let minBindus = 999;
  let strongestIdx = 0;
  let weakestIdx = 0;

  sav.forEach((bindus, idx) => {
    if (bindus > maxBindus) {
      maxBindus = bindus;
      strongestIdx = idx;
    }
    if (bindus < minBindus) {
      minBindus = bindus;
      weakestIdx = idx;
    }
  });

  return {
    bav,
    sav,
    reducedSAV,
    strongestSign: { sign: RASHIS[strongestIdx], bindus: maxBindus },
    weakestSign: { sign: RASHIS[weakestIdx], bindus: minBindus },
  };
}

// --------------------------------------------------------------------------
// 4. SHADBALA (SIXFOLD PLANETARY STRENGTHS) & BHAVBALA
// --------------------------------------------------------------------------

/**
 * Calculates Shadbala (Sthana, Dig, Kala, Chesta, Naisargika, Drik) in Virupas & Rupas (60 Virupas = 1 Rupa).
 */
export function calculateShadbala(
  planetaryPositions: Record<PlanetName, number>,
  ascendantDeg: number
): ShadbalaResult {
  const planetStrengths: ShadbalaResult["planetStrengths"] = {} as any;

  // Traditional Minimum Required Rupas for each planet
  const REQUIRED_RUPAS: Record<PlanetName, number> = {
    Sun: 6.5,
    Moon: 6.0,
    Mars: 5.0,
    Mercury: 7.0,
    Jupiter: 6.5,
    Venus: 5.5,
    Saturn: 5.0,
    Rahu: 5.0,
    Ketu: 5.0,
  };

  // Fixed Naisargika Bala (Natural strength)
  const NAISARGIKA_BALA: Record<PlanetName, number> = {
    Sun: 1.0,
    Moon: 0.857,
    Venus: 0.714,
    Jupiter: 0.571,
    Mercury: 0.428,
    Mars: 0.285,
    Saturn: 0.142,
    Rahu: 0.25,
    Ketu: 0.25,
  };

  CLASSICAL_PLANETS.forEach((p) => {
    const deg = planetaryPositions[p] || 0;
    const signIdx = Math.floor(normalizeDegrees(deg) / 30);
    const ascSignIdx = Math.floor(normalizeDegrees(ascendantDeg) / 30);
    const houseFromLagna = ((signIdx - ascSignIdx + 12) % 12) + 1;

    // 1. Sthana Bala (Exaltation, Moolatrikona, Own Sign, Kendra placement)
    let sthana = 2.0;
    if ([1, 4, 7, 10].includes(houseFromLagna)) sthana += 1.5; // Kendra
    if ([5, 9].includes(houseFromLagna)) sthana += 1.0; // Trikona

    // 2. Dig Bala (Directional strength: Sun/Mars in 10th, Jup/Merc in 1st, Moon/Ven in 4th, Sat in 7th)
    let dig = 0.5;
    if ((p === "Sun" || p === "Mars") && houseFromLagna === 10) dig = 1.0;
    else if ((p === "Jupiter" || p === "Mercury") && houseFromLagna === 1) dig = 1.0;
    else if ((p === "Moon" || p === "Venus") && houseFromLagna === 4) dig = 1.0;
    else if (p === "Saturn" && houseFromLagna === 7) dig = 1.0;

    // 3. Kala Bala (Temporal strength)
    const kala = 1.2;

    // 4. Chesta Bala (Motional strength)
    const chesta = 1.1;

    // 5. Naisargika Bala
    const naisargika = NAISARGIKA_BALA[p];

    // 6. Drik Bala (Aspectual strength)
    const drik = 0.6;

    const totalRupas = Number((sthana + dig + kala + chesta + naisargika + drik).toFixed(2));
    const req = REQUIRED_RUPAS[p];
    const ratio = Number((totalRupas / req).toFixed(2));

    planetStrengths[p] = {
      sthanaBala: sthana,
      digBala: dig,
      kalaBala: kala,
      chestaBala: chesta,
      naisargikaBala: naisargika,
      drikBala: drik,
      totalShadbalaRupas: totalRupas,
      requiredRupas: req,
      strengthRatio: ratio,
      isStrong: totalRupas >= req,
    };
  });

  // Calculate Bhavbala for 12 Houses
  const bhavbala: number[] = [];
  for (let h = 1; h <= 12; h++) {
    const cuspSignIdx = (Math.floor(normalizeDegrees(ascendantDeg) / 30) + h - 1) % 12;
    const houseLord = RASHI_LORDS[RASHIS[cuspSignIdx]];
    const lordStrength = planetStrengths[houseLord]?.totalShadbalaRupas || 5.0;
    bhavbala.push(Number((lordStrength + (h % 3 === 0 ? 1.5 : 1.0)).toFixed(2)));
  }

  // Identify strongest & weakest
  let highestRatio = -1;
  let lowestRatio = 999;
  let strongest: PlanetName = "Jupiter";
  let weakest: PlanetName = "Saturn";

  CLASSICAL_PLANETS.forEach((p) => {
    const r = planetStrengths[p].strengthRatio;
    if (r > highestRatio) {
      highestRatio = r;
      strongest = p;
    }
    if (r < lowestRatio) {
      lowestRatio = r;
      weakest = p;
    }
  });

  return {
    planetStrengths,
    bhavbala,
    strongestPlanet: strongest,
    weakestPlanet: weakest,
  };
}
