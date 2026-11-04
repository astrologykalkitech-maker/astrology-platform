"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCustomerContext } from "@/lib/auth/customer-guard";
import { checkRateLimit } from "@/lib/security/rate-limit";
import {
  generateVedicHoroscope,
  type HoroscopeForecast,
  type HoroscopePeriod,
} from "@/lib/astrology/horoscope";
import { ZODIAC_SIGNS } from "@/lib/astrology/transits";
import { generateFullAstrologyReport } from "@/lib/astrology";
import type { SavedHoroscopeRecord } from "@/lib/types/database.types";
import type { AuthResult } from "@/lib/types/auth.types";
import { GoogleGenAI } from "@google/genai";

export interface GetHoroscopeInput {
  signId: string; // e.g. "aries"
  period: HoroscopePeriod;
  dateStr?: string; // YYYY-MM-DD
  useAiEnrichment?: boolean;
}

export interface PersonalizedHoroscopeInput {
  kundliId: string;
  period: HoroscopePeriod;
  dateStr?: string;
  useAiEnrichment?: boolean;
}

// In-memory cache for AI enriched horoscopes to avoid duplicate API requests and protect Gemini quotas
const aiHoroscopeCache = new Map<string, { forecast: HoroscopeForecast; expiresAt: number }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Enriches deterministic Vedic horoscope with Gemini AI synthesis if configured and available.
 * Fails safely to the verified deterministic calculation if Gemini fails or is unreachable.
 * Includes deterministic memory-caching to strictly preserve API rate limits and quotas.
 */
async function enrichHoroscopeWithAi(forecast: HoroscopeForecast): Promise<HoroscopeForecast> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === "") return forecast;

  const cacheKey = `${forecast.zodiacSign}:${forecast.predictionPeriod}:${forecast.periodStart}`;
  const cached = aiHoroscopeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.forecast;
  }

  const modelCandidates = [
    process.env.GEMINI_MODEL || "gemini-2.5-flash",
    "gemini-2.5-flash",
  ].filter((v, i, a) => a.indexOf(v) === i);

  for (const model of modelCandidates) {
    try {
      const ai = new GoogleGenAI({ apiKey: apiKey.trim() });

      const prompt = `You are JyotishSetu's Master Vedic Astrology Forecast Synthesizer.
Take this verified astronomical Vedic Gochara transit data and refine the narrative explanations into compassionate, illuminating, authoritative Vedic guidance for ${forecast.zodiacName}.

Astronomical Snapshot:
- Prediction Period: ${forecast.predictionPeriod} (${forecast.periodStart} to ${forecast.periodEnd})
- Jupiter Transit: ${forecast.transits.planets.Jupiter.currentSign} in House ${forecast.transits.planets.Jupiter.houseFromRef} (${forecast.transits.planets.Jupiter.effectType})
- Saturn Transit: ${forecast.transits.planets.Saturn.currentSign} in House ${forecast.transits.planets.Saturn.houseFromRef} (${forecast.transits.planets.Saturn.effectType})
- Sade Sati Status: ${forecast.transits.sadeSatiStatus?.isActive ? forecast.transits.sadeSatiStatus.phase : "None"}
- Sun: House ${forecast.transits.planets.Sun.houseFromRef}, Mars: House ${forecast.transits.planets.Mars.houseFromRef}, Venus: House ${forecast.transits.planets.Venus.houseFromRef}, Mercury: House ${forecast.transits.planets.Mercury.houseFromRef}

Respond ONLY with a JSON object in this format (no markdown code fences):
{
  "generalOverview": "3-4 sentences of deep holistic Vedic synthesis",
  "career": "2-3 sentences regarding vocational guidance based strictly on the transit data",
  "love": "2-3 sentences on relationships and emotional life",
  "finance": "2-3 sentences on wealth and expenditure caution",
  "health": "2-3 sentences on vitality and wellness recommendations",
  "family": "2-3 sentences on domestic harmony and family relationships",
  "education": "2-3 sentences on academic learning and intellectual pursuits",
  "recommendations": ["Recommendation 1", "Recommendation 2", "Recommendation 3"]
}`;

      const generatePromise = ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.3,
          maxOutputTokens: 2500,
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        const id = setTimeout(() => {
          clearTimeout(id);
          reject(new Error(`Timeout: Gemini ${model} did not respond within 15 seconds`));
        }, 15_000);
      });

      const response = await Promise.race([generatePromise, timeoutPromise]);

      if (response && response.text) {
        let cleanText = response.text.trim();
        // Remove accidental markdown fences if returned
        if (cleanText.startsWith("```")) {
          cleanText = cleanText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
        }

        const parsed = JSON.parse(cleanText);
        if (parsed.generalOverview && parsed.career) {
          const enriched: HoroscopeForecast = {
            ...forecast,
            generalOverview: parsed.generalOverview,
            career: parsed.career || forecast.career,
            love: parsed.love || forecast.love,
            finance: parsed.finance || forecast.finance,
            health: parsed.health || forecast.health,
            family: parsed.family || forecast.family,
            education: parsed.education || forecast.education,
            recommendations: Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0
              ? parsed.recommendations
              : forecast.recommendations,
            calculationMethodology: `${forecast.calculationMethodology} + JyotishSetu AI Synthesis (${model})`,
          };

          // Cache for 6 hours
          aiHoroscopeCache.set(cacheKey, {
            forecast: enriched,
            expiresAt: Date.now() + CACHE_TTL_MS,
          });

          return enriched;
        }
      }
    } catch (err) {
      console.warn(`[enrichHoroscopeWithAi] Model ${model} failed, trying next fallback:`, err);
    }
  }

  return forecast;
}

/**
 * Server action to get horoscope predictions for any of the 12 zodiac signs and 5 periods.
 */
export async function getHoroscopeAction(
  input: GetHoroscopeInput
): Promise<AuthResult<HoroscopeForecast>> {
  try {
    const { signId, period, dateStr, useAiEnrichment } = input;

    // Validate period
    const validPeriods: HoroscopePeriod[] = ["today", "tomorrow", "weekly", "monthly", "yearly"];
    if (!validPeriods.includes(period)) {
      return { success: false, error: "Invalid prediction period selected." };
    }

    // Validate sign
    const signMeta = ZODIAC_SIGNS.find(
      (s) => s.id.toLowerCase() === signId.toLowerCase() || s.rashi.toLowerCase() === signId.toLowerCase()
    );
    if (!signMeta) {
      return { success: false, error: "Invalid zodiac sign selected." };
    }

    const baseDate = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(dateStr) : new Date();

    let forecast = generateVedicHoroscope(signMeta.id, period, baseDate);

    if (useAiEnrichment) {
      forecast = await enrichHoroscopeWithAi(forecast);
    }

    return {
      success: true,
      data: forecast,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate horoscope prediction.",
    };
  }
}

/**
 * Server action to generate personalized horoscope for authenticated customer using saved Kundli.
 */
export async function getPersonalizedHoroscopeAction(
  input: PersonalizedHoroscopeInput
): Promise<AuthResult<HoroscopeForecast>> {
  try {
    const { user, target } = await requireCustomerContext();
    const supabase = await createClient(target);

    // Rate limit
    const limit = checkRateLimit(`horoscope:personalized:${user.id}`, 20, 60_000);
    if (!limit.allowed) {
      return {
        success: false,
        error: `Calculation rate limit exceeded. Please wait ${limit.retryAfterSeconds} seconds.`,
      };
    }

    // 1. Fetch the user's saved Kundli
    const { data: initialKundli, error: kundliErr } = await supabase
      .from("kundlis")
      .select("*")
      .eq("id", input.kundliId)
      .eq("customer_id", user.id)
      .maybeSingle();

    let kundliRecord = initialKundli;

    if (kundliErr || !kundliRecord) {
      const admin = await createAdminClient("main");
      const adminRes = await admin
        .from("kundlis")
        .select("*")
        .eq("id", input.kundliId)
        .eq("customer_id", user.id)
        .maybeSingle();
      if (!adminRes.error && adminRes.data) {
        kundliRecord = adminRes.data;
      }
    }

    if (!kundliRecord) {
      return { success: false, error: "Saved Kundli chart not found for this profile." };
    }

    const birthTimeClean = (kundliRecord.time_of_birth as string).slice(0, 5);
    const fullReport = generateFullAstrologyReport({
      name: kundliRecord.name,
      gender: kundliRecord.gender === "male" || kundliRecord.gender === "female" ? kundliRecord.gender : "other",
      date: kundliRecord.date_of_birth,
      time: birthTimeClean,
      location: {
        latitude: Number(kundliRecord.latitude),
        longitude: Number(kundliRecord.longitude),
        timezoneOffsetHours: Number(kundliRecord.timezone || 5.5),
        cityName: kundliRecord.birth_place,
      },
    });

    const moonRashi = fullReport.kundli.moonSign;
    const baseDate = input.dateStr && /^\d{4}-\d{2}-\d{2}$/.test(input.dateStr) ? new Date(input.dateStr) : new Date();

    const baseForecast = generateVedicHoroscope(moonRashi, input.period, baseDate);

    // Personalize with natal Lagna, Moon sign, and Current Dasha
    const currentDasha = fullReport.kundli.currentDasha;
    const dashaText = currentDasha
      ? `Operating under ${currentDasha.mahadasha} Mahadasha – ${currentDasha.antardasha} Antardasha until ${currentDasha.endDate}.`
      : "";

    let personalizedForecast: HoroscopeForecast = {
      ...baseForecast,
      title: `Personalized Vedic Horoscope for ${kundliRecord.name} (${input.period.toUpperCase()})`,
      generalOverview: `Personalized for ${kundliRecord.name} (Natal Moon: ${moonRashi}, Ascendant: ${fullReport.kundli.ascendant.rashi}). ${dashaText} ${baseForecast.generalOverview}`,
      isPersonalized: true,
      calculationMethodology: `${baseForecast.calculationMethodology} personalized against Natal Janam Kundli of ${kundliRecord.name}`,
    };

    if (input.useAiEnrichment) {
      personalizedForecast = await enrichHoroscopeWithAi(personalizedForecast);
    }

    return {
      success: true,
      data: personalizedForecast,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate personalized horoscope.",
    };
  }
}

/**
 * Saves a generated horoscope to the customer's history.
 */
export async function saveCustomerHoroscopeAction(forecast: HoroscopeForecast, kundliId?: string): Promise<AuthResult<SavedHoroscopeRecord>> {
  try {
    const { user, target } = await requireCustomerContext();
    const supabase = await createClient(target);

    const payload = {
      customer_id: user.id,
      zodiac_sign: forecast.zodiacSign,
      period_type: forecast.predictionPeriod,
      period_start: forecast.periodStart,
      period_end: forecast.periodEnd,
      is_personalized: Boolean(forecast.isPersonalized),
      kundli_id: kundliId || null,
      horoscope_data: forecast as unknown as Record<string, unknown>,
      planetary_snapshot: forecast.transits as unknown as Record<string, unknown>,
    };

    let { data, error } = await supabase
      .from("customer_saved_horoscopes")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      const admin = await createAdminClient("main");
      const adminRes = await admin
        .from("customer_saved_horoscopes")
        .insert(payload)
        .select("*")
        .single();
      if (!adminRes.error && adminRes.data) {
        data = adminRes.data;
        error = null;
      }
    }

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/customer/horoscope");
    return {
      success: true,
      data: data as SavedHoroscopeRecord,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save horoscope.",
    };
  }
}

/**
 * Fetches the customer's saved horoscope history.
 */
export async function getCustomerSavedHoroscopesAction(): Promise<AuthResult<SavedHoroscopeRecord[]>> {
  try {
    const { user, target } = await requireCustomerContext();
    const supabase = await createClient(target);

    let { data, error } = await supabase
      .from("customer_saved_horoscopes")
      .select("*")
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      const admin = await createAdminClient("main");
      const adminRes = await admin
        .from("customer_saved_horoscopes")
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
      data: (data || []) as SavedHoroscopeRecord[],
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load saved horoscopes.",
    };
  }
}

/**
 * Deletes a saved horoscope by ID.
 */
export async function deleteCustomerHoroscopeAction(id: string): Promise<AuthResult<boolean>> {
  try {
    const { user, target } = await requireCustomerContext();
    const supabase = await createClient(target);

    let { error } = await supabase
      .from("customer_saved_horoscopes")
      .delete()
      .eq("id", id)
      .eq("customer_id", user.id);

    if (error) {
      const admin = await createAdminClient("main");
      const adminRes = await admin
        .from("customer_saved_horoscopes")
        .delete()
        .eq("id", id)
        .eq("customer_id", user.id);
      error = adminRes.error;
    }

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/customer/horoscope");
    return { success: true, data: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete saved horoscope.",
    };
  }
}
