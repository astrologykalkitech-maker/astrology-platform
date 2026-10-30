/**
 * Vedic Core Astrology Engine
 * Implements 12 Rashis, 27 Nakshatras, Navamsa (D9), Planetary Dignities,
 * Vimshottari Mahadasha & Antardasha 120-year cycle calculations.
 */

import type {
  PlanetName,
  RashiName,
  NakshatraName,
  PlanetaryPosition,
  AscendantInfo,
  DashaPeriod,
  KundliChart,
  BhavaCusp,
  TransitAnalysisResult,
} from "./types";
import { normalizeDegrees } from "./astronomy";

export const RASHIS: RashiName[] = [
  "Mesha",
  "Vrishabha",
  "Mithuna",
  "Karka",
  "Simha",
  "Kanya",
  "Tula",
  "Vrishchika",
  "Dhanu",
  "Makara",
  "Kumbha",
  "Meena",
];

export const RASHI_LORDS: Record<RashiName, PlanetName> = {
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

export const NAKSHATRAS: { name: NakshatraName; lord: PlanetName }[] = [
  { name: "Ashwini", lord: "Ketu" },
  { name: "Bharani", lord: "Venus" },
  { name: "Krittika", lord: "Sun" },
  { name: "Rohini", lord: "Moon" },
  { name: "Mrigashira", lord: "Mars" },
  { name: "Ardra", lord: "Rahu" },
  { name: "Punarvasu", lord: "Jupiter" },
  { name: "Pushya", lord: "Saturn" },
  { name: "Ashlesha", lord: "Mercury" },
  { name: "Magha", lord: "Ketu" },
  { name: "Purva Phalguni", lord: "Venus" },
  { name: "Uttara Phalguni", lord: "Sun" },
  { name: "Hasta", lord: "Moon" },
  { name: "Chitra", lord: "Mars" },
  { name: "Swati", lord: "Rahu" },
  { name: "Vishakha", lord: "Jupiter" },
  { name: "Anuradha", lord: "Saturn" },
  { name: "Jyeshtha", lord: "Mercury" },
  { name: "Mula", lord: "Ketu" },
  { name: "Purva Ashadha", lord: "Venus" },
  { name: "Uttara Ashadha", lord: "Sun" },
  { name: "Shravana", lord: "Moon" },
  { name: "Dhanishta", lord: "Mars" },
  { name: "Shatabhisha", lord: "Rahu" },
  { name: "Purva Bhadrapada", lord: "Jupiter" },
  { name: "Uttara Bhadrapada", lord: "Saturn" },
  { name: "Revati", lord: "Mercury" },
];

export const VIMSHOTTARI_YEARS: Record<PlanetName, number> = {
  Ketu: 7,
  Venus: 20,
  Sun: 6,
  Moon: 10,
  Mars: 7,
  Rahu: 18,
  Jupiter: 16,
  Saturn: 19,
  Mercury: 17,
};

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

/**
 * Returns Rashi, Nakshatra, Pada, and degrees within Rashi for a given longitude.
 */
export function getLongitudeDetails(longitude: number) {
  const norm = normalizeDegrees(longitude);
  const rashiIndex = Math.floor(norm / 30);
  const rashi = RASHIS[rashiIndex];
  const degreesInRashi = norm - rashiIndex * 30;

  const nakshatraSpan = 360 / 27; // 13.333333° (13° 20')
  const nakshatraIndex = Math.floor(norm / nakshatraSpan);
  const nakshatra = NAKSHATRAS[nakshatraIndex];

  const degreeInNakshatra = norm - nakshatraIndex * nakshatraSpan;
  const padaSpan = nakshatraSpan / 4; // 3.333333° (3° 20')
  const pada = Math.min(4, Math.floor(degreeInNakshatra / padaSpan) + 1);

  const deg = Math.floor(degreesInRashi);
  const minutesTotal = (degreesInRashi - deg) * 60;
  const mins = Math.floor(minutesTotal);
  const secs = Math.round((minutesTotal - mins) * 60);

  const formattedDegrees = `${deg}° ${mins}' ${secs}"`;

  return {
    rashi,
    rashiNumber: rashiIndex + 1,
    degreesInRashi,
    formattedDegrees,
    nakshatra: nakshatra.name,
    nakshatraNumber: nakshatraIndex + 1,
    pada,
    degreeInNakshatra,
  };
}

/**
 * Calculates the Navamsa (D9) Rashi for a given ecliptic longitude.
 */
export function calculateNavamsaRashi(longitude: number): RashiName {
  const norm = normalizeDegrees(longitude);
  const padaIndex = Math.floor(norm / (360 / 108)); // 108 padas in the zodiac
  const rashiIndex = padaIndex % 12;
  return RASHIS[rashiIndex];
}

/**
 * Evaluates the Dignity of a planet in a sign.
 */
export function getPlanetaryDignity(
  planet: PlanetName,
  rashi: RashiName,
  _degreesInRashi: number
): PlanetaryPosition["dignity"] {
  void _degreesInRashi;
  // Exaltation and Debilitation points
  const EXALTATION: Partial<Record<PlanetName, { rashi: RashiName; deg: number }>> = {
    Sun: { rashi: "Mesha", deg: 10 },
    Moon: { rashi: "Vrishabha", deg: 3 },
    Mars: { rashi: "Makara", deg: 28 },
    Mercury: { rashi: "Kanya", deg: 15 },
    Jupiter: { rashi: "Karka", deg: 5 },
    Venus: { rashi: "Meena", deg: 27 },
    Saturn: { rashi: "Tula", deg: 20 },
    Rahu: { rashi: "Vrishabha", deg: 20 },
    Ketu: { rashi: "Vrishchika", deg: 20 },
  };

  const DEBILITATION: Partial<Record<PlanetName, { rashi: RashiName; deg: number }>> = {
    Sun: { rashi: "Tula", deg: 10 },
    Moon: { rashi: "Vrishchika", deg: 3 },
    Mars: { rashi: "Karka", deg: 28 },
    Mercury: { rashi: "Meena", deg: 15 },
    Jupiter: { rashi: "Makara", deg: 5 },
    Venus: { rashi: "Kanya", deg: 27 },
    Saturn: { rashi: "Mesha", deg: 20 },
    Rahu: { rashi: "Vrishchika", deg: 20 },
    Ketu: { rashi: "Vrishabha", deg: 20 },
  };

  if (EXALTATION[planet]?.rashi === rashi) return "Exalted";
  if (DEBILITATION[planet]?.rashi === rashi) return "Debilitated";
  if (RASHI_LORDS[rashi] === planet) return "Own Sign";

  return "Friendly";
}

/**
 * Generates the full 120-year Vimshottari Mahadasha and Antardasha timeline from Moon longitude and birth date.
 */
export function calculateVimshottariDashas(moonLongitude: number, birthDate: Date): DashaPeriod[] {
  const nakshatraSpan = 360 / 27; // 13.333333°
  const norm = normalizeDegrees(moonLongitude);
  const nakshatraIndex = Math.floor(norm / nakshatraSpan);
  const nakshatra = NAKSHATRAS[nakshatraIndex];
  const degreesElapsed = norm - nakshatraIndex * nakshatraSpan;
  const fractionElapsed = degreesElapsed / nakshatraSpan;
  const balanceFraction = 1.0 - fractionElapsed;

  const firstLord = nakshatra.lord;
  const firstTotalYears = VIMSHOTTARI_YEARS[firstLord];
  const firstBalanceYears = balanceFraction * firstTotalYears;

  const lordIndex = VIMSHOTTARI_ORDER.indexOf(firstLord);
  const dashas: DashaPeriod[] = [];

  let currentDate = new Date(birthDate.getTime());
  const nowMs = Date.now();

  for (let i = 0; i < VIMSHOTTARI_ORDER.length; i++) {
    const currentLord = VIMSHOTTARI_ORDER[(lordIndex + i) % VIMSHOTTARI_ORDER.length];
    const duration = i === 0 ? firstBalanceYears : VIMSHOTTARI_YEARS[currentLord];

    const startDate = new Date(currentDate.getTime());
    const durationMs = duration * 365.2425 * 24 * 3600 * 1000;
    const endDate = new Date(currentDate.getTime() + durationMs);
    currentDate = endDate;

    const isCurrent = nowMs >= startDate.getTime() && nowMs < endDate.getTime();

    // Calculate Antardashas (sub-periods)
    const subPeriods = calculateAntardashas(currentLord, startDate, endDate, nowMs);

    dashas.push({
      planet: currentLord,
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
      durationYears: parseFloat(duration.toFixed(2)),
      isCurrent,
      subPeriods,
    });
  }

  return dashas;
}

/**
 * Calculates 9 Antardashas (sub-periods) within a Mahadasha.
 */
function calculateAntardashas(
  mahaLord: PlanetName,
  mahaStart: Date,
  mahaEnd: Date,
  nowMs: number
) {
  const mahaYears = VIMSHOTTARI_YEARS[mahaLord];
  const startIndex = VIMSHOTTARI_ORDER.indexOf(mahaLord);
  const subPeriods = [];
  let curr = new Date(mahaStart.getTime());

  for (let j = 0; j < 9; j++) {
    const antarLord = VIMSHOTTARI_ORDER[(startIndex + j) % 9];
    const antarYears = VIMSHOTTARI_YEARS[antarLord];
    // Proportion: (MahaYears * AntarYears) / 120
    const fractionYears = (mahaYears * antarYears) / 120.0;
    const spanMs = fractionYears * 365.2425 * 24 * 3600 * 1000;
    const subStart = new Date(curr.getTime());
    const subEnd = new Date(curr.getTime() + spanMs);
    curr = subEnd;

    const isCurrent = nowMs >= subStart.getTime() && nowMs < subEnd.getTime();
    subPeriods.push({
      planet: antarLord,
      startDate: subStart.toISOString().split("T")[0],
      endDate: subEnd.toISOString().split("T")[0],
      isCurrent,
    });
  }

  return subPeriods;
}

/**
 * Builds the complete Kundli Chart structure from calculated astronomical data.
 */
export function buildKundliChart(
  nirayanaLagna: number,
  planetsRaw: Record<PlanetName, { longitude: number; speed: number; isRetrograde: boolean }>,
  ayanamsa: number,
  birthDate: Date
): KundliChart {
  const lagnaDetails = getLongitudeDetails(nirayanaLagna);
  const ascendant: AscendantInfo = {
    longitude: nirayanaLagna,
    rashi: lagnaDetails.rashi,
    rashiNumber: lagnaDetails.rashiNumber,
    degreesInRashi: lagnaDetails.degreesInRashi,
    formattedDegrees: lagnaDetails.formattedDegrees,
    nakshatra: lagnaDetails.nakshatra,
    nakshatraNumber: lagnaDetails.nakshatraNumber,
    pada: lagnaDetails.pada,
    lord: RASHI_LORDS[lagnaDetails.rashi],
  };

  // Build 12 Equal Bhavas starting from Lagna's Rashi
  const houses: BhavaCusp[] = [];
  for (let h = 1; h <= 12; h++) {
    const houseRashiIndex = (lagnaDetails.rashiNumber - 1 + (h - 1)) % 12;
    const cuspLongitude = normalizeDegrees(nirayanaLagna + (h - 1) * 30);
    houses.push({
      houseNumber: h,
      cuspLongitude,
      rashi: RASHIS[houseRashiIndex],
      degreesInRashi: lagnaDetails.degreesInRashi,
      planetsInHouse: [],
    });
  }

  // Populate planetary positions
  const sunLong = planetsRaw.Sun?.longitude ?? 0;
  const planets = {} as Record<PlanetName, PlanetaryPosition>;
  for (const [name, raw] of Object.entries(planetsRaw) as [PlanetName, { longitude: number; speed: number; isRetrograde: boolean }][]) {
    const details = getLongitudeDetails(raw.longitude);
    const navamsaRashi = calculateNavamsaRashi(raw.longitude);
    const dashamsaRashi = calculateDashamsaRashi(raw.longitude);
    const isCombust = calculateCombustionStatus(name, raw.longitude, sunLong, raw.isRetrograde);
    const dignity = getPlanetaryDignity(name, details.rashi, details.degreesInRashi);

    // Determine house relative to Lagna
    let houseNumber = details.rashiNumber - lagnaDetails.rashiNumber + 1;
    if (houseNumber <= 0) houseNumber += 12;

    houses[houseNumber - 1].planetsInHouse.push(name);

    planets[name] = {
      name,
      longitude: raw.longitude,
      speed: raw.speed,
      isRetrograde: raw.isRetrograde,
      rashi: details.rashi,
      rashiNumber: details.rashiNumber,
      degreesInRashi: details.degreesInRashi,
      formattedDegrees: details.formattedDegrees,
      nakshatra: details.nakshatra,
      nakshatraNumber: details.nakshatraNumber,
      pada: details.pada,
      house: houseNumber,
      dignity,
      navamsaRashi,
      dashamsaRashi,
      isCombust,
    };
  }

  const dashas = calculateVimshottariDashas(planets.Moon.longitude, birthDate);
  const currentMaha = dashas.find((d) => d.isCurrent);
  const currentAntar = currentMaha?.subPeriods?.find((s) => s.isCurrent);

  return {
    ayanamsa,
    ascendant,
    planets,
    houses,
    moonSign: planets.Moon.rashi,
    sunSign: planets.Sun.rashi,
    birthNakshatra: planets.Moon.nakshatra,
    birthPada: planets.Moon.pada,
    dashas,
    currentDasha:
      currentMaha && currentAntar
        ? {
            mahadasha: currentMaha.planet,
            antardasha: currentAntar.planet,
            endDate: currentAntar.endDate,
          }
        : undefined,
  };
}

/**
 * Calculates D10 Dashamsa Rashi (Mahaphal/Profession chart).
 * In Vedic astrology, each 30° sign is divided into 10 parts of 3° each.
 * For odd signs: counting starts from the sign itself.
 * For even signs: counting starts from the 9th sign from it.
 */
export function calculateDashamsaRashi(longitude: number): RashiName {
  const norm = normalizeDegrees(longitude);
  const rashiIndex = Math.floor(norm / 30); // 0 to 11
  const degInRashi = norm % 30;
  const part = Math.floor(degInRashi / 3); // 0 to 9

  const isOddSign = rashiIndex % 2 === 0; // Mesha (0), Mithuna (2), etc.
  const startRashiIndex = isOddSign ? rashiIndex : (rashiIndex + 8) % 12;
  const dashamsaIndex = (startRashiIndex + part) % 12;

  return RASHIS[dashamsaIndex];
}

/**
 * Determines whether a planet is Combust (Asta) due to proximity to the Sun.
 */
export function calculateCombustionStatus(
  planet: PlanetName,
  planetLongitude: number,
  sunLongitude: number,
  isRetrograde = false
): boolean {
  if (planet === "Sun" || planet === "Rahu" || planet === "Ketu") {
    return false;
  }

  let diff = Math.abs(normalizeDegrees(planetLongitude) - normalizeDegrees(sunLongitude));
  if (diff > 180) diff = 360 - diff;

  const COMBUSTION_LIMITS: Record<string, number> = {
    Moon: 12,
    Mars: 17,
    Mercury: isRetrograde ? 12 : 14,
    Jupiter: 11,
    Venus: isRetrograde ? 8 : 10,
    Saturn: 15,
  };

  const limit = COMBUSTION_LIMITS[planet] ?? 12;
  return diff <= limit;
}

/**
 * Calculates planetary transits (Gochar) relative to natal Moon (Chandra Lagna),
 * including Sade Sati, Ashtama Shani, Kantaka Shani, and Jupiter transits.
 */
export function calculateGocharTransits(
  natalMoonRashi: RashiName,
  transitPlanets: Record<PlanetName, { rashi: RashiName }>
): TransitAnalysisResult {
  const moonRashiIndex = RASHIS.indexOf(natalMoonRashi);

  const getHouseFromMoon = (planetRashi: RashiName): number => {
    const pIndex = RASHIS.indexOf(planetRashi);
    let house = pIndex - moonRashiIndex + 1;
    if (house <= 0) house += 12;
    return house;
  };

  const saturnHouse = getHouseFromMoon(transitPlanets.Saturn.rashi);
  const jupiterHouse = getHouseFromMoon(transitPlanets.Jupiter.rashi);

  const isSadeSati = saturnHouse === 12 || saturnHouse === 1 || saturnHouse === 2;
  const sadeSatiPhase =
    saturnHouse === 12 ? "Rising" : saturnHouse === 1 ? "Peak" : saturnHouse === 2 ? "Setting" : undefined;
  const isAshtamaShani = saturnHouse === 8;
  const isKantakaShani = saturnHouse === 4;

  const isJupiterFavorable = [2, 5, 7, 9, 11].includes(jupiterHouse);

  const transits = (Object.entries(transitPlanets) as [PlanetName, { rashi: RashiName }][]).map(
    ([planet, data]) => {
      const house = getHouseFromMoon(data.rashi);
      let effect: "Favorable" | "Challenging" | "Neutral" = "Neutral";
      let description = `${planet} transiting House ${house} from natal Moon.`;

      if (planet === "Jupiter") {
        effect = isJupiterFavorable ? "Favorable" : "Neutral";
        description = isJupiterFavorable
          ? `Guru Gochar in house ${house} brings divine blessings and wisdom.`
          : `Jupiter transiting house ${house} calls for spiritual discipline.`;
      } else if (planet === "Saturn") {
        effect = isSadeSati || isAshtamaShani ? "Challenging" : [3, 6, 11].includes(house) ? "Favorable" : "Neutral";
        description = isSadeSati
          ? `Saturn Sade Sati (${sadeSatiPhase} phase) in house ${house} prompts karmic realignment.`
          : [3, 6, 11].includes(house)
          ? `Shani Gochar in Upachaya house yields perseverance and victory.`
          : `Saturn transiting house ${house} promotes patience and reflection.`;
      }

      return {
        planet,
        transitRashi: data.rashi,
        houseFromMoon: house,
        effect,
        description,
      };
    }
  );

  return {
    natalMoonRashi,
    saturnTransitHouse: saturnHouse,
    isSadeSati,
    sadeSatiPhase,
    isAshtamaShani,
    isKantakaShani,
    jupiterTransitHouse: jupiterHouse,
    isJupiterFavorable,
    transits,
  };
}

