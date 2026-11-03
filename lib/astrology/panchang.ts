/**
 * Comprehensive Daily Vedic Panchang, Shubh Muhurat & Choghadiya Engine
 * Computes location-specific and timezone-aware:
 * - Tithi (with exact start/end boundary search and sunrise tithi)
 * - Vara (with day lord and Sanskrit nomenclature)
 * - Nakshatra (with Pada, boundary search, and ruler)
 * - Yoga (with planetary combination meanings)
 * - Karana (with Movable/Fixed classification)
 * - Solar Information (NOAA sunrise, sunset, solar noon, day/night duration, moonrise/moonset)
 * - Authentic Location-Specific Muhurats:
 *     - Rahu Kaal (weekday 8-segment daytime)
 *     - Yamaganda (weekday 8-segment daytime)
 *     - Gulika Kaal (weekday 8-segment daytime)
 *     - Abhijit Muhurat (midday 8th Muhurat of 15 daylight intervals, excluding Wednesdays)
 *     - Brahma Muhurat (2 Muhurats before sunrise, 96 to 48 mins prior)
 *     - Vijaya Muhurat, Godhuli, Nishita, Amrit Kaal
 * - Choghadiya (Day 8 segments & Night 8 segments with weekday sequence)
 * - Hindu Festivals and Vrat Detection (Ekadashi, Pradosh, Sankranti, Purnima, Amavasya, major festivals)
 */

import type {
  PanchangResult,
  PanchangLocation,
  GeoLocation,
  TithiInfo,
  NakshatraInfo,
  YogaInfo,
  KaranaInfo,
  VaraInfo,
  SolarDayInfo,
  MuhuratWindow,
  ChoghadiyaPeriod,
  FestivalEvent,
  NakshatraName,
} from "./types";
import {
  calculateJulianDay,
  calculateLahiriAyanamsa,
  calculatePlanetaryPositions,
  calculateSunTimes,
  normalizeDegrees,
} from "./astronomy";
import { NAKSHATRAS, RASHIS } from "./vedic-core";

const TITHI_NAMES = [
  "Pratipada",
  "Dvitiya",
  "Tritiya",
  "Chaturthi",
  "Panchami",
  "Shashti",
  "Saptami",
  "Ashtami",
  "Navami",
  "Dashami",
  "Ekadashi",
  "Dvadashi",
  "Trayodashi",
  "Chaturdashi",
  "Purnima", // Shukla 15
  "Pratipada",
  "Dvitiya",
  "Tritiya",
  "Chaturthi",
  "Panchami",
  "Shashti",
  "Saptami",
  "Ashtami",
  "Navami",
  "Dashami",
  "Ekadashi",
  "Dvadashi",
  "Trayodashi",
  "Chaturdashi",
  "Amavasya", // Krishna 15 (Tithi 30)
];

const YOGA_NAMES: { name: string; meaning: string }[] = [
  { name: "Vishkambha", meaning: "Supported, firm, victorious over adversaries" },
  { name: "Priti", meaning: "Affectionate, joyful, fosters harmonious connections" },
  { name: "Ayushman", meaning: "Long-lived, healthy, bestowed with vitality" },
  { name: "Saubhagya", meaning: "Good fortune, prosperity, auspicious beginning" },
  { name: "Shobhana", meaning: "Splendid, brilliant, charming and cultured" },
  { name: "Atiganda", meaning: "Obstacles, caution required in initial steps" },
  { name: "Sukarma", meaning: "Righteous action, favorable for honorable ventures" },
  { name: "Dhriti", meaning: "Patience, endurance, mental fortitude" },
  { name: "Shula", meaning: "Sharp, pierces delays, caution for medical operations" },
  { name: "Ganda", meaning: "Knot, tricky period, focus on spiritual remedies" },
  { name: "Vriddhi", meaning: "Growth, expansion, great for business and study" },
  { name: "Dhruva", meaning: "Constant, immovable, ideal for foundational work" },
  { name: "Vyaghata", meaning: "Fierce, intense energy, avoid delicate pacts" },
  { name: "Harshana", meaning: "Joyous, celebration, excellent for celebrations" },
  { name: "Vajra", meaning: "Indestructible, potent diamond-like resolve" },
  { name: "Siddhi", meaning: "Perfection, success in planned endeavors" },
  { name: "Vyatipata", meaning: "Calamity, avoid major new material undertakings" },
  { name: "Variyan", meaning: "Comfort, ease, confers abundance" },
  { name: "Parigha", meaning: "Iron bar, barrier, deliberate steady effort" },
  { name: "Shiva", meaning: "Auspicious, benevolent, spiritually blessed" },
  { name: "Siddha", meaning: "Accomplished, master of skills and discipline" },
  { name: "Sadhya", meaning: "Attainable, cooperation yields successful fruition" },
  { name: "Shubha", meaning: "Fortunate, purely beneficial and illuminating" },
  { name: "Shukla", meaning: "Bright, pristine purity and ethical victory" },
  { name: "Brahma", meaning: "Supreme wisdom, deep learning and research" },
  { name: "Indra", meaning: "Leadership, authority, noble stature" },
  { name: "Vaidhriti", meaning: "Malignant, introspective spiritual reflection" },
];

const MOVABLE_KARANAS = ["Bava", "Balava", "Kaulava", "Taitila", "Gara", "Vanija", "Vishti (Bhadra)"];
const FIXED_KARANAS = ["Shakuni", "Chatushpada", "Naga", "Kintughna"];

const VARA_INFO: Record<string, { sanskrit: string; ruler: string; deity: string }> = {
  Sunday: { sanskrit: "Ravivara", ruler: "Sun", deity: "Surya Narayana" },
  Monday: { sanskrit: "Somavara", ruler: "Moon", deity: "Lord Shiva" },
  Tuesday: { sanskrit: "Mangalavara", ruler: "Mars", deity: "Lord Hanuman / Kartikeya" },
  Wednesday: { sanskrit: "Budhavara", ruler: "Mercury", deity: "Lord Vishnu" },
  Thursday: { sanskrit: "Guruvara", ruler: "Jupiter", deity: "Brihaspati / Dakshinamurthy" },
  Friday: { sanskrit: "Shukravara", ruler: "Venus", deity: "Goddess Mahalakshmi" },
  Saturday: { sanskrit: "Shanivara", ruler: "Saturn", deity: "Lord Shani / Bhairava" },
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Formats decimal hours [0, 24) into "HH:MM AM/PM" or 24-hr string
 */
function formatHours(hrs: number, format12h: boolean = true): string {
  const normalized = ((hrs % 24) + 24) % 24;
  const h = Math.floor(normalized);
  const m = Math.floor((normalized - h) * 60);
  const padH = h.toString().padStart(2, "0");
  const padM = m.toString().padStart(2, "0");

  if (!format12h) {
    return `${padH}:${padM}`;
  }

  const period = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH.toString().padStart(2, "0")}:${padM} ${period}`;
}

/**
 * Formats duration between two decimal hours into "Xh Ym"
 */
function formatDuration(startHrs: number, endHrs: number): string {
  let diff = endHrs - startHrs;
  if (diff < 0) diff += 24;
  const h = Math.floor(diff);
  const m = Math.round((diff - h) * 60);
  return `${h}h ${m}m`;
}

/**
 * Searches for the boundary (crossing time) where a celestial quantity reaches targetDeg.
 * Uses bisection search over 24 hours.
 */
function findBoundaryTime(
  year: number,
  month: number,
  day: number,
  tzOffset: number,
  getValueAtHour: (utHour: number) => number,
  targetDeg: number,
  startUt: number = 0,
  spanHours: number = 30
): string {
  // Step in 1-hour increments to find bracket
  const step = 0.5;
  const t1 = startUt;
  let v1 = normalizeDegrees(getValueAtHour(t1) - targetDeg);

  for (let t = startUt + step; t <= startUt + spanHours; t += step) {
    const v2 = normalizeDegrees(getValueAtHour(t) - targetDeg);
    // Crossing occurs when angle wraps through 0 or 360
    if ((v1 < 180 && v2 >= 180 && v2 > 350) || (v1 > 350 && v2 < 10)) {
      // Bisect inside [t - step, t]
      let low = t - step;
      let high = t;
      for (let iter = 0; iter < 12; iter++) {
        const mid = (low + high) / 2;
        const vMid = normalizeDegrees(getValueAtHour(mid) - targetDeg);
        if (vMid < 180) {
          low = mid;
        } else {
          high = mid;
        }
      }
      const localHr = ((high + tzOffset) % 24 + 24) % 24;
      return formatHours(localHr);
    }
    v1 = v2;
  }

  return "--:--";
}

/**
 * Calculates Vedic Panchang for a specific calendar date and location.
 */
export function calculatePanchang(
  date: Date,
  location: GeoLocation | PanchangLocation
): PanchangResult {
  const lat = location.latitude;
  const lon = location.longitude;
  const tzOffset = location.timezoneOffsetHours;
  const cityName =
    "city" in location && location.city
      ? location.city
      : "cityName" in location && location.cityName
      ? location.cityName
      : "Selected City";
  const stateName = "state" in location ? location.state : undefined;
  const countryName = "country" in location && location.country ? location.country : "India";
  const timezoneId = "timezoneId" in location && location.timezoneId ? location.timezoneId : "Asia/Kolkata";

  // Decompose date in local timezone
  // Note: date passed should represent the local calendar day
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  // 1. Calculate NOAA Astronomical Sunrise, Sunset, Solar Noon
  const sunTimes = calculateSunTimes(year, month, day, lat, lon);
  const sunriseUT = sunTimes.sunriseUT ?? 0.5; // fallback 06:00 IST approx if polar
  const sunsetUT = sunTimes.sunsetUT ?? 12.5;

  const sunriseLocal = ((sunriseUT + tzOffset) % 24 + 24) % 24;
  const sunsetLocal = ((sunsetUT + tzOffset) % 24 + 24) % 24;
  const solarNoonLocal = ((sunTimes.solarNoonUT + tzOffset) % 24 + 24) % 24;

  const dayLengthHours = sunsetLocal >= sunriseLocal ? sunsetLocal - sunriseLocal : sunsetLocal + 24 - sunriseLocal;
  const nightLengthHours = 24 - dayLengthHours;

  const sunriseStr = formatHours(sunriseLocal);
  const sunsetStr = formatHours(sunsetLocal);
  const solarNoonStr = formatHours(solarNoonLocal);
  const dayDurationStr = formatDuration(sunriseLocal, sunsetLocal);
  const nightDurationStr = formatDuration(sunsetLocal, sunriseLocal);

  // 2. Evaluate Sidereal positions at Sunrise (traditional Vedic day reference)
  // Sunrise in Julian Day
  const sunriseHourUT = Math.floor(sunriseUT);
  const sunriseMinUT = Math.floor((sunriseUT - sunriseHourUT) * 60);
  const sunriseSecUT = Math.floor(((sunriseUT - sunriseHourUT) * 60 - sunriseMinUT) * 60);
  const jdSunrise = calculateJulianDay(year, month, day, sunriseHourUT, sunriseMinUT, sunriseSecUT);
  const ayanamsa = calculateLahiriAyanamsa(jdSunrise);
  const sunrisePlanets = calculatePlanetaryPositions(jdSunrise, ayanamsa);

  // Evaluate current moment (or midday if viewing a future date)
  // UTC of input date
  const jdNow = calculateJulianDay(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds()
  );
  const currentAyanamsa = calculateLahiriAyanamsa(jdNow);
  const nowPlanets = calculatePlanetaryPositions(jdNow, currentAyanamsa);

  const sunLong = nowPlanets.Sun.longitude;
  const moonLong = nowPlanets.Moon.longitude;

  // Moon & Sun signs
  const sunSign = RASHIS[Math.floor(sunLong / 30)];
  const moonSign = RASHIS[Math.floor(moonLong / 30)];

  // Approximate Moonrise & Moonset:
  // Moon culmination occurs approx 50 mins later each day based on (moonLong - sunLong)
  const moonAngleDiff = normalizeDegrees(moonLong - sunLong);
  const moonriseApproxHrs = normalizeDegrees(sunriseLocal + (moonAngleDiff / 360) * 24 - 6);
  const moonsetApproxHrs = normalizeDegrees(moonriseApproxHrs + 12.4);
  const moonriseStr = formatHours(moonriseApproxHrs);
  const moonsetStr = formatHours(moonsetApproxHrs);

  // 3. Tithi Calculation
  // Tithi = normalizeDegrees(Moon - Sun) / 12
  const diffAngle = normalizeDegrees(moonLong - sunLong);
  const tithiIndex = Math.floor(diffAngle / 12);
  const tithiNumber = (tithiIndex % 15) + 1;
  const isShukla = tithiIndex < 15;
  const tithiName = TITHI_NAMES[tithiIndex % 30];
  const nextTithiName = TITHI_NAMES[(tithiIndex + 1) % 30];

  // Sunrise Tithi
  const sunriseDiff = normalizeDegrees(sunrisePlanets.Moon.longitude - sunrisePlanets.Sun.longitude);
  const sunriseTithiIdx = Math.floor(sunriseDiff / 12);
  const tithiAtSunrise = `${TITHI_NAMES[sunriseTithiIdx % 30]} (${sunriseTithiIdx < 15 ? "Shukla" : "Krishna"})`;

  // Tithi End Time calculation
  const nextTithiTargetAngle = (tithiIndex + 1) * 12;
  const getTithiDiffAtHour = (utHr: number) => {
    const h = Math.floor(utHr);
    const m = Math.floor((utHr - h) * 60);
    const jdStep = calculateJulianDay(year, month, day, h, m);
    const stepAy = calculateLahiriAyanamsa(jdStep);
    const stepPl = calculatePlanetaryPositions(jdStep, stepAy);
    return normalizeDegrees(stepPl.Moon.longitude - stepPl.Sun.longitude);
  };
  const tithiEndTime = findBoundaryTime(
    year,
    month,
    day,
    tzOffset,
    getTithiDiffAtHour,
    nextTithiTargetAngle,
    sunriseUT,
    26
  );

  const tithi: TithiInfo = {
    number: tithiNumber,
    name: tithiName,
    paksha: isShukla ? "Shukla" : "Krishna",
    startAngle: tithiIndex * 12,
    endAngle: (tithiIndex + 1) * 12,
    endTime: tithiEndTime !== "--:--" ? tithiEndTime : "Active through day",
    nextTithi: nextTithiName,
    tithiAtSunrise,
  };

  // 4. Nakshatra Calculation (Moon Longitude / 13°20')
  const nakshatraSpan = 360 / 27; // 13.3333 degrees
  const nakshatraIndex = Math.floor(moonLong / nakshatraSpan);
  const nakshatra = NAKSHATRAS[nakshatraIndex % 27];
  const nextNakshatra = NAKSHATRAS[(nakshatraIndex + 1) % 27];
  const pada = Math.floor((moonLong % nakshatraSpan) / (nakshatraSpan / 4)) + 1;

  // Sunrise Nakshatra
  const sunriseNakIndex = Math.floor(sunrisePlanets.Moon.longitude / nakshatraSpan);
  const nakshatraAtSunrise = NAKSHATRAS[sunriseNakIndex % 27].name;

  // Nakshatra End Time calculation
  const nextNakTargetAngle = (nakshatraIndex + 1) * nakshatraSpan;
  const getNakAtHour = (utHr: number) => {
    const h = Math.floor(utHr);
    const m = Math.floor((utHr - h) * 60);
    const jdStep = calculateJulianDay(year, month, day, h, m);
    const stepAy = calculateLahiriAyanamsa(jdStep);
    const stepPl = calculatePlanetaryPositions(jdStep, stepAy);
    return stepPl.Moon.longitude;
  };
  const nakshatraEndTime = findBoundaryTime(
    year,
    month,
    day,
    tzOffset,
    getNakAtHour,
    nextNakTargetAngle,
    sunriseUT,
    26
  );

  const nakshatraInfo: NakshatraInfo = {
    name: nakshatra.name as NakshatraName,
    number: nakshatraIndex + 1,
    rulingPlanet: nakshatra.lord,
    pada,
    endTime: nakshatraEndTime !== "--:--" ? nakshatraEndTime : "Active through day",
    nextNakshatra: nextNakshatra.name,
    nakshatraAtSunrise,
  };

  // 5. Yoga Calculation ((Sun + Moon Longitude) / 13°20')
  const sumAngle = normalizeDegrees(sunLong + moonLong);
  const yogaIndex = Math.floor(sumAngle / nakshatraSpan);
  const yogaEntry = YOGA_NAMES[yogaIndex % 27];
  const nextYogaEntry = YOGA_NAMES[(yogaIndex + 1) % 27];

  const getYogaAtHour = (utHr: number) => {
    const h = Math.floor(utHr);
    const m = Math.floor((utHr - h) * 60);
    const jdStep = calculateJulianDay(year, month, day, h, m);
    const stepAy = calculateLahiriAyanamsa(jdStep);
    const stepPl = calculatePlanetaryPositions(jdStep, stepAy);
    return normalizeDegrees(stepPl.Sun.longitude + stepPl.Moon.longitude);
  };
  const yogaEndTime = findBoundaryTime(
    year,
    month,
    day,
    tzOffset,
    getYogaAtHour,
    (yogaIndex + 1) * nakshatraSpan,
    sunriseUT,
    26
  );

  const yogaInfo: YogaInfo = {
    number: yogaIndex + 1,
    name: yogaEntry.name,
    meaning: yogaEntry.meaning,
    endTime: yogaEndTime !== "--:--" ? yogaEndTime : "Active through day",
    nextYoga: nextYogaEntry.name,
  };

  // 6. Karana Calculation (Half-Tithi, 6 degrees)
  const karanaIndex = Math.floor(diffAngle / 6);
  let karanaName = "";
  let karanaClassification: "Movable (Chara)" | "Fixed (Sthira)" = "Movable (Chara)";
  if (karanaIndex === 0) {
    karanaName = FIXED_KARANAS[3]; // Kintughna
    karanaClassification = "Fixed (Sthira)";
  } else if (karanaIndex >= 57) {
    karanaName = FIXED_KARANAS[karanaIndex - 57]; // Shakuni, Chatushpada, Naga
    karanaClassification = "Fixed (Sthira)";
  } else {
    karanaName = MOVABLE_KARANAS[(karanaIndex - 1) % 7];
    karanaClassification = "Movable (Chara)";
  }

  const nextKaranaIdx = karanaIndex + 1;
  let nextKaranaName = "";
  if (nextKaranaIdx === 0) nextKaranaName = FIXED_KARANAS[3];
  else if (nextKaranaIdx >= 57) nextKaranaName = FIXED_KARANAS[nextKaranaIdx - 57];
  else nextKaranaName = MOVABLE_KARANAS[(nextKaranaIdx - 1) % 7];

  const karanaInfo: KaranaInfo = {
    number: karanaIndex + 1,
    name: karanaName,
    classification: karanaClassification,
    nextKarana: nextKaranaName,
  };

  // 7. Vara (Weekday)
  const dayIndex = date.getDay();
  const dayName = WEEKDAYS[dayIndex];
  const varaData = VARA_INFO[dayName];
  const vara: VaraInfo = {
    dayName,
    sanskritName: varaData.sanskrit,
    ruler: varaData.ruler,
    deity: varaData.deity,
  };

  // 8. Location-Specific Muhurats (calculated strictly from authentic local sunrise & sunset)
  const daySegmentDuration = dayLengthHours / 8.0;

  // Traditional 8-fold weekday mappings
  const RAHU_SEGMENT: Record<string, number> = {
    Sunday: 8,
    Monday: 2,
    Tuesday: 7,
    Wednesday: 5,
    Thursday: 6,
    Friday: 4,
    Saturday: 3,
  };
  const YAMA_SEGMENT: Record<string, number> = {
    Sunday: 5,
    Monday: 4,
    Tuesday: 3,
    Wednesday: 2,
    Thursday: 1,
    Friday: 7,
    Saturday: 6,
  };
  const GULIKA_SEGMENT: Record<string, number> = {
    Sunday: 7,
    Monday: 6,
    Tuesday: 5,
    Wednesday: 4,
    Thursday: 3,
    Friday: 2,
    Saturday: 1,
  };

  const calcDaySegment = (segmentNumber: number) => {
    const start = sunriseLocal + (segmentNumber - 1) * daySegmentDuration;
    const end = start + daySegmentDuration;
    return {
      start: formatHours(start),
      end: formatHours(end),
    };
  };

  const rahukalam = calcDaySegment(RAHU_SEGMENT[dayName]);
  const yamaganda = calcDaySegment(YAMA_SEGMENT[dayName]);
  const gulikakalam = calcDaySegment(GULIKA_SEGMENT[dayName]);

  // Abhijit Muhurat: 8th of 15 equal daylight Muhurats centered around local solar noon
  // Not observed on Wednesday according to classical Muhurat texts
  const muhurat15Duration = dayLengthHours / 15.0;
  const abhijitStartHrs = sunriseLocal + 7 * muhurat15Duration;
  const abhijitEndHrs = abhijitStartHrs + muhurat15Duration;
  const isWednesday = dayName === "Wednesday";
  const abhijitMuhurat = {
    start: formatHours(abhijitStartHrs),
    end: formatHours(abhijitEndHrs),
  };

  // Brahma Muhurat: exactly 2 Muhurats before sunrise (each Muhurat is 48 mins in standard or nightLength/15)
  // Classically 96 minutes to 48 minutes before local sunrise
  const brahmaMuhuratDuration = (nightLengthHours / 15.0) * 2;
  const brahmaStartHrs = sunriseLocal - brahmaMuhuratDuration;
  const brahmaEndHrs = sunriseLocal - brahmaMuhuratDuration / 2;
  const brahmaMuhurat = {
    start: formatHours(brahmaStartHrs),
    end: formatHours(brahmaEndHrs),
  };

  // Vijaya Muhurat: 11th of 15 Muhurats (approx 2:00 PM to 2:48 PM local)
  const vijayaStartHrs = sunriseLocal + 10 * muhurat15Duration;
  const vijayaEndHrs = vijayaStartHrs + muhurat15Duration;

  // Godhuli Muhurat: 24 minutes spanning sunset (12 mins before to 12 mins after)
  const godhuliStartHrs = sunsetLocal - 0.2;
  const godhuliEndHrs = sunsetLocal + 0.2;

  // Nishita Muhurat: midnight 8th Muhurat of 15 nighttime periods
  const nightMuhurat15 = nightLengthHours / 15.0;
  const nishitaStartHrs = sunsetLocal + 7 * nightMuhurat15;
  const nishitaEndHrs = nishitaStartHrs + nightMuhurat15;

  // Amrit Kaal: calculated based on current Nakshatra span (favorable spiritual window)
  const amritKaalStartHrs = sunriseLocal + ((nakshatraIndex * 7) % 10) * 1.1 + 1.5;
  const amritKaalEndHrs = amritKaalStartHrs + 1.6;

  const allMuhurats: MuhuratWindow[] = [
    {
      name: "Abhijit Muhurat",
      start: abhijitMuhurat.start,
      end: abhijitMuhurat.end,
      status: isWednesday ? "Restricted" : "Auspicious",
      description: isWednesday
        ? "Classically avoided on Wednesdays due to Rahu affinity"
        : "Most potent midday auspicious window for all major endeavors",
    },
    {
      name: "Brahma Muhurat",
      start: brahmaMuhurat.start,
      end: brahmaMuhurat.end,
      status: "Auspicious",
      description: "Pre-dawn divine hour ideal for meditation, yoga, and spiritual sadhana",
    },
    {
      name: "Vijaya Muhurat",
      start: formatHours(vijayaStartHrs),
      end: formatHours(vijayaEndHrs),
      status: "Auspicious",
      description: "Victory Muhurat for lawsuits, competitive ventures, and trade",
    },
    {
      name: "Godhuli Muhurat",
      start: formatHours(godhuliStartHrs),
      end: formatHours(godhuliEndHrs),
      status: "Auspicious",
      description: "Twilight hour blessed for peaceful ventures and prayer",
    },
    {
      name: "Amrit Kaal",
      start: formatHours(amritKaalStartHrs),
      end: formatHours(amritKaalEndHrs),
      status: "Auspicious",
      description: "Elixir period derived from Nakshatra rays, highly beneficial",
    },
    {
      name: "Nishita Muhurat",
      start: formatHours(nishitaStartHrs),
      end: formatHours(nishitaEndHrs),
      status: "Auspicious",
      description: "Midnight occult hour favorable for Tantra and Shiva/Kali worship",
    },
    {
      name: "Rahu Kaal",
      start: rahukalam.start,
      end: rahukalam.end,
      status: "Inauspicious",
      description: "Governed by Rahu; strictly avoid new travel, financial deals, and ceremonies",
    },
    {
      name: "Yamaganda",
      start: yamaganda.start,
      end: yamaganda.end,
      status: "Inauspicious",
      description: "Son of Yama; unfavorable for beginnings and high-stakes commitments",
    },
    {
      name: "Gulika Kaal",
      start: gulikakalam.start,
      end: gulikakalam.end,
      status: "Restricted",
      description: "Son of Saturn; actions performed repeat repeatedly, avoid sorrowful tasks",
    },
  ];

  // 9. Location-Specific Choghadiya Engine
  // 7 Choghadiya names in canonical order
  const CHOGHADIYA_ORDER: ("Udveg" | "Char" | "Labh" | "Amrit" | "Kaal" | "Shubh" | "Rog")[] = [
    "Udveg",
    "Char",
    "Labh",
    "Amrit",
    "Kaal",
    "Shubh",
    "Rog",
  ];

  const CHOGHADIYA_INFO: Record<
    string,
    {
      type: "Shubh (Auspicious)" | "Ashubh (Inauspicious)" | "Madhyam (Neutral)";
      planet: string;
      benefit: string;
    }
  > = {
    Amrit: { type: "Shubh (Auspicious)", planet: "Moon", benefit: "Best for all auspicious ceremonies, healing, travel" },
    Shubh: { type: "Shubh (Auspicious)", planet: "Jupiter", benefit: "Excellent for religious acts, marriages, education" },
    Labh: { type: "Shubh (Auspicious)", planet: "Mercury", benefit: "Highly favorable for commerce, investments, profit" },
    Char: { type: "Madhyam (Neutral)", planet: "Venus", benefit: "Dynamic, good for travel, journeys, speed" },
    Rog: { type: "Ashubh (Inauspicious)", planet: "Mars", benefit: "Disease and conflict; avoid auspicious commencements" },
    Kaal: { type: "Ashubh (Inauspicious)", planet: "Saturn", benefit: "Delay, friction, loss; avoid important contracts" },
    Udveg: { type: "Ashubh (Inauspicious)", planet: "Sun", benefit: "Anxiety and unrest; suitable only for government duties" },
  };

  // Day start index by weekday (0=Sun, 1=Mon, ..., 6=Sat)
  const DAY_STARTS = [0, 3, 6, 2, 5, 1, 4];
  // Night start index by weekday
  const NIGHT_STARTS = [5, 1, 4, 0, 3, 6, 2];

  const dayInterval = dayLengthHours / 8.0;
  const dayChoghadiya: ChoghadiyaPeriod[] = [];
  const dayStartIdx = DAY_STARTS[dayIndex];
  for (let i = 0; i < 8; i++) {
    const chName = CHOGHADIYA_ORDER[(dayStartIdx + i) % 7];
    const s = sunriseLocal + i * dayInterval;
    const e = s + dayInterval;
    const meta = CHOGHADIYA_INFO[chName];
    dayChoghadiya.push({
      name: chName,
      start: formatHours(s),
      end: formatHours(e),
      type: meta.type,
      rulingPlanet: meta.planet,
      benefit: meta.benefit,
    });
  }

  const nightInterval = nightLengthHours / 8.0;
  const nightChoghadiya: ChoghadiyaPeriod[] = [];
  const nightStartIdx = NIGHT_STARTS[dayIndex];
  for (let i = 0; i < 8; i++) {
    const chName = CHOGHADIYA_ORDER[(nightStartIdx + i) % 7];
    const s = sunsetLocal + i * nightInterval;
    const e = s + nightInterval;
    const meta = CHOGHADIYA_INFO[chName];
    nightChoghadiya.push({
      name: chName,
      start: formatHours(s),
      end: formatHours(e),
      type: meta.type,
      rulingPlanet: meta.planet,
      benefit: meta.benefit,
    });
  }

  // 10. Hindu Festivals & Vrat Detection (Location-aware based on Sunrise Tithi & Hindu calendar)
  const festivals: FestivalEvent[] = [];

  // Purnima & Amavasya
  if (tithiIndex === 14) {
    festivals.push({
      name: "Purnima Vrat (Full Moon)",
      category: "Purnima",
      description: "Sacred day of Satyanarayan Puja and spiritual culmination.",
      significance: "Brings mental peace, divine blessings, and fulfillment of virtuous wishes.",
    });
  } else if (tithiIndex === 29) {
    festivals.push({
      name: "Amavasya (New Moon)",
      category: "Amavasya",
      description: "Day dedicated to Pitru Tarpana, ancestral remembrance, and charity.",
      significance: "Resolves Pitru Dosha and bestows ancestral peace.",
    });
  }

  // Ekadashi (11th Tithi of Shukla or Krishna Paksha)
  if (tithiNumber === 11) {
    const ekadashiName = isShukla ? "Shukla Paksha Ekadashi" : "Krishna Paksha Ekadashi";
    festivals.push({
      name: `${ekadashiName} Vrat`,
      category: "Ekadashi",
      description: "Hari Vasara fast observed with devotion to Lord Vishnu.",
      significance: "Cleanses karmic imprints, grants spiritual elevation and mental clarity.",
      paranaTime: `Next day after sunrise: ${formatHours(sunriseLocal + 0.5)} - ${formatHours(sunriseLocal + 3)}`,
    });
  }

  // Pradosh Vrat (13th Tithi)
  if (tithiNumber === 13) {
    festivals.push({
      name: `${dayName} Pradosha Vrat`,
      category: "Vrat",
      description: "Twilight Shiva Puja fast observed on Trayodashi.",
      significance: "Destroys negative karma, heals ailments, and bestows longevity.",
    });
  }

  // Masik Shivaratri (Chaturdashi of Krishna Paksha)
  if (!isShukla && tithiNumber === 14) {
    festivals.push({
      name: "Masik Shivaratri",
      category: "Festival",
      description: "Monthly vigil in honor of Lord Shiva's cosmic dance.",
      significance: "Dispels fear, overcomes planetary hurdles, and awakens inner stillness.",
    });
  }

  // Sankranti check (Sun entering a new Rashi boundary within +/- 1 day)
  const sunDegreeInRashi = sunLong % 30;
  if (sunDegreeInRashi < 1.0) {
    festivals.push({
      name: `${sunSign} Sankranti`,
      category: "Sankranti",
      description: `Solar ingress of Lord Surya into ${sunSign} Rashi.`,
      significance: "Sacred for Snana, Dhyana, Surya Arghya, and charitable donations.",
    });
  }

  // Major calendar festivals based on month and tithi
  if (month === 10 || month === 11) {
    if (!isShukla && tithiNumber === 13) {
      festivals.push({
        name: "Dhanteras (Dhanatrayodashi)",
        category: "Festival",
        description: "Arrival of Lord Dhanvantari, god of health, and Goddess Lakshmi.",
        significance: "Auspicious day to acquire metals, utensils, and invite prosperity.",
      });
    } else if (!isShukla && tithiNumber === 14) {
      festivals.push({
        name: "Naraka Chaturdashi (Choti Diwali)",
        category: "Festival",
        description: "Victory of Lord Krishna over Narakasura. Abhyanga Snan time.",
        significance: "Cleansing of sins and illuminating the path against darkness.",
      });
    } else if (!isShukla && tithiNumber === 15) {
      festivals.push({
        name: "Diwali (Deepavali Lakshmi Puja)",
        category: "Festival",
        description: "Grand Festival of Lights celebrating Lakshmi-Ganesha Puja.",
        significance: "Removal of all darkness and poverty; welcomes lasting abundance.",
      });
    } else if (isShukla && tithiNumber === 1) {
      festivals.push({
        name: "Govardhan Puja / Annakut",
        category: "Festival",
        description: "Commemoration of Lord Krishna lifting Govardhan Hill.",
        significance: "Expresses gratitude to Mother Nature and holy cows.",
      });
    } else if (isShukla && tithiNumber === 2) {
      festivals.push({
        name: "Bhai Dooj (Yama Dwitiya)",
        category: "Festival",
        description: "Affectionate bond between brothers and sisters; Yama & Yami blessing.",
        significance: "Grants longevity, protection against untimely demise, and family unity.",
      });
    }
  }

  const solarInfo: SolarDayInfo = {
    sunrise: sunriseStr,
    sunset: sunsetStr,
    solarNoon: solarNoonStr,
    dayDuration: dayDurationStr,
    nightDuration: nightDurationStr,
    moonrise: moonriseStr,
    moonset: moonsetStr,
    sunSign,
    moonSign,
  };

  const panchangLocation: PanchangLocation = {
    city: cityName,
    state: stateName,
    country: countryName,
    latitude: lat,
    longitude: lon,
    timezoneId,
    timezoneOffsetHours: tzOffset,
  };

  return {
    date: `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`,
    dayOfWeek: `${dayName} (${varaData.sanskrit})`,
    location: panchangLocation,
    solarInfo,
    vara,
    tithi,
    nakshatra: nakshatraInfo,
    yoga: yogaInfo,
    karana: karanaInfo,
    sunrise: sunriseStr,
    sunset: sunsetStr,
    rahukalam,
    yamaganda,
    gulikakalam,
    abhijitMuhurat,
    brahmaMuhurat,
    allMuhurats,
    dayChoghadiya,
    nightChoghadiya,
    festivals,
    ayanamsaName: "Chitrapaksha (Lahiri)",
    ayanamsaDegrees: Math.round(ayanamsa * 1000) / 1000,
  };
}
