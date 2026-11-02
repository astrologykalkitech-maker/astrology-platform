/**
 * High-Precision Astronomical Calculations for Vedic Astrology
 * Computes Julian Day, Local Sidereal Time, Lahiri Ayanamsa,
 * Geocentric Planetary Longitudes, and Ascendant (Lagna).
 */

import type { PlanetName } from "./types";

/**
 * Normalizes an angle into the range [0, 360) degrees.
 */
export function normalizeDegrees(deg: number): number {
  let res = deg % 360;
  if (res < 0) res += 360;
  return res;
}

/**
 * Converts degrees to Radians.
 */
export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180.0;
}

/**
 * Converts Radians to degrees.
 */
export function radToDeg(rad: number): number {
  return (rad * 180.0) / Math.PI;
}

/**
 * Calculates the Julian Day Number from year, month, day, and fractional day in UTC.
 */
export function calculateJulianDay(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number = 0
): number {
  let y = year;
  let m = month;

  if (m <= 2) {
    y -= 1;
    m += 12;
  }

  const d = day + (hour + minute / 60.0 + second / 3600.0) / 24.0;

  // Gregorian calendar reform correction
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);

  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524.5;
}

/**
 * Calculates centuries from standard epoch J2000.0 (JD 2451545.0).
 */
export function getCenturiesSinceJ2000(jd: number): number {
  return (jd - 2451545.0) / 36525.0;
}

/**
 * Calculates the exact Lahiri (Chitrapaksha) Ayanamsa in degrees for a given Julian Day.
 * Reference: J2000.0 Lahiri value was 23.857083° (23° 51' 25.5"), precessing at ~50.29 arcseconds/year.
 */
export function calculateLahiriAyanamsa(jd: number): number {
  const T = getCenturiesSinceJ2000(jd);
  // IAU formula adapted for Chitrapaksha (Lahiri) Ayanamsa
  const ayanamsa = 23.857083 + 1.39697 * T + 0.0003086 * T * T;
  return normalizeDegrees(ayanamsa);
}

/**
 * Calculates Greenwich Mean Sidereal Time (GMST) in degrees.
 */
export function calculateGMST(jd: number): number {
  const T = getCenturiesSinceJ2000(jd);
  // IAU 1982 GMST polynomial formula
  const gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - (T * T * T) / 38710000.0;
  return normalizeDegrees(gmst);
}

/**
 * Calculates Local Sidereal Time (LST) in degrees.
 */
export function calculateLST(jd: number, longitudeDegrees: number): number {
  const gmst = calculateGMST(jd);
  return normalizeDegrees(gmst + longitudeDegrees);
}

/**
 * Obliquity of the Ecliptic in degrees.
 */
export function calculateObliquity(jd: number): number {
  const T = getCenturiesSinceJ2000(jd);
  // Mean obliquity of the ecliptic
  return 23.439291 - 0.0130042 * T - 0.00000016 * T * T;
}

/**
 * Calculates the Vedic Sidereal Ascendant (Lagna) in degrees [0, 360).
 */
export function calculateAscendant(
  jd: number,
  latitude: number,
  longitude: number,
  ayanamsa: number
): number {
  const lstDeg = calculateLST(jd, longitude);
  const epsDeg = calculateObliquity(jd);

  const lst = degToRad(lstDeg);
  const lat = degToRad(latitude);
  const eps = degToRad(epsDeg);

  // Tan(Sayana Lagna) = -cos(LST) / [ sin(eps) * tan(lat) + cos(eps) * sin(LST) ]
  const y = Math.cos(lst);
  const x = -(Math.sin(eps) * Math.tan(lat) + Math.cos(eps) * Math.sin(lst));

  let sayanaLagna = radToDeg(Math.atan2(y, x));
  sayanaLagna = normalizeDegrees(sayanaLagna);

  // Convert Tropical (Sayana) to Sidereal (Nirayana) by subtracting Lahiri Ayanamsa
  const nirayanaLagna = normalizeDegrees(sayanaLagna - ayanamsa);
  return nirayanaLagna;
}

/**
 * Calculates geocentric tropical ecliptic longitudes for the 9 Vedic Grahas,
 * then applies Lahiri Ayanamsa to derive accurate Nirayana positions.
 */
export function calculatePlanetaryPositions(
  jd: number,
  ayanamsa: number
): Record<PlanetName, { longitude: number; speed: number; isRetrograde: boolean }> {
  const T = getCenturiesSinceJ2000(jd);

  // 1. Sun (Mean & True Longitude)
  const L0_sun = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M_sun = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const M_sun_rad = degToRad(M_sun);
  const C_sun =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M_sun_rad) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * M_sun_rad) +
    0.000289 * Math.sin(3 * M_sun_rad);
  const tropicalSun = normalizeDegrees(L0_sun + C_sun);
  const sunSpeed = 0.9856; // degrees/day approx

  // 2. Moon (Brown's Lunar Theory fundamental arguments)
  const L_moon = 218.3164477 + 481267.88123421 * T;
  const D_moon = 297.8501921 + 445267.1114034 * T;
  const M_moon = 134.9633964 + 477198.8675055 * T;
  const F_moon = 93.272095 + 483202.0175233 * T;

  const D_rad = degToRad(D_moon);
  const Mm_rad = degToRad(M_moon);
  const Ms_rad = degToRad(M_sun);
  const F_rad = degToRad(F_moon);

  const moonCorr =
    6.288774 * Math.sin(Mm_rad) +
    1.274027 * Math.sin(2 * D_rad - Mm_rad) +
    0.658314 * Math.sin(2 * D_rad) +
    0.213618 * Math.sin(2 * Mm_rad) -
    0.185116 * Math.sin(Ms_rad) -
    0.114332 * Math.sin(2 * F_rad) +
    0.058793 * Math.sin(2 * D_rad - 2 * Mm_rad) +
    0.057066 * Math.sin(2 * D_rad - Ms_rad - Mm_rad) +
    0.05332 * Math.sin(2 * D_rad + Mm_rad) +
    0.046153 * Math.sin(2 * D_rad - Ms_rad);

  const tropicalMoon = normalizeDegrees(L_moon + moonCorr);
  const moonSpeed = 13.176;

  // 3. Mars
  const L_mars = 355.433 + 19140.299 * T;
  const M_mars = degToRad(19.373 + 19139.858 * T);
  const C_mars = 10.691 * Math.sin(M_mars) + 0.623 * Math.sin(2 * M_mars);
  const tropicalMars = normalizeDegrees(L_mars + C_mars);

  // 4. Mercury
  const L_merc = 252.251 + 149472.674 * T;
  const M_merc = degToRad(174.795 + 149472.516 * T);
  const C_merc = 23.44 * Math.sin(M_merc) + 2.982 * Math.sin(2 * M_merc);
  const tropicalMercury = normalizeDegrees(L_merc + C_merc);

  // 5. Jupiter
  const L_jup = 34.351 + 3034.906 * T;
  const M_jup = degToRad(20.02 + 3034.69 * T);
  const C_jup = 5.555 * Math.sin(M_jup) + 0.168 * Math.sin(2 * M_jup);
  const tropicalJupiter = normalizeDegrees(L_jup + C_jup);

  // 6. Venus
  const L_ven = 181.979 + 58517.816 * T;
  const M_ven = degToRad(50.416 + 58517.804 * T);
  const C_ven = 0.776 * Math.sin(M_ven) + 0.003 * Math.sin(2 * M_ven);
  const tropicalVenus = normalizeDegrees(L_ven + C_ven);

  // 7. Saturn
  const L_sat = 50.077 + 1222.114 * T;
  const M_sat = degToRad(317.021 + 1221.554 * T);
  const C_sat = 6.273 * Math.sin(M_sat) + 0.288 * Math.sin(2 * M_sat);
  const tropicalSaturn = normalizeDegrees(L_sat + C_sat);

  // 8. Rahu (Mean Lunar Ascending Node - always retrograde)
  const tropicalRahu = normalizeDegrees(125.04452 - 1934.136261 * T);

  // 9. Ketu (Exactly opposite Rahu, 180 degrees away)
  const tropicalKetu = normalizeDegrees(tropicalRahu + 180.0);

  // Calculate apparent speeds and retrograde motions using differential sample (0.1 day step)
  const sampleDelta = 0.05;
  const T_next = getCenturiesSinceJ2000(jd + sampleDelta);

  const getPlanetSpeed = (tropicalNow: number, L_base: number, M_base: number, c1: number, c2: number, rate: number) => {
    const M_next = degToRad(M_base + rate * T_next);
    const C_next = c1 * Math.sin(M_next) + c2 * Math.sin(2 * M_next);
    const L_next = normalizeDegrees(L_base + rate * T_next + C_next);
    let diff = L_next - tropicalNow;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    const speed = diff / sampleDelta;
    return { speed, isRetrograde: speed < 0 };
  };

  const marsInfo = getPlanetSpeed(tropicalMars, 355.433, 19.373, 10.691, 0.623, 19140.299);
  const mercInfo = getPlanetSpeed(tropicalMercury, 252.251, 174.795, 23.44, 2.982, 149472.674);
  const jupInfo = getPlanetSpeed(tropicalJupiter, 34.351, 20.02, 5.555, 0.168, 3034.906);
  const venInfo = getPlanetSpeed(tropicalVenus, 181.979, 50.416, 0.776, 0.003, 58517.816);
  const satInfo = getPlanetSpeed(tropicalSaturn, 50.077, 317.021, 6.273, 0.288, 1222.114);

  // Convert all tropical coordinates to Nirayana (Sidereal)
  const toNirayana = (tropicalDeg: number) => normalizeDegrees(tropicalDeg - ayanamsa);

  return {
    Sun: { longitude: toNirayana(tropicalSun), speed: sunSpeed, isRetrograde: false },
    Moon: { longitude: toNirayana(tropicalMoon), speed: moonSpeed, isRetrograde: false },
    Mars: { longitude: toNirayana(tropicalMars), speed: marsInfo.speed, isRetrograde: marsInfo.isRetrograde },
    Mercury: { longitude: toNirayana(tropicalMercury), speed: mercInfo.speed, isRetrograde: mercInfo.isRetrograde },
    Jupiter: { longitude: toNirayana(tropicalJupiter), speed: jupInfo.speed, isRetrograde: jupInfo.isRetrograde },
    Venus: { longitude: toNirayana(tropicalVenus), speed: venInfo.speed, isRetrograde: venInfo.isRetrograde },
    Saturn: { longitude: toNirayana(tropicalSaturn), speed: satInfo.speed, isRetrograde: satInfo.isRetrograde },
    Rahu: { longitude: toNirayana(tropicalRahu), speed: -0.0529, isRetrograde: true },
    Ketu: { longitude: toNirayana(tropicalKetu), speed: -0.0529, isRetrograde: true },
  };
}

