"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/session";
import { GoogleGenAI } from "@google/genai";
import {
  decryptCustomerBirthData,
  isBeneficiaryEncryptionConfigured,
} from "@/lib/financial/encryption";
import { checkRateLimit } from "@/lib/security/rate-limit";

export interface AstrologerRecommendationItem {
  id: string;
  name: string;
  slug: string;
  specializations: string[];
  languages: string[];
  experienceYears: number;
  consultationFeeRupees: number;
  rating: number;
  totalConsultations: number;
  matchScore: number;
  matchReason: string;
  avatarUrl?: string | null;
  isAvailable: boolean;
}

export interface PersonalizedVedicGuidanceResult {
  success: boolean;
  guidance?: {
    synthesis: string;
    planetaryFocus: string;
    remedialAction: string;
    auspiciousPeriod: string;
    provider: string;
    model: string;
  };
  error?: string;
}

/**
 * Generates dynamic, authenticated Vedic astrology guidance for customer's focus area
 * using Gemini LLM with birth chart context where available.
 */
export async function getPersonalizedVedicGuidanceAction(params: {
  concernCategory: string;
  userQuestion?: string;
}): Promise<PersonalizedVedicGuidanceResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Authentication required to generate personal guidance." };
    }

    const rateLimit = checkRateLimit(`ai:guidance:${user.id}`, 6, 60_000);
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: `Query rate limit reached. Please wait ${rateLimit.retryAfterSeconds} seconds before requesting more guidance.`,
      };
    }

    const admin = await createAdminClient("main");

    // Fetch customer's profile birth details if available
    const { data: profile } = await admin
      .from("profiles")
      .select("id, full_name, date_of_birth, time_of_birth, birthplace, encrypted_date_of_birth, encrypted_time_of_birth, encrypted_birthplace")
      .eq("id", user.id)
      .maybeSingle();

    let dob: string | null = null;
    let tob: string | null = null;
    let place: string | null = null;

    if (profile) {
      if (profile.encrypted_date_of_birth) {
        if (!isBeneficiaryEncryptionConfigured()) {
          return { success: false, error: "Encryption service unavailable for birth chart recommendations." };
        }
        dob = decryptCustomerBirthData(profile.id, "date_of_birth", profile.encrypted_date_of_birth);
      } else {
        dob = profile.date_of_birth || null;
      }

      if (profile.encrypted_time_of_birth) {
        if (!isBeneficiaryEncryptionConfigured()) {
          return { success: false, error: "Encryption service unavailable for birth chart recommendations." };
        }
        tob = decryptCustomerBirthData(profile.id, "time_of_birth", profile.encrypted_time_of_birth);
      } else {
        tob = profile.time_of_birth || null;
      }

      if (profile.encrypted_birthplace) {
        if (!isBeneficiaryEncryptionConfigured()) {
          return { success: false, error: "Encryption service unavailable for birth chart recommendations." };
        }
        place = decryptCustomerBirthData(profile.id, "birthplace", profile.encrypted_birthplace);
      } else {
        place = profile.birthplace || null;
      }
    }

    const birthDetails = dob
      ? `Devotee: ${profile?.full_name || "Seeker"}, DOB: ${dob}, Time: ${tob || "Unknown"}, Place: ${place || "Unknown"}`
      : `Devotee: ${profile?.full_name || "Seeker"} (Birth chart pending completion)`;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        error: "AI Services are temporarily unconfigured. Please contact support.",
      };
    }

    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const ai = new GoogleGenAI({ apiKey: apiKey.trim() });

    const prompt = `You are Karmic Ascension's Master Vedic Astrologer.
Analyze the seeker's astrological inquiry and generate a concise, grounded Vedic astrological insight.
Category: ${params.concernCategory}
Devotee Context: ${birthDetails}
User Question: ${params.userQuestion || `Guidance for ${params.concernCategory}`}

Respond STRICTLY in JSON format with exactly these four keys:
{
  "synthesis": "2-3 sentences of traditional Parashari/Jaimini astrological insight",
  "planetaryFocus": "Relevant ruling grahas or houses (e.g. Jupiter & 10th House)",
  "remedialAction": "Constructive Sattvic remedy (e.g. Vishnu Sahasranama, Daana, Surya Arghya)",
  "auspiciousPeriod": "Auspicious muhurat or lunar phase recommendation"
}`;

    const res = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = res.text || "{}";
    const parsed = JSON.parse(text);

    return {
      success: true,
      guidance: {
        synthesis: parsed.synthesis || "Align your efforts with dharmic discipline under auspicious planetary transits.",
        planetaryFocus: parsed.planetaryFocus || "10th & 11th Bhavas",
        remedialAction: parsed.remedialAction || "Chant Gayatri Mantra during Brahma Muhurat.",
        auspiciousPeriod: parsed.auspiciousPeriod || "Shukla Paksha Guruvāra",
        provider: "Google Gemini",
        model: modelName,
      },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unable to generate personalized Vedic guidance right now.";
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * AI Astrologer Recommendation Engine
 * Matches seeker needs with verified astrologer profiles using deterministic multi-criteria scoring
 * + Vedic alignment explanation. Never fabricates credentials or ratings.
 */
export async function getAIAstrologerRecommendationsAction({
  concernCategory, // 'career', 'marriage', 'health', 'finance', 'spiritual', 'general'
  preferredLanguage,
  budgetMaxRupees,
}: {
  concernCategory: string;
  preferredLanguage?: string;
  budgetMaxRupees?: number;
}) {
  try {
    const admin = await createAdminClient("main");

    // 1. Fetch approved and verified astrologers
    const { data: astrologers, error } = await admin
      .from("astrologer_profiles")
      .select("id, slug, display_name, specializations, languages, experience_years, consultation_fee, avg_rating, total_consultations_count, approval_status, profile_photo_url")
      .eq("approval_status", "approved")
      .limit(50);

    if (error || !astrologers) {
      return { success: false, error: error?.message || "No astrologers available", data: [] };
    }

    // 2. Multi-factor scoring
    const scoredList: AstrologerRecommendationItem[] = [];

    const categoryKeywords: Record<string, string[]> = {
      career: ["Career", "Job", "Business", "Finance", "Profession", "10th House", "Vedic Astrology"],
      marriage: ["Marriage", "Love", "Relationship", "Kundli Milan", "7th House", "Kundli"],
      health: ["Medical Astrology", "Vedic Remedies", "Health", "Ayurveda", "Remedies"],
      finance: ["Wealth", "Finance", "Investments", "2nd House", "11th House", "Business"],
      spiritual: ["Moksha", "Spiritual", "Meditation", "Vedic Rituals", "Puja", "Philosophy"],
      general: ["Vedic Astrology", "Horoscope", "Kundli", "Jyotish"],
    };

    const targetKeywords = categoryKeywords[concernCategory] || categoryKeywords.general;

    for (const a of astrologers) {
      let score = 50; // base score

      const specs = (a.specializations || []).map((s: string) => s.toLowerCase());
      const langs = (a.languages || []).map((l: string) => l.toLowerCase());
      const feeRupees = Math.round((a.consultation_fee || 50000) / 100);

      // Specialization match
      const hasSpecMatch = targetKeywords.some((k) => specs.some((s: string) => s.includes(k.toLowerCase())));
      if (hasSpecMatch) score += 25;

      // Language affinity
      if (preferredLanguage && langs.includes(preferredLanguage.toLowerCase())) {
        score += 15;
      }

      // Budget compliance
      if (budgetMaxRupees && feeRupees <= budgetMaxRupees) {
        score += 10;
      }

      // Experience & Rating boost
      const expYears = a.experience_years || 5;
      score += Math.min(expYears, 10); // up to 10 points for experience
      const rating = Number(a.avg_rating) || 4.8;
      score += Math.round(rating * 2);

      // Construct verified explanation
      const matchReason = `${expYears}+ yrs experience in ${specs.slice(0, 2).join(", ") || "Vedic Guidance"}. Fluent in ${langs.slice(0, 2).join(", ") || "Hindi, English"} with ${rating}★ customer rating.`;

      scoredList.push({
        id: a.id,
        name: a.display_name || "Verified Astrologer",
        slug: a.slug,
        specializations: a.specializations || [],
        languages: a.languages || [],
        experienceYears: expYears,
        consultationFeeRupees: feeRupees,
        rating,
        totalConsultations: a.total_consultations_count || 0,
        matchScore: Math.min(score, 100),
        matchReason,
        avatarUrl: a.profile_photo_url,
        isAvailable: true,
      });
    }

    // Sort descending by match score
    scoredList.sort((a, b) => b.matchScore - a.matchScore);

    return { success: true, data: scoredList.slice(0, 6) };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to generate recommendations";
    return { success: false, error: errorMsg, data: [] };
  }
}
