"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCustomerContext } from "@/lib/auth/customer-guard";
import { checkRateLimit } from "@/lib/security/rate-limit";
import {
  generateFullAstrologyReport,
  calculateAshtakoota,
  type AshtakootaResult,
  type FullAstrologyReport,
  type KundliChart,
} from "@/lib/astrology";
import type { SavedKundliMilanRecord } from "@/lib/types/database.types";
import type { AuthResult } from "@/lib/types/auth.types";

export interface PartnerBirthInput {
  name: string;
  gender?: "male" | "female" | "other" | "prefer_not_to_say";
  dateOfBirth: string; // YYYY-MM-DD
  timeOfBirth: string; // HH:MM
  birthPlace: string;
  latitude: number;
  longitude: number;
  timezone?: number; // e.g. 5.5
}

export interface CalculateKundliMilanInput {
  partnerA: PartnerBirthInput;
  partnerB: PartnerBirthInput;
}

/**
 * Checks Mangal (Kuja) Dosha for a chart.
 * In classical Vedic astrology, Mars placed in houses 1, 4, 7, 8, or 12 from Lagna creates Manglik Dosha.
 */
function evaluateManglik(chart: KundliChart): { isManglik: boolean; marsHouse: number; reason: string } {
  const mars = chart.planets.Mars;
  const house = mars ? mars.house : 1;
  const manglikHouses = [1, 4, 7, 8, 12];
  const isManglik = manglikHouses.includes(house);

  return {
    isManglik,
    marsHouse: house,
    reason: isManglik
      ? `Mars situated in House ${house} (an auspicious or sensitive marital Bhava).`
      : `Mars safely situated in House ${house}.`,
  };
}

/**
 * Generates birth charts for both individuals, calculates authentic Ashtakoota 36-Guna matching,
 * evaluates Manglik & Nadi & Bhakoot Doshas, saves the record to Supabase, and returns the result.
 */
export async function calculateAndSaveKundliMilanAction(
  input: CalculateKundliMilanInput
): Promise<AuthResult<SavedKundliMilanRecord>> {
  try {
    const { user, target } = await requireCustomerContext();

    // 1. Rate limiting: 20 calculations per minute
    const limit = checkRateLimit(`milan:generate:${user.id}`, 20, 60_000);
    if (!limit.allowed) {
      return {
        success: false,
        error: `Calculation rate limit exceeded. Please wait ${limit.retryAfterSeconds} seconds.`,
      };
    }

    const { partnerA, partnerB } = input;

    // 2. Strict Input Validations
    if (!partnerA.name?.trim() || partnerA.name.trim().length < 2) {
      return { success: false, error: "Please enter a valid name for Partner 1." };
    }
    if (!partnerB.name?.trim() || partnerB.name.trim().length < 2) {
      return { success: false, error: "Please enter a valid name for Partner 2." };
    }

    if (!partnerA.dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(partnerA.dateOfBirth)) {
      return { success: false, error: "Please select a valid date of birth for Partner 1." };
    }
    if (!partnerB.dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(partnerB.dateOfBirth)) {
      return { success: false, error: "Please select a valid date of birth for Partner 2." };
    }

    if (!partnerA.timeOfBirth || !partnerB.timeOfBirth) {
      return { success: false, error: "Exact birth time is required for both partners." };
    }

    if (!partnerA.birthPlace?.trim() || !partnerB.birthPlace?.trim()) {
      return { success: false, error: "Birthplace is required for both partners." };
    }

    const pALat = Number(partnerA.latitude);
    const pALng = Number(partnerA.longitude);
    const pBLat = Number(partnerB.latitude);
    const pBLng = Number(partnerB.longitude);

    if (isNaN(pALat) || isNaN(pALng) || isNaN(pBLat) || isNaN(pBLng)) {
      return { success: false, error: "Valid geographic coordinates are required for both birthplaces." };
    }

    const pATz = typeof partnerA.timezone === "number" ? partnerA.timezone : 5.5;
    const pBTz = typeof partnerB.timezone === "number" ? partnerB.timezone : 5.5;

    // 3. Compute Full Astrological Charts for Both Individuals
    const reportA: FullAstrologyReport = generateFullAstrologyReport({
      name: partnerA.name.trim(),
      gender: partnerA.gender === "male" || partnerA.gender === "female" ? partnerA.gender : "other",
      date: partnerA.dateOfBirth,
      time: partnerA.timeOfBirth.slice(0, 5),
      location: {
        latitude: pALat,
        longitude: pALng,
        timezoneOffsetHours: pATz,
        cityName: partnerA.birthPlace.trim(),
      },
    });

    const reportB: FullAstrologyReport = generateFullAstrologyReport({
      name: partnerB.name.trim(),
      gender: partnerB.gender === "male" || partnerB.gender === "female" ? partnerB.gender : "other",
      date: partnerB.dateOfBirth,
      time: partnerB.timeOfBirth.slice(0, 5),
      location: {
        latitude: pBLat,
        longitude: pBLng,
        timezoneOffsetHours: pBTz,
        cityName: partnerB.birthPlace.trim(),
      },
    });

    if (!reportA?.kundli || !reportB?.kundli) {
      return { success: false, error: "Astronomical calculation failed for one or both birth details." };
    }

    // 4. Compute Ashtakoota 36 Guna Milan Using Actual Moon Nakshatras & Rashis
    const groomNakshatra = reportA.kundli.birthNakshatra;
    const groomRashi = reportA.kundli.moonSign;
    const brideNakshatra = reportB.kundli.birthNakshatra;
    const brideRashi = reportB.kundli.moonSign;

    const ashtakoota: AshtakootaResult = calculateAshtakoota(
      groomNakshatra,
      groomRashi,
      brideNakshatra,
      brideRashi
    );

    // 5. Evaluate Individual Manglik Status
    const manglikA = evaluateManglik(reportA.kundli);
    const manglikB = evaluateManglik(reportB.kundli);

    const doshasSummary = {
      nadiDosha: ashtakoota.doshas.nadiDosha,
      bhakootDosha: ashtakoota.doshas.bhakootDosha,
      manglikPartnerA: manglikA.isManglik,
      manglikPartnerB: manglikB.isManglik,
      manglikReasonA: manglikA.reason,
      manglikReasonB: manglikB.reason,
      cancellations: ashtakoota.doshas.cancellations,
    };

    // 6. Persist into Supabase
    const supabase = await createClient(target);
    const insertPayload = {
      customer_id: user.id,
      partner_a_name: partnerA.name.trim(),
      partner_a_gender: partnerA.gender || "male",
      partner_a_dob: partnerA.dateOfBirth,
      partner_a_tob: partnerA.timeOfBirth.slice(0, 5),
      partner_a_birth_place: partnerA.birthPlace.trim(),
      partner_a_latitude: pALat,
      partner_a_longitude: pALng,
      partner_a_timezone: pATz,

      partner_b_name: partnerB.name.trim(),
      partner_b_gender: partnerB.gender || "female",
      partner_b_dob: partnerB.dateOfBirth,
      partner_b_tob: partnerB.timeOfBirth.slice(0, 5),
      partner_b_birth_place: partnerB.birthPlace.trim(),
      partner_b_latitude: pBLat,
      partner_b_longitude: pBLng,
      partner_b_timezone: pBTz,

      partner_a_chart: {
        ascendant: reportA.kundli.ascendant,
        planets: reportA.kundli.planets,
        houses: reportA.kundli.houses,
        moonSign: reportA.kundli.moonSign,
        sunSign: reportA.kundli.sunSign,
        birthNakshatra: reportA.kundli.birthNakshatra,
        birthPada: reportA.kundli.birthPada,
      },
      partner_b_chart: {
        ascendant: reportB.kundli.ascendant,
        planets: reportB.kundli.planets,
        houses: reportB.kundli.houses,
        moonSign: reportB.kundli.moonSign,
        sunSign: reportB.kundli.sunSign,
        birthNakshatra: reportB.kundli.birthNakshatra,
        birthPada: reportB.kundli.birthPada,
      },
      ashtakoota_scores: ashtakoota.scores as unknown as Record<string, unknown>,
      total_score: ashtakoota.totalScore,
      percentage: ashtakoota.percentage,
      is_compatible: ashtakoota.isCompatible,
      category: ashtakoota.category,
      doshas: doshasSummary as unknown as Record<string, unknown>,
      full_report: {
        recommendation: ashtakoota.recommendation,
        reportA: {
          panchang: reportA.panchang,
          numerology: reportA.numerology,
          remedies: reportA.remedies,
        },
        reportB: {
          panchang: reportB.panchang,
          numerology: reportB.numerology,
          remedies: reportB.remedies,
        },
      },
    };

    let { data: inserted, error: dbError } = await supabase
      .from("kundli_milans")
      .insert(insertPayload)
      .select("*")
      .single();

    if (dbError) {
      const admin = await createAdminClient("main");
      const adminRes = await admin
        .from("kundli_milans")
        .insert(insertPayload)
        .select("*")
        .single();
      if (!adminRes.error && adminRes.data) {
        inserted = adminRes.data;
        dbError = null;
      }
    }

    if (dbError) {
      console.error("[calculateAndSaveKundliMilanAction] DB Error:", dbError);
      return {
        success: false,
        error: dbError.message || "Failed to save Kundli Milan record in database.",
      };
    }

    revalidatePath("/customer/kundli-milan");
    return {
      success: true,
      data: inserted as SavedKundliMilanRecord,
    };
  } catch (err) {
    console.error("[calculateAndSaveKundliMilanAction] Exception:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Internal error occurred while calculating Kundli Milan.",
    };
  }
}

/**
 * Loads all saved Kundli Milan compatibility reports for the authenticated customer.
 */
export async function getCustomerKundliMilansAction(): Promise<AuthResult<SavedKundliMilanRecord[]>> {
  try {
    const { user, target } = await requireCustomerContext();
    const supabase = await createClient(target);

    let { data, error } = await supabase
      .from("kundli_milans")
      .select("*")
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      const admin = await createAdminClient("main");
      const adminRes = await admin
        .from("kundli_milans")
        .select("*")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false });
      if (!adminRes.error && adminRes.data) {
        data = adminRes.data;
        error = null;
      }
    }

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: (data || []) as SavedKundliMilanRecord[],
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load saved Kundli Milan records.",
    };
  }
}

/**
 * Loads a single Kundli Milan compatibility report by ID with ownership verification.
 */
export async function getKundliMilanByIdAction(
  id: string
): Promise<AuthResult<SavedKundliMilanRecord>> {
  try {
    const { user, target } = await requireCustomerContext();
    const supabase = await createClient(target);

    let { data, error } = await supabase
      .from("kundli_milans")
      .select("*")
      .eq("id", id)
      .eq("customer_id", user.id)
      .maybeSingle();

    if (error) {
      const admin = await createAdminClient("main");
      const adminRes = await admin
        .from("kundli_milans")
        .select("*")
        .eq("id", id)
        .eq("customer_id", user.id)
        .maybeSingle();
      if (!adminRes.error && adminRes.data) {
        data = adminRes.data;
        error = null;
      }
    }

    if (error) {
      return { success: false, error: error.message };
    }
    if (!data) {
      return { success: false, error: "Compatibility record not found or permission denied." };
    }

    return {
      success: true,
      data: data as SavedKundliMilanRecord,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to fetch Kundli Milan record.",
    };
  }
}

/**
 * Deletes a customer's saved Kundli Milan report.
 */
export async function deleteKundliMilanAction(id: string): Promise<AuthResult<boolean>> {
  try {
    const { user, target } = await requireCustomerContext();
    const supabase = await createClient(target);

    let { error } = await supabase
      .from("kundli_milans")
      .delete()
      .eq("id", id)
      .eq("customer_id", user.id);

    if (error) {
      const admin = await createAdminClient("main");
      const adminRes = await admin
        .from("kundli_milans")
        .delete()
        .eq("id", id)
        .eq("customer_id", user.id);
      error = adminRes.error;
    }

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/customer/kundli-milan");
    return { success: true, data: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete Kundli Milan report.",
    };
  }
}

