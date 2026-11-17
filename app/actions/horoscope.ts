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
 * Deterministic Vedic Deep Synthesis Engine.
 * Generates an advanced, multifaceted astrological synthesis grounded strictly in classical Gochara,
 * planetary Drishti (aspects), transit Bhavas, and life dimension impacts when Gemini AI is not configured or unavailable.
 */
function generateDeterministicDeepSynthesis(forecast: HoroscopeForecast): HoroscopeForecast {
  const transits = forecast.transits;
  const p = transits.planets;
  const jup = p.Jupiter;
  const sat = p.Saturn;
  const sun = p.Sun;
  const mars = p.Mars;
  const ven = p.Venus;
  const merc = p.Mercury;
  const moon = p.Moon;
  const rahu = p.Rahu;
  const ketu = p.Ketu;
  const sadeSati = transits.sadeSatiStatus;

  const isGuruBenefic = [1, 2, 5, 7, 9, 11].includes(jup.houseFromRef);
  const isShaniChallenging = [1, 2, 4, 8, 12].includes(sat.houseFromRef) || sadeSati?.isActive;

  // 1. Holistic General Overview Synthesis
  let generalOverview = `Deep Vedic astrological synthesis for ${forecast.zodiacName} reveals an active planetary alignment during this ${forecast.predictionPeriod} cycle. `;
  if (isGuruBenefic && !isShaniChallenging) {
    generalOverview += `Devaguru Jupiter transits House ${jup.houseFromRef} (${jup.currentSign}), casting an auspicious cosmic Drishti (aspect) over your life axis. This celestial shield enhances your natural discernment, ethical conviction, and strategic clarity. Concurrently, Surya in House ${sun.houseFromRef} vitalizes your core purpose—making this an optimal window for initiating ambitious ventures, seeking mentor counsel, and securing long-term authority.`;
  } else if (sadeSati?.isActive) {
    generalOverview += `Shani Dev commands your karmic blueprint through House ${sat.houseFromRef} (${sadeSati.phase} phase of Sade Sati). This deep synthesis indicates a transformative period of spiritual tempering and accountability: obsolete attachments are systematically cleared so enduring foundations can take root. Jupiter in House ${jup.houseFromRef} acts as a vital buffer; prioritize patient perseverance, transparent dealings, and routine spiritual contemplation over impulsive shortcuts.`;
  } else if (isShaniChallenging) {
    generalOverview += `Saturn transits House ${sat.houseFromRef}, urging introspection and methodical diligence, while Rahu in House ${rahu.houseFromRef} and Ketu in House ${ketu.houseFromRef} energize worldly ambitions and karmic detachments. Harmonizing Mars's active drive in House ${mars.houseFromRef} with structured patience will turn potential friction into substantial inner mastery.`;
  } else {
    generalOverview += `A remarkably balanced transit momentum prevails. With the Moon traversing House ${moon.houseFromRef} and Mercury in House ${merc.houseFromRef}, your perceptual acuity and emotional intuition are in fine synchrony. Jupiter's stabilizing influence ensures that thoughtful, consistent efforts across your vocational and personal responsibilities yield compounding progress.`;
  }

  // 2. Career & Profession (Karma Bhava 10th & Upachaya Houses 3, 6, 10, 11)
  let career = `Karma Bhava (10th House) & Upachaya Transit Analysis: `;
  if ([10, 6, 1].includes(sat.houseFromRef) || [10, 6, 1].includes(mars.houseFromRef)) {
    career += `Saturn and Mars activate pivotal action-oriented houses, instilling high physical stamina and professional grit. Key decision-makers are quietly monitoring your execution under pressure. Maintain complete diplomacy in workspace interactions and channel this intense drive into high-complexity deliverables where precision matters most.`;
  } else if ([10, 2, 11].includes(jup.houseFromRef) || [10, 2, 11].includes(merc.houseFromRef)) {
    career += `Auspicious Jovian and Mercurial rays illuminate vocational growth, client negotiations, and professional goodwill. Ideal momentum for presenting innovative proposals, completing milestone deliverables, and forging alliances with respected industry seniors.`;
  } else {
    career += `Steady operational progression. Focus on standardizing administrative workflows, auditing ongoing deliverables, and upgrading specialized skills. Today's quiet consistency establishes the foundation for upcoming leadership milestones.`;
  }

  // 3. Love & Relationships (Kalatra Bhava 7th & Purva Punya 5th)
  let love = `Kalatra Bhava (7th House) & Emotional Axis: `;
  if ([5, 7, 11].includes(ven.houseFromRef) || [5, 7, 9].includes(jup.houseFromRef)) {
    love += `Venus in House ${ven.houseFromRef} paired with Jupiter's benevolent grace fosters tender empathy, affectionate dialogue, and deep mutual respect. Married couples find common ground on shared goals, while singles encounter meaningful conversations with individuals who resonate with their dharmic values.`;
  } else if ([1, 7, 8].includes(mars.houseFromRef)) {
    love += `Mars casts an energetic glance across your relational sphere. Exercise mindful emotional regulation: refrain from reactive debates over trivial domestic matters. Channel dynamic passion into joint outdoor activities, creative hobbies, or shared physical wellness.`;
  } else {
    love += `Tranquil relational currents. Genuine, unhurried listening and thoughtful small gestures dissolve everyday stress, reinforcing enduring emotional warmth within family and romantic partnerships.`;
  }

  // 4. Finance & Wealth (Dhana Bhavas 2nd & 11th)
  let finance = `Dhana Bhavas (2nd & 11th Houses) & Artha Analysis: `;
  if ([2, 11].includes(jup.houseFromRef) || [2, 11].includes(ven.houseFromRef)) {
    finance += `Highly supportive planetary current for financial equilibrium and sustained resource generation. Benefic placements across Dhana and Labha Bhavas favor prudent asset allocation, systematic savings, and resolving pending accounts. Prioritize long-term security over speculative temptations.`;
  } else if ([12, 8].includes(rahu.houseFromRef) || [12, 8].includes(sat.houseFromRef)) {
    finance += `Prudence in expenditure is strongly advised. Maintain an organized ledger, scrutinize contractual terms before commitments, and build a liquid safety buffer to guard against unexpected lifestyle or travel outlays.`;
  } else {
    finance += `Predictable cash-flow rhythm. Routine inflows adequately balance planned disbursements. Maintain a disciplined budget and continue gradual investments in secure financial instruments.`;
  }

  // 5. Health & Vitality (Tanu Bhava 1st & Ayurvedic Balance)
  let health = `Tanu Bhava (1st House) & Ayurvedic Wellness: `;
  if (transits.ashtamaShani || [6, 8, 12].includes(sat.houseFromRef) || [6, 8].includes(mars.houseFromRef)) {
    health += `Elevated Vata and Pitta tendencies suggest scheduling intentional relaxation. Support digestive rhythm through freshly prepared, warm meals, ample hydration, gentle joint mobility exercises, and retiring early for deep restorative sleep.`;
  } else {
    health += `Surya and Mars furnish robust Pranic vitality, cardiovascular stamina, and energetic resilience. Channel this positive vitality through brisk morning walks, yoga Surya Namaskars, and mindful breathing practices.`;
  }

  // 6. Family & Domestic Life (Matru & Sukha Bhava 4th House)
  let family = `Sukha Bhava (4th House) & Domestic Alignment: `;
  if ([4, 9, 2].includes(jup.houseFromRef) || [4, 9, 2].includes(moon.houseFromRef)) {
    family += `Auspicious lunar and Jovian currents enrich the domestic atmosphere with peace and familial mutual support. Constructive discussions with elders or parents bring clarity to future family arrangements or property matters.`;
  } else {
    family += `Quiet, supportive domestic climate. Patient attention to children, siblings, or household needs creates a harmonious sanctuary that shields you from external workspace pressures.`;
  }

  // 7. Education & Intellect (Buddhi Bhava 5th House)
  let education = `Buddhi Bhava (5th House) & Analytical Acumen: `;
  if ([5, 1, 9].includes(merc.houseFromRef) || [5, 9].includes(jup.houseFromRef)) {
    education += `Mercury in House ${merc.houseFromRef} stimulates sharp intellectual retention, conceptual clarity, and rapid synthesis of complex data. Outstanding planetary alignment for competitive examinations, technical writing, and esoteric astrological research.`;
  } else {
    education += `Steady scholastic absorption. Eliminating digital clutter and focusing on structured, distraction-free study blocks will ensure optimal learning retention and examination readiness.`;
  }

  // 8. Actionable Vedic Recommendations
  const recommendations = [
    `Recite the auspicious Beej Mantra for ${forecast.sanskritName}'s planetary ruler (${forecast.transits.planets.Sun.currentSign ? "Om Suryaya Namaha" : "Om Namah Shivaya"}) during the morning Brahma Muhurat.`,
    `Perform simple charitable donation (Daan) of food, grains, or water to travelers or temple volunteers to neutralize Gochara friction.`,
    `Spend 10 minutes in quiet meditation at dusk, visualizing golden protective light (Tejas) aligning your seven chakras.`,
  ];

  return {
    ...forecast,
    generalOverview,
    career,
    love,
    finance,
    health,
    family,
    education,
    recommendations,
    calculationMethodology: `${forecast.calculationMethodology} + Karmic Ascension AI Deep Synthesis (Vedic Transit Engine)`,
  };
}

/**
 * Enriches deterministic Vedic horoscope with Gemini AI synthesis if configured and available.
 * Fails safely to the verified deterministic calculation if Gemini fails or is unreachable.
 * Includes deterministic memory-caching to strictly preserve API rate limits and quotas.
 */
async function enrichHoroscopeWithAi(forecast: HoroscopeForecast): Promise<HoroscopeForecast> {
  const cacheKey = `${forecast.zodiacSign}:${forecast.predictionPeriod}:${forecast.periodStart}`;
  const cached = aiHoroscopeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.forecast;
  }

  const apiKey = process.env.GEMINI_API_KEY;

  // If Gemini API Key is missing or not configured, immediately use the dedicated Vedic Deep Synthesis Engine
  if (!apiKey || apiKey.trim() === "") {
    const deepEnriched = generateDeterministicDeepSynthesis(forecast);
    aiHoroscopeCache.set(cacheKey, {
      forecast: deepEnriched,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return deepEnriched;
  }

  const modelCandidates = [
    process.env.GEMINI_MODEL,
    "gemini-3.5-flash-lite",
    "gemini-2.5-flash",
  ].filter(Boolean) as string[];
  const uniqueModels = Array.from(new Set(modelCandidates));

  for (const model of uniqueModels) {
    try {
      const ai = new GoogleGenAI({ apiKey: apiKey.trim() });

      const prompt = `You are Karmic Ascension's Master Vedic Astrology Forecast Synthesizer.
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

      // 8 second timeout to prevent Netlify serverless gateway timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        const id = setTimeout(() => {
          clearTimeout(id);
          reject(new Error(`Timeout: Gemini ${model} did not respond within 8 seconds`));
        }, 8_000);
      });

      const response = await Promise.race([generatePromise, timeoutPromise]);

      if (response && response.text) {
        let cleanText = response.text.trim();

        // Robust JSON substring extraction: find first '{' and last '}'
        const firstBrace = cleanText.indexOf("{");
        const lastBrace = cleanText.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          cleanText = cleanText.substring(firstBrace, lastBrace + 1);
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
            calculationMethodology: `${forecast.calculationMethodology} + Karmic Ascension AI Deep Synthesis (${model})`,
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

  // If all Gemini models failed, fall back safely to the deterministic deep synthesis engine
  const fallbackEnriched = generateDeterministicDeepSynthesis(forecast);
  aiHoroscopeCache.set(cacheKey, {
    forecast: fallbackEnriched,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return fallbackEnriched;
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
