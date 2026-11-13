"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  calculateComprehensiveNumerology,
  compareNameSpellings,
  type ComprehensiveNumerologyReport,
  type NameSpellingComparison,
} from "@/lib/astrology/numerology-engine";

export interface CalculateNumerologyInput {
  fullName: string;
  dateOfBirth: string; // YYYY-MM-DD
  birthTime?: string | null; // HH:MM
  birthPlace?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: number | null;
  saveToProfile?: boolean;
}

/**
 * Calculates authoritative Numerology report and persists it to customer_numerology_reports.
 */
export async function calculateAndSaveNumerologyAction(
  input: CalculateNumerologyInput
): Promise<{
  success: boolean;
  report?: ComprehensiveNumerologyReport;
  error?: string;
}> {
  try {
    // 1. Validation
    const cleanName = input.fullName?.trim();
    if (!cleanName || cleanName.length < 2) {
      return { success: false, error: "Please enter a valid full name (at least 2 letters)." };
    }

    if (!input.dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(input.dateOfBirth)) {
      return { success: false, error: "Please provide a valid date of birth (YYYY-MM-DD)." };
    }

    const birthDate = new Date(input.dateOfBirth);
    if (birthDate > new Date()) {
      return { success: false, error: "Date of birth cannot be in the future." };
    }

    // 2. Authoritative Server Calculation
    const report = calculateComprehensiveNumerology({
      fullName: cleanName,
      dateOfBirth: input.dateOfBirth,
      birthTime: input.birthTime || null,
      birthPlace: input.birthPlace || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      timezone: input.timezone ?? 5.5,
    });

    // 3. Database Persistence if authenticated
    const user = await getCurrentUser();
    if (user && input.saveToProfile !== false) {
      try {
        const admin = await createAdminClient("main");
        await admin.from("customer_numerology_reports").insert({
          customer_id: user.id,
          full_name: cleanName,
          birth_date: input.dateOfBirth,
          profile_data: report as any,
        });
      } catch (dbErr) {
        console.warn("[Numerology] Failed to save report to database:", dbErr);
      }
    }

    revalidatePath("/customer/numerology");
    return {
      success: true,
      report,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Failed to calculate numerology vibrations.",
    };
  }
}

/**
 * Explores alternative name spellings with compatibility evaluation against Moolank and Bhagyank.
 */
export async function compareNameSpellingsAction(params: {
  names: string[];
  moolank: number;
  bhagyank: number;
}): Promise<{
  success: boolean;
  comparisons: NameSpellingComparison[];
  error?: string;
}> {
  try {
    const validNames = params.names.filter((n) => typeof n === "string" && n.trim().length > 0);
    if (validNames.length === 0) {
      return { success: false, comparisons: [], error: "No valid names provided for comparison." };
    }

    const comparisons = compareNameSpellings(validNames, params.moolank, params.bhagyank);
    return {
      success: true,
      comparisons,
    };
  } catch (err: any) {
    return {
      success: false,
      comparisons: [],
      error: err.message || "Failed to compare name vibrations.",
    };
  }
}

