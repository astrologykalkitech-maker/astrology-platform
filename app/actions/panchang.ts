"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCustomerContext } from "@/lib/auth/customer-guard";
import { calculatePanchang } from "@/lib/astrology/panchang";
import type { PanchangResult, PanchangLocation } from "@/lib/astrology/types";
import type { CustomerPanchangPreferenceRecord } from "@/lib/types/database.types";
import type { AuthResult } from "@/lib/types/auth.types";

export interface GetPanchangInput {
  date: string; // YYYY-MM-DD
  location: {
    city: string;
    state?: string;
    country?: string;
    latitude: number;
    longitude: number;
    timezoneId?: string;
    timezoneOffsetHours?: number;
  };
}

/**
 * Resolves standard IANA timezone offset hours from date and timezone ID.
 */
function resolveTimezoneOffset(dateStr: string, timeZone: string): number {
  try {
    const testDate = new Date(`${dateStr}T12:00:00Z`);
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
    });
    const parts = dtf.formatToParts(testDate);
    const tzPart = parts.find((p) => p.type === "timeZoneName")?.value;
    if (!tzPart || tzPart === "GMT" || tzPart === "UTC") return 0;
    const match = tzPart.match(/GMT([+-])(\d+)(?::(\d+))?/);
    if (match) {
      const sign = match[1] === "+" ? 1 : -1;
      const hours = parseInt(match[2], 10);
      const minutes = match[3] ? parseInt(match[3], 10) : 0;
      return sign * (hours + minutes / 60);
    }
    return 5.5; // standard IST fallback for Indian context
  } catch {
    return 5.5;
  }
}

/**
 * Server action to calculate complete location-aware daily Vedic Panchang.
 */
export async function getDailyPanchangAction(
  input: GetPanchangInput
): Promise<AuthResult<PanchangResult>> {
  try {
    const { date: dateStr, location } = input;

    // Validate date format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return { success: false, error: "Invalid date format. Expected YYYY-MM-DD." };
    }

    // Validate coordinates
    if (
      typeof location.latitude !== "number" ||
      typeof location.longitude !== "number" ||
      isNaN(location.latitude) ||
      isNaN(location.longitude) ||
      location.latitude < -90 ||
      location.latitude > 90 ||
      location.longitude < -180 ||
      location.longitude > 180
    ) {
      return { success: false, error: "Invalid coordinates provided." };
    }

    const city = location.city?.trim() || "Selected Location";
    const timezoneId = location.timezoneId?.trim() || "Asia/Kolkata";
    const timezoneOffsetHours =
      typeof location.timezoneOffsetHours === "number" && !isNaN(location.timezoneOffsetHours)
        ? location.timezoneOffsetHours
        : resolveTimezoneOffset(dateStr, timezoneId);

    const [yearStr, monthStr, dayStr] = dateStr.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);

    // Construct local midday Date to prevent crossing calendar boundary
    const localTargetDate = new Date(year, month - 1, day, 12, 0, 0);

    const panchangLocation: PanchangLocation = {
      city,
      state: location.state?.trim(),
      country: location.country?.trim() || "India",
      latitude: location.latitude,
      longitude: location.longitude,
      timezoneId,
      timezoneOffsetHours,
    };

    const panchang = calculatePanchang(localTargetDate, panchangLocation);

    return {
      success: true,
      data: panchang,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to calculate Vedic Panchang.",
    };
  }
}

/**
 * Retrieves the saved Panchang location preference for the authenticated customer.
 */
export async function getCustomerPanchangPreferenceAction(): Promise<
  AuthResult<CustomerPanchangPreferenceRecord | null>
> {
  try {
    const customerContext = await requireCustomerContext();
    if (!customerContext || !customerContext.profile) {
      return { success: true, data: null };
    }

    const supabase = await createClient();
    let { data, error } = await supabase
      .from("customer_panchang_preferences")
      .select("*")
      .eq("customer_id", customerContext.profile.id)
      .maybeSingle();

    if (error) {
      const admin = await createAdminClient("main");
      const adminRes = await admin
        .from("customer_panchang_preferences")
        .select("*")
        .eq("customer_id", customerContext.profile.id)
        .maybeSingle();
      if (!adminRes.error && adminRes.data) {
        data = adminRes.data;
        error = null;
      }
    }

    if (error && error.code !== "PGRST116") {
      return { success: true, data: null };
    }

    return {
      success: true,
      data: (data as CustomerPanchangPreferenceRecord) || null,
    };
  } catch {
    return { success: true, data: null };
  }
}

/**
 * Saves or updates the customer's Panchang location preference.
 */
export async function saveCustomerPanchangPreferenceAction(preference: {
  city: string;
  state?: string;
  country?: string;
  latitude: number;
  longitude: number;
  timezoneId?: string;
  timezoneOffset?: number;
}): Promise<AuthResult<CustomerPanchangPreferenceRecord>> {
  try {
    const customerContext = await requireCustomerContext();
    if (!customerContext || !customerContext.profile) {
      return { success: false, error: "Please log in to save location preferences." };
    }

    if (
      typeof preference.latitude !== "number" ||
      typeof preference.longitude !== "number" ||
      isNaN(preference.latitude) ||
      isNaN(preference.longitude)
    ) {
      return { success: false, error: "Invalid location coordinates." };
    }

    const supabase = await createClient();
    const customerId = customerContext.profile.id;

    const payload = {
      customer_id: customerId,
      city_name: preference.city.trim(),
      state_name: preference.state?.trim() || null,
      country_name: preference.country?.trim() || "India",
      latitude: preference.latitude,
      longitude: preference.longitude,
      timezone_id: preference.timezoneId?.trim() || "Asia/Kolkata",
      timezone_offset: preference.timezoneOffset ?? 5.5,
      updated_at: new Date().toISOString(),
    };

    let { data, error } = await supabase
      .from("customer_panchang_preferences")
      .upsert(payload, { onConflict: "customer_id" })
      .select()
      .single();

    if (error) {
      const admin = await createAdminClient("main");
      const adminRes = await admin
        .from("customer_panchang_preferences")
        .upsert(payload, { onConflict: "customer_id" })
        .select()
        .single();
      if (!adminRes.error && adminRes.data) {
        data = adminRes.data;
        error = null;
      }
    }

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/customer/panchang");
    return {
      success: true,
      data: data as CustomerPanchangPreferenceRecord,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to persist location preference.",
    };
  }
}
