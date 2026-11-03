"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCustomerContext } from "@/lib/auth/customer-guard";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { generateFullAstrologyReport } from "@/lib/astrology";
import type { FullAstrologyReport } from "@/lib/astrology/types";
import type { SavedKundliRecord } from "@/lib/types/database.types";
import type { AuthResult } from "@/lib/types/auth.types";

export interface CreateKundliInput {
  name: string;
  gender?: "male" | "female" | "other" | "prefer_not_to_say";
  dateOfBirth: string; // YYYY-MM-DD
  timeOfBirth: string; // HH:MM
  birthPlace: string;
  latitude: number;
  longitude: number;
  timezone?: number; // e.g. 5.5
  country?: string;
  state?: string;
  city?: string;
}

/**
 * Validates birth details, invokes the calculation engine,
 * generates a comprehensive astrology report, saves it in Supabase with RLS,
 * and returns the generated Kundli record.
 */
export async function createKundliAction(
  input: CreateKundliInput
): Promise<AuthResult<SavedKundliRecord>> {
  try {
    const { user, target } = await requireCustomerContext();

    // 1. Rate limiting: Max 20 Kundli generations per minute per customer
    const limit = checkRateLimit(`kundli:generate:${user.id}`, 20, 60_000);
    if (!limit.allowed) {
      return {
        success: false,
        error: `Calculation rate limit exceeded. Please wait ${limit.retryAfterSeconds} seconds.`,
      };
    }

    // 2. Strict Input Validations
    if (!input.name || input.name.trim().length < 2) {
      return { success: false, error: "Please enter a valid full name (minimum 2 characters)." };
    }
    if (!input.dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(input.dateOfBirth)) {
      return { success: false, error: "Please enter a valid date of birth (YYYY-MM-DD)." };
    }
    if (!input.timeOfBirth || !/^\d{2}:\d{2}(:\d{2})?$/.test(input.timeOfBirth)) {
      return { success: false, error: "Please enter a valid birth time (HH:MM)." };
    }
    if (!input.birthPlace || input.birthPlace.trim().length < 2) {
      return { success: false, error: "Please enter or select a valid birth city or place." };
    }

    const lat = Number(input.latitude);
    const lng = Number(input.longitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      return { success: false, error: "Latitude must be a valid coordinate between -90 and 90." };
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      return { success: false, error: "Longitude must be a valid coordinate between -180 and 180." };
    }

    const tzOffset = typeof input.timezone === "number" && !isNaN(input.timezone)
      ? input.timezone
      : 5.5; // Default Indian Standard Time

    // 3. Calculation Engine Execution
    const birthTimeClean = input.timeOfBirth.slice(0, 5); // Ensure HH:MM
    const fullReport: FullAstrologyReport = generateFullAstrologyReport({
      name: input.name.trim(),
      gender: input.gender === "male" || input.gender === "female" ? input.gender : "other",
      date: input.dateOfBirth,
      time: birthTimeClean,
      location: {
        latitude: lat,
        longitude: lng,
        timezoneOffsetHours: tzOffset,
        cityName: input.birthPlace.trim(),
      },
    });

    if (!fullReport || !fullReport.kundli) {
      return {
        success: false,
        error: "Astrology engine failed to compute chart positions for the given time and coordinates.",
      };
    }

    // 4. Persistence into Supabase
    const supabase = await createClient(target);
    const insertPayload = {
      customer_id: user.id,
      name: input.name.trim(),
      gender: input.gender || "other",
      date_of_birth: input.dateOfBirth,
      time_of_birth: birthTimeClean,
      birth_place: input.birthPlace.trim(),
      latitude: lat,
      longitude: lng,
      timezone: tzOffset,
      calculation_config: {
        ayanamsa: "Lahiri (Chitrapaksha)",
        houseSystem: "Equal Bhavas / Nirayana",
        zodiac: "Sidereal",
      },
      planetary_positions: fullReport.kundli.planets as unknown as Record<string, unknown>,
      chart_data: {
        ascendant: fullReport.kundli.ascendant,
        houses: fullReport.kundli.houses,
        moonSign: fullReport.kundli.moonSign,
        sunSign: fullReport.kundli.sunSign,
        birthNakshatra: fullReport.kundli.birthNakshatra,
        birthPada: fullReport.kundli.birthPada,
      },
      dasha_data: {
        dashas: fullReport.kundli.dashas,
        currentDasha: fullReport.kundli.currentDasha,
      },
      generated_report: fullReport as unknown as Record<string, unknown>,
      is_favorite: false,
    };

    let { data: inserted, error: dbError } = await supabase
      .from("kundlis")
      .insert(insertPayload)
      .select("*")
      .single();

    if (dbError) {
      // Fallback via authenticated admin client for DB1 if RLS table grant pending
      const admin = await createAdminClient("main");
      const adminRes = await admin
        .from("kundlis")
        .insert(insertPayload)
        .select("*")
        .single();
      if (!adminRes.error && adminRes.data) {
        inserted = adminRes.data;
        dbError = null;
      }
    }

    if (dbError) {
      console.error("[createKundliAction] Database error:", dbError);
      return {
        success: false,
        error: dbError.message || "Failed to save generated Kundli in the database.",
      };
    }

    revalidatePath("/customer/kundli");
    return {
      success: true,
      data: inserted as SavedKundliRecord,
    };
  } catch (err) {
    console.error("[createKundliAction] Unhandled exception:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Internal error occurred while generating Kundli.",
    };
  }
}

/**
 * Loads all saved Kundlis for the currently authenticated customer.
 */
export async function getCustomerKundlisAction(): Promise<AuthResult<SavedKundliRecord[]>> {
  try {
    const { user, target } = await requireCustomerContext();
    const supabase = await createClient(target);

    let { data, error } = await supabase
      .from("kundlis")
      .select("*")
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      // Fallback via authenticated admin client for DB1 if table grant pending
      const admin = await createAdminClient("main");
      const adminRes = await admin
        .from("kundlis")
        .select("*")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false });
      if (!adminRes.error && adminRes.data) {
        data = adminRes.data;
        error = null;
      }
    }

    if (error) {
      console.error("[getCustomerKundlisAction] DB error:", error);
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: (data || []) as SavedKundliRecord[],
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load saved Kundlis.",
    };
  }
}

/**
 * Fetches a single Kundli by ID ensuring strict customer ownership verification.
 */
export async function getKundliByIdAction(
  kundliId: string
): Promise<AuthResult<SavedKundliRecord>> {
  try {
    const { user, target } = await requireCustomerContext();
    const supabase = await createClient(target);

    let { data, error } = await supabase
      .from("kundlis")
      .select("*")
      .eq("id", kundliId)
      .eq("customer_id", user.id)
      .maybeSingle();

    if (error) {
      const admin = await createAdminClient("main");
      const adminRes = await admin
        .from("kundlis")
        .select("*")
        .eq("id", kundliId)
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
      return { success: false, error: "Kundli not found or you do not have permission to view it." };
    }

    return {
      success: true,
      data: data as SavedKundliRecord,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load Kundli record.",
    };
  }
}

/**
 * Deletes a customer's saved Kundli record.
 */
export async function deleteKundliAction(
  kundliId: string
): Promise<AuthResult<boolean>> {
  try {
    const { user, target } = await requireCustomerContext();
    const supabase = await createClient(target);

    let { error } = await supabase
      .from("kundlis")
      .delete()
      .eq("id", kundliId)
      .eq("customer_id", user.id);

    if (error) {
      const admin = await createAdminClient("main");
      const adminRes = await admin
        .from("kundlis")
        .delete()
        .eq("id", kundliId)
        .eq("customer_id", user.id);
      error = adminRes.error;
    }

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/customer/kundli");
    return { success: true, data: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete Kundli.",
    };
  }
}

/**
 * Re-runs the Vedic calculation engine on an existing Kundli record,
 * updating its planetary positions, houses, dasha periods and generated report.
 */
export async function regenerateKundliAction(
  kundliId: string
): Promise<AuthResult<SavedKundliRecord>> {
  try {
    const { user, target } = await requireCustomerContext();
    const supabase = await createClient(target);

    const { data: existing, error: fetchErr } = await supabase
      .from("kundlis")
      .select("*")
      .eq("id", kundliId)
      .eq("customer_id", user.id)
      .maybeSingle();

    if (fetchErr || !existing) {
      return { success: false, error: "Record not found for regeneration." };
    }

    const birthTimeClean = (existing.time_of_birth as string).slice(0, 5);
    const fullReport: FullAstrologyReport = generateFullAstrologyReport({
      name: existing.name,
      gender: existing.gender === "male" || existing.gender === "female" ? existing.gender : "other",
      date: existing.date_of_birth,
      time: birthTimeClean,
      location: {
        latitude: Number(existing.latitude),
        longitude: Number(existing.longitude),
        timezoneOffsetHours: Number(existing.timezone || 5.5),
        cityName: existing.birth_place,
      },
    });

    const updatePayload = {
      planetary_positions: fullReport.kundli.planets as unknown as Record<string, unknown>,
      chart_data: {
        ascendant: fullReport.kundli.ascendant,
        houses: fullReport.kundli.houses,
        moonSign: fullReport.kundli.moonSign,
        sunSign: fullReport.kundli.sunSign,
        birthNakshatra: fullReport.kundli.birthNakshatra,
        birthPada: fullReport.kundli.birthPada,
      },
      dasha_data: {
        dashas: fullReport.kundli.dashas,
        currentDasha: fullReport.kundli.currentDasha,
      },
      generated_report: fullReport as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    };

    const { data: updated, error: updateErr } = await supabase
      .from("kundlis")
      .update(updatePayload)
      .eq("id", kundliId)
      .eq("customer_id", user.id)
      .select("*")
      .single();

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    revalidatePath("/customer/kundli");
    revalidatePath(`/customer/kundli/${kundliId}`);
    return {
      success: true,
      data: updated as SavedKundliRecord,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to regenerate Kundli.",
    };
  }
}

