"use server";

import { requireAuth } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/security/rate-limit";
import {
  generateFullAstrologyReport,
  calculateAshtakoota,
  calculatePanchang,
  calculateNumerology,
  type BirthDetails,
  type AshtakootaResult,
  type PanchangResult,
  type NumerologyProfile,
  type FullAstrologyReport,
  type NakshatraName,
  type RashiName,
  type GeoLocation,
} from "@/lib/astrology";

export interface AstrologyActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Generates an end-to-end Kundli and Vedic Astrology report for authenticated users.
 */
export async function generateAstrologyReportAction(
  details: BirthDetails
): Promise<AstrologyActionResult<FullAstrologyReport>> {
  try {
    const { user } = await requireAuth();

    const limit = checkRateLimit(`astrology:report:${user.id}`, 30, 60_000);
    if (!limit.allowed) {
      return {
        success: false,
        error: `Calculation rate limit exceeded. Please wait ${limit.retryAfterSeconds} seconds.`,
      };
    }

    if (!details.date || !details.time || !details.location) {
      return { success: false, error: "Complete birth date, time, and coordinates are required." };
    }

    const report = generateFullAstrologyReport(details);
    return { success: true, data: report };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to calculate astrology report.",
    };
  }
}

/**
 * Calculates Ashtakoota 36 Guna Milan compatibility between two charts.
 */
export async function calculateCompatibilityAction(params: {
  groomNakshatra: NakshatraName;
  groomRashi: RashiName;
  brideNakshatra: NakshatraName;
  brideRashi: RashiName;
}): Promise<AstrologyActionResult<AshtakootaResult>> {
  try {
    const { user } = await requireAuth();

    const limit = checkRateLimit(`astrology:guna:${user.id}`, 60, 60_000);
    if (!limit.allowed) {
      return {
        success: false,
        error: `Calculation rate limit exceeded. Please wait ${limit.retryAfterSeconds} seconds.`,
      };
    }

    const result = calculateAshtakoota(
      params.groomNakshatra,
      params.groomRashi,
      params.brideNakshatra,
      params.brideRashi
    );

    return { success: true, data: result };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to calculate Guna Milan compatibility.",
    };
  }
}

/**
 * Calculates Vedic Panchang and Muhurats for a given calendar date and location.
 */
export async function calculateDailyPanchangAction(
  dateIso?: string,
  location?: GeoLocation
): Promise<AstrologyActionResult<PanchangResult>> {
  try {
    const targetDate = dateIso ? new Date(dateIso) : new Date();
    const loc = location || {
      latitude: 28.6139,
      longitude: 77.209,
      timezoneOffsetHours: 5.5,
      cityName: "New Delhi, India",
    };

    const panchang = calculatePanchang(targetDate, loc);
    return { success: true, data: panchang };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to compute daily Panchang.",
    };
  }
}

/**
 * Calculates Vedic & Chaldean Numerology profile.
 */
export async function calculateNumerologyAction(
  birthDate: string,
  fullName: string = "Seeker"
): Promise<AstrologyActionResult<NumerologyProfile>> {
  try {
    if (!birthDate) {
      return { success: false, error: "Birth date is required." };
    }

    const profile = calculateNumerology(birthDate, fullName);
    return { success: true, data: profile };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to compute numerology profile.",
    };
  }
}

