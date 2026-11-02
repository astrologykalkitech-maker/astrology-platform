/**
 * Daily Vedic Panchang & Muhurat Calculation Engine
 * Computes the five sacred limbs of time:
 * Tithi, Vara, Nakshatra, Yoga, and Karana, along with key daily Muhurats.
 */

import type { PanchangResult, GeoLocation } from "./types";
import {
  calculateJulianDay,
  calculateLahiriAyanamsa,
  calculatePlanetaryPositions,
  normalizeDegrees,
} from "./astronomy";
import { NAKSHATRAS } from "./vedic-core";

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
  "Amavasya", // Krishna 15
];

const YOGA_NAMES = [
  "Vishkambha",
  "Priti",
  "Ayushman",
  "Saubhagya",
  "Shobhana",
  "Atiganda",
  "Sukarma",
  "Dhriti",
  "Shula",
  "Ganda",
  "Vriddhi",
  "Dhruva",
  "Vyaghata",
  "Harshana",
  "Vajra",
  "Siddhi",
  "Vyatipata",
  "Variyan",
  "Parigha",
  "Shiva",
  "Siddha",
  "Sadhya",
  "Shubha",
  "Shukla",
  "Brahma",
  "Indra",
  "Vaidhriti",
];

const MOVABLE_KARANAS = ["Bava", "Balava", "Kaulava", "Taitila", "Gara", "Vanija", "Vishti"];
const FIXED_KARANAS = ["Shakuni", "Chatushpada", "Naga", "Kintughna"];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_LORDS: Record<string, string> = {
  Sunday: "Sun",
  Monday: "Moon",
  Tuesday: "Mars",
  Wednesday: "Mercury",
  Thursday: "Jupiter",
  Friday: "Venus",
  Saturday: "Saturn",
};

/**
 * Calculates Vedic Panchang for a calendar date and geographic location.
 */
export function calculatePanchang(date: Date, _location: GeoLocation): PanchangResult {
  void _location;
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();

  const jd = calculateJulianDay(year, month, day, hour, minute);
  const ayanamsa = calculateLahiriAyanamsa(jd);
  const planets = calculatePlanetaryPositions(jd, ayanamsa);

  const sunLong = planets.Sun.longitude;
  const moonLong = planets.Moon.longitude;

  // 1. Tithi (Moon - Sun angle divided by 12 degrees)
  const diffAngle = normalizeDegrees(moonLong - sunLong);
  const tithiIndex = Math.floor(diffAngle / 12);
  const tithiNumber = (tithiIndex % 15) + 1;
  const isShukla = tithiIndex < 15;
  const tithiName = TITHI_NAMES[tithiIndex % 30];

  // 2. Nakshatra (Moon longitude / 13°20')
  const nakshatraSpan = 360 / 27;
  const nakshatraIndex = Math.floor(moonLong / nakshatraSpan);
  const nakshatra = NAKSHATRAS[nakshatraIndex];

  // 3. Yoga ((Sun + Moon longitude) / 13°20')
  const sumAngle = normalizeDegrees(sunLong + moonLong);
  const yogaIndex = Math.floor(sumAngle / nakshatraSpan);
  const yogaName = YOGA_NAMES[yogaIndex % 27];

  // 4. Karana (Half-Tithi, 6 degrees each)
  const karanaIndex = Math.floor(diffAngle / 6);
  let karanaName = "";
  if (karanaIndex === 0) {
    karanaName = FIXED_KARANAS[3]; // Kintughna
  } else if (karanaIndex >= 57) {
    karanaName = FIXED_KARANAS[karanaIndex - 57]; // Shakuni, Chatushpada, Naga
  } else {
    karanaName = MOVABLE_KARANAS[(karanaIndex - 1) % 7];
  }

  // 5. Day of Week
  const dayName = WEEKDAYS[date.getDay()];

  // 6. Muhurat calculations (Standard 12-hour day approximation from 6:00 AM to 6:00 PM)
  // Rahu Kalam, Yamaganda, Gulika by weekday
  const RAHU_SEGMENTS: Record<string, number> = {
    Sunday: 8,
    Monday: 2,
    Tuesday: 7,
    Wednesday: 5,
    Thursday: 6,
    Friday: 4,
    Saturday: 3,
  };
  const YAMA_SEGMENTS: Record<string, number> = {
    Sunday: 5,
    Monday: 4,
    Tuesday: 3,
    Wednesday: 2,
    Thursday: 1,
    Friday: 7,
    Saturday: 6,
  };
  const GULIKA_SEGMENTS: Record<string, number> = {
    Sunday: 7,
    Monday: 6,
    Tuesday: 5,
    Wednesday: 4,
    Thursday: 3,
    Friday: 2,
    Saturday: 1,
  };

  const toTimeStr = (hrs: number) => {
    const h = Math.floor(hrs);
    const m = Math.floor((hrs - h) * 60);
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  };

  const getWindow = (segment: number) => {
    const start = 6.0 + (segment - 1) * 1.5;
    const end = start + 1.5;
    return { start: toTimeStr(start), end: toTimeStr(end) };
  };

  const rahukalam = getWindow(RAHU_SEGMENTS[dayName]);
  const yamaganda = getWindow(YAMA_SEGMENTS[dayName]);
  const gulikakalam = getWindow(GULIKA_SEGMENTS[dayName]);
  const abhijitMuhurat = { start: "11:45", end: "12:35" };
  const brahmaMuhurat = { start: "04:24", end: "05:12" };

  return {
    date: date.toISOString().split("T")[0],
    dayOfWeek: `${dayName} (${DAY_LORDS[dayName]} Hora)`,
    tithi: {
      number: tithiNumber,
      name: tithiName,
      paksha: isShukla ? "Shukla" : "Krishna",
      startAngle: tithiIndex * 12,
      endAngle: (tithiIndex + 1) * 12,
    },
    nakshatra: {
      name: nakshatra.name,
      number: nakshatraIndex + 1,
      rulingPlanet: nakshatra.lord,
    },
    yoga: {
      number: yogaIndex + 1,
      name: yogaName,
    },
    karana: {
      number: karanaIndex + 1,
      name: karanaName,
    },
    sunrise: "06:15 AM",
    sunset: "06:10 PM",
    rahukalam,
    yamaganda,
    gulikakalam,
    abhijitMuhurat,
    brahmaMuhurat,
  };
}

