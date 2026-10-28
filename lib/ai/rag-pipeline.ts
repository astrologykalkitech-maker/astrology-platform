/**
 * Retrieval-Augmented Generation (RAG) & Intent Classification Pipeline
 *
 * Classifies customer & astrologer queries, extracts structured entities
 * (specializations, languages, budget constraints, live data queries),
 * resolves multi-turn follow-up context, and retrieves verified platform knowledge.
 */

import { PLATFORM_KNOWLEDGE_BASE, type KnowledgeItem } from "./knowledge-base";
import type { SupportTicketCategory, SupportTicketPriority } from "@/lib/types/database.types";
import { resolveMultiTurnContext, isGreetingQuery, type ConversationTurn } from "./multi-turn-context";

export type QueryIntent =
  | "greeting"
  | "recommend_astrologer"
  | "profile_selection"
  | "compare_astrologers"
  | "live_data_birth_details"
  | "live_data_bookings"
  | "live_data_leads"
  | "live_data_profile_status"
  | "live_data_profile_completion"
  | "live_data_earnings"
  | "live_data_tickets"
  | "human_escalation"
  | "platform_troubleshooting"
  | "general_knowledge";

export interface AstrologerPreferenceExtraction {
  specialization?: string;
  language?: string;
  maxBudget?: number;
  minExperience?: number;
  searchKeyword?: string;
}

export interface ClassifiedQueryResult {
  intent: QueryIntent;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  isHinglish: boolean;
  preferences?: AstrologerPreferenceExtraction;
  relevantKnowledge: KnowledgeItem[];
  suggestedAction: "continue" | "escalate" | "self_service";
  lifeDomain?: "career" | "marriage" | "health" | "finance" | "business" | "education" | "family" | "spirituality";
  hasMedicalBoundary?: boolean;
  hasFinancialBoundary?: boolean;
  targetAstrologerSlug?: string;
  comparisonSlugs?: string[];
}

/**
 * Common specialization keywords mapped to standard database values
 */
const SPECIALIZATION_KEYWORDS: Record<string, string> = {
  kundli: "Kundli",
  horoscope: "Kundli",
  patrika: "Kundli",
  janam: "Kundli",
  vedic: "Vedic",
  career: "Career",
  job: "Career",
  business: "Business",
  naukri: "Career",
  promotion: "Career",
  sarkari: "Career",
  marriage: "Marriage",
  vivah: "Marriage",
  shaadi: "Marriage",
  matchmaking: "Marriage",
  love: "Marriage",
  relationship: "Marriage",
  vastu: "Vastu",
  numerology: "Numerology",
  ank: "Numerology",
  health: "Vedic",
  sehat: "Vedic",
  finance: "Finance",
  money: "Finance",
  wealth: "Finance",
  dhan: "Finance",
  education: "Education",
  studies: "Education",
  exam: "Education",
  family: "Family",
  parivar: "Family",
};

/**
 * Common language keywords
 */
const LANGUAGE_KEYWORDS: Record<string, string> = {
  hindi: "Hindi",
  english: "English",
  sanskrit: "Sanskrit",
  gujarati: "Gujarati",
  marathi: "Marathi",
  bengali: "Bengali",
  punjabi: "Punjabi",
  tamil: "Tamil",
  telugu: "Telugu",
};

/**
 * Invariant domain category inference
 */
export function inferDomainCategory(query: string, fallback: SupportTicketCategory = "general"): SupportTicketCategory {
  const q = query.toLowerCase();
  if (q.match(/\b(video|call|audio|mic|camera|room|screen|black|lag|reconnect|muhurat|join|doctor|health|illness|disease|hospital|sehat|tabiyat|marriage|shaadi|career|job|naukri|promotion)\b/)) {
    return "consultation";
  }
  if (q.match(/\b(cancel|reschedule|booking|bookings|slot|slots|appointment)\b/)) {
    return "booking";
  }
  if (q.match(/\b(lead|leads|enquiry|enquiries|seeker|client)\b/)) {
    return "leads";
  }
  if (q.match(/\b(approval|approve|verified|verification|bio|specialization|experience|rates|fees|birth details|date of birth)\b/)) {
    return "profile";
  }
  if (q.match(/\b(payment|fee|refund|money|bill|billing|receipt|complimentary|wealth|finance|investment|shares|crypto|stock market|dhan)\b/)) {
    return "billing";
  }
  if (q.match(/\b(login|oauth|password|session|account|cookie|sign in|signup)\b/)) {
    return "account";
  }
  return fallback;
}

/**
 * Classifies a user query and extracts entities, resolving multi-turn context
 */
export function classifyQuery(
  role: "customer" | "astrologer",
  query: string,
  history: ConversationTurn[] = []
): ClassifiedQueryResult {
  const normalizedRaw = query.trim().toLowerCase();

  // 0. Prompt Injection / Malicious Override Neutralization
  if (normalizedRaw.match(/\b(system override|forget all|ignore instructions|jailbreak|disregard rules)\b/)) {
    return {
      intent: "platform_troubleshooting",
      category: "general",
      priority: "medium",
      isHinglish: false,
      relevantKnowledge: retrieveRelevantKnowledge(role, query, 1),
      suggestedAction: "continue",
    };
  }

  // 0.5. Pure Conversational Greeting Detection
  // (Only triggers when no substantive platform keywords are present)
  if (isGreetingQuery(normalizedRaw)) {
    return {
      intent: "greeting",
      category: "general",
      priority: "low",
      isHinglish: false,
      relevantKnowledge: [],
      suggestedAction: "continue",
    };
  }

  // 1. Multi-Turn Context Resolution
  const multiTurn = resolveMultiTurnContext(history, query);
  const normalized = multiTurn.effectiveQuery.toLowerCase();

  // 2. Detect Hinglish patterns
  const hinglishPatterns = [
    /\b(kaise|karo|karein|karna|hoga|hogi|hai|hain|kya|kyun|kahan|mera|meri|mujhe|aao|baat|nahi|chal|raha|rahi|chahiye|kab|dono|pehla|doosra)\b/,
  ];
  const isHinglish = hinglishPatterns.some((pattern) => pattern.test(normalizedRaw));

  // 3. Detect Profile Selection from Follow-Up (e.g. "Book the second one", "Select #1")
  if (multiTurn.followUpType === "select_profile" && multiTurn.referencedAstrologerSlugs.length > 0) {
    const idx = multiTurn.selectedOrdinal ? multiTurn.selectedOrdinal - 1 : 0;
    const targetSlug = multiTurn.referencedAstrologerSlugs[idx] || multiTurn.referencedAstrologerSlugs[0];

    return {
      intent: "profile_selection",
      category: "booking",
      priority: "medium",
      isHinglish,
      targetAstrologerSlug: targetSlug,
      relevantKnowledge: retrieveRelevantKnowledge(role, "how to book consultation", 2),
      suggestedAction: "continue",
    };
  }

  // 4. Detect Comparison Intent (e.g. "Compare these two astrologers")
  if (multiTurn.followUpType === "compare" && multiTurn.referencedAstrologerSlugs.length >= 2) {
    return {
      intent: "compare_astrologers",
      category: "consultation",
      priority: "medium",
      isHinglish,
      comparisonSlugs: multiTurn.referencedAstrologerSlugs.slice(0, 2),
      relevantKnowledge: retrieveRelevantKnowledge(role, query, 2),
      suggestedAction: "continue",
    };
  }

  // 5. Detect Astrologer Recommendation Intent (Customers only)
  const recommendationTriggers = [
    /\b(recommend|suggest|find|best|top|which|looking for|need an|search)\b.*\b(astrologer|pandit|jyotish|guru|reader)\b/,
    /\b(astrologer|pandit|jyotish)\b.*\b(recommend|suggest|find|dikhao|batao)\b/,
    /\b(career|marriage|kundli|vastu|love|finance|health|education|family)\b.*\b(astrologer|expert|consultant)\b/,
    /\b(astrologer|pandit|jyotish)\b.*\b(hindi|english|experience|budget|fees)\b/,
    /\b(kaunsa astrologer|astrologer batao|pandit ji chahiye|suggest karo)\b/,
    /\b(who is best for|recommend someone)\b/,
  ];

  const isRecommendation =
    role === "customer" &&
    (multiTurn.followUpType === "confirmation" ||
      multiTurn.followUpType === "refine_language" ||
      multiTurn.followUpType === "refine_budget" ||
      multiTurn.followUpType === "more_options" ||
      recommendationTriggers.some((rgx) => rgx.test(normalizedRaw)));

  if (isRecommendation) {
    const preferences: AstrologerPreferenceExtraction = {
      ...multiTurn.accumulatedPreferences,
    };

    // Extract specialization from query
    for (const [kw, spec] of Object.entries(SPECIALIZATION_KEYWORDS)) {
      if (normalizedRaw.includes(kw)) {
        preferences.specialization = spec;
        break;
      }
    }

    // Determine life domain for recommendations
    let lifeDomain: ClassifiedQueryResult["lifeDomain"];
    if (normalizedRaw.match(/\b(career|job|promotion|government job|sarkari naukri|profession|interview|naukri)\b/) || preferences.specialization === "Career") {
      lifeDomain = "career";
    } else if (normalizedRaw.match(/\b(marriage|shaadi|vivah|love|relationship|partner|compatibility|guna milan)\b/) || preferences.specialization === "Marriage") {
      lifeDomain = "marriage";
    } else if (normalizedRaw.match(/\b(health|illness|disease|doctor|medicine|pain|mental health|depression|sehat|tabiyat|bimaari)\b/)) {
      lifeDomain = "health";
    } else if (normalizedRaw.match(/\b(money|wealth|finance|debt|loan|investment|shares|crypto|stock market|dhan)\b/) || preferences.specialization === "Finance") {
      lifeDomain = "finance";
    } else if (normalizedRaw.match(/\b(business|startup|entrepreneurship|property|real estate|dukaan)\b/) || preferences.specialization === "Business") {
      lifeDomain = "business";
    } else if (normalizedRaw.match(/\b(education|exam|studies|student|college|university|neet|iit|upsc|padhai)\b/) || preferences.specialization === "Education") {
      lifeDomain = "education";
    } else if (normalizedRaw.match(/\b(family|children|parents|parivar|bacche|domestic peace)\b/) || preferences.specialization === "Family") {
      lifeDomain = "family";
    } else if (normalizedRaw.match(/\b(kundli|lagna|ascendant|bhavas|grahas|dasha|sade sati|manglik|vedic astrology)\b/) || preferences.specialization === "Kundli" || preferences.specialization === "Vedic") {
      lifeDomain = "spirituality";
    }

    // Extract language from query
    for (const [kw, lang] of Object.entries(LANGUAGE_KEYWORDS)) {
      if (normalizedRaw.includes(kw)) {
        preferences.language = lang;
        break;
      }
    }

    // Extract budget constraints
    const budgetMatch = normalizedRaw.match(/(?:under|below|max|budget|within|less than|rs\.?|₹)\s*(\d{2,5})/);
    if (budgetMatch && budgetMatch[1]) {
      const budgetNum = parseInt(budgetMatch[1], 10);
      if (!isNaN(budgetNum) && budgetNum > 0) {
        preferences.maxBudget = budgetNum;
      }
    }

    // Extract experience
    const expMatch = normalizedRaw.match(/(\d{1,2})\s*(?:\+|plus)?\s*(?:years?|yrs?)/);
    if (expMatch && expMatch[1]) {
      const expNum = parseInt(expMatch[1], 10);
      if (!isNaN(expNum) && expNum > 0) {
        preferences.minExperience = expNum;
      }
    }

    return {
      intent: "recommend_astrologer",
      category: "consultation",
      priority: "medium",
      isHinglish,
      lifeDomain,
      preferences,
      relevantKnowledge: retrieveRelevantKnowledge(role, multiTurn.effectiveQuery, 2),
      suggestedAction: "continue",
    };
  }

  // 6. Detect Specific Life Guidance Domains & Safety Boundaries
  let lifeDomain: ClassifiedQueryResult["lifeDomain"];
  let hasMedicalBoundary = false;
  let hasFinancialBoundary = false;

  if (normalized.match(/\b(health|illness|disease|doctor|medicine|pain|mental health|depression|sehat|tabiyat|bimaari)\b/)) {
    lifeDomain = "health";
    hasMedicalBoundary = true;
  } else if (normalized.match(/\b(career|job|promotion|government job|sarkari naukri|profession|interview|naukri)\b/)) {
    lifeDomain = "career";
  } else if (normalized.match(/\b(marriage|shaadi|vivah|love|relationship|partner|compatibility|guna milan)\b/)) {
    lifeDomain = "marriage";
  } else if (normalized.match(/\b(money|wealth|finance|debt|loan|investment|shares|crypto|stock market|dhan)\b/)) {
    lifeDomain = "finance";
    hasFinancialBoundary = true;
  } else if (normalized.match(/\b(business|startup|entrepreneurship|property|real estate|dukaan)\b/)) {
    lifeDomain = "business";
  } else if (normalized.match(/\b(education|exam|studies|student|college|university|neet|iit|upsc|padhai)\b/)) {
    lifeDomain = "education";
  } else if (normalized.match(/\b(family|children|parents|parivar|bacche|domestic peace)\b/)) {
    lifeDomain = "family";
  } else if (normalized.match(/\b(kundli|lagna|ascendant|bhavas|grahas|dasha|sade sati|manglik|vedic astrology)\b/)) {
    lifeDomain = "spirituality";
  }

  // 7. Detect Live Data Queries
    // Customer Birth Details & Kundli Readiness
  if (
    role === "customer" &&
    (normalized.match(/\b(birth\s*details?|date\s*of\s*birth|dob|time\s*of\s*birth|tob|birth\s*place|birthplace|place\s*of\s*birth|janam\s*tithi|janam\s*samay|janam\s*sthan|janam\s*kundli|kundli\s*readiness|my\s*details?)\b/) ||
     (normalized.includes("born") && normalized.match(/\b(when|where|time|what)\b/)) ||
     (normalized.includes("birth") && normalized.match(/\b(my|meri|mine|details|record|profile|data)\b/)) ||
     (normalized.includes("kundli") && normalized.match(/\b(my|meri|mine|readiness|profile|complete|status)\b/)))
  ) {
    return {
      intent: "live_data_birth_details",
      category: "profile",
      priority: "medium",
      isHinglish,
      relevantKnowledge: retrieveRelevantKnowledge(role, query, 2),
      suggestedAction: "continue",
    };
  }

  // A. User's or Astrologer's own bookings
  if (
    multiTurn.followUpType === "astrologer_bookings_followup" ||
    (normalized.match(/\b(my bookings?|upcoming|scheduled|appointment|meeting time|next call|meri booking|sessions?|calls?)\b/) &&
      normalized.match(/\b(show|check|status|when|what|where|view|batao|kya|today|schedule|kahan)\b/))
  ) {
    return {
      intent: "live_data_bookings",
      category: "booking",
      priority: "medium",
      isHinglish,
      lifeDomain,
      relevantKnowledge: retrieveRelevantKnowledge(role, query, 2),
      suggestedAction: "continue",
    };
  }

  // B. Astrologer's own leads
  if (
    role === "astrologer" &&
    normalized.match(/\b(leads?|enquir(?:y|ies))\b/) &&
    normalized.match(/\b(my|assigned|show|check|meri|kitni)\b/)
  ) {
    return {
      intent: "live_data_leads",
      category: "leads",
      priority: "medium",
      isHinglish,
      relevantKnowledge: retrieveRelevantKnowledge(role, query, 2),
      suggestedAction: "continue",
    };
  }

  // C. Astrologer profile completion checklist
  if (
    role === "astrologer" &&
    (multiTurn.followUpType === "astrologer_checklist_followup" ||
      normalized.match(/\b(checklist|missing|percentage|kya bacha hai|kya baki hai|what is missing|profile score)\b/) ||
      (normalized.includes("profile") && normalized.match(/\b(complete|completion|100%|finish)\b/)))
  ) {
    return {
      intent: "live_data_profile_completion",
      category: "profile",
      priority: "medium",
      isHinglish,
      relevantKnowledge: retrieveRelevantKnowledge(role, query, 2),
      suggestedAction: "continue",
    };
  }

  // D. Astrologer consultation earnings & payouts
  if (
    role === "astrologer" &&
    (multiTurn.followUpType === "astrologer_earnings_followup" ||
      normalized.match(/\b(earnings?|payouts?|revenue|income|kamai|settlement|withdrawal|fees earned)\b/))
  ) {
    return {
      intent: "live_data_earnings",
      category: "billing",
      priority: "medium",
      isHinglish,
      relevantKnowledge: retrieveRelevantKnowledge(role, query, 2),
      suggestedAction: "continue",
    };
  }

  // E. Astrologer profile approval status
  if (
    role === "astrologer" &&
    (multiTurn.followUpType === "astrologer_status_followup" ||
      (normalized.match(/\b(approval|verified|listing status|profile status|approve|verification)\b/) &&
        normalized.match(/\b(my|am i|is my|mera|meri|check|status|kab|hogi|why|pending)\b/)))
  ) {
    return {
      intent: "live_data_profile_status",
      category: "profile",
      priority: "medium",
      isHinglish,
      relevantKnowledge: retrieveRelevantKnowledge(role, query, 2),
      suggestedAction: "continue",
    };
  }

  // F. Support tickets status
  if (normalized.match(/\btickets?\b/) && normalized.match(/\b(status|my|check|show|view|mera|number|complaint)\b/)) {
    return {
      intent: "live_data_tickets",
      category: "general",
      priority: "medium",
      isHinglish,
      relevantKnowledge: retrieveRelevantKnowledge(role, query, 2),
      suggestedAction: "continue",
    };
  }

  // 8. Detect Human Escalation
  if (
    normalized.match(
      /\b(human|agent|representative|super admin|real person|manager|admin se baat|complaint lodge|escalate)\b/
    )
  ) {
    return {
      intent: "human_escalation",
      category: inferDomainCategory(normalized, "general"),
      priority: "high",
      isHinglish,
      relevantKnowledge: retrieveRelevantKnowledge(role, query, 1),
      suggestedAction: "escalate",
    };
  }

  // 9. Default: Platform Troubleshooting or General Life Guidance
  const relevantKnowledge = retrieveRelevantKnowledge(role, multiTurn.effectiveQuery, 3);
  const derivedCategory = inferDomainCategory(normalized, relevantKnowledge[0]?.category ?? "general");

  return {
    intent: "platform_troubleshooting",
    category: derivedCategory,
    priority: derivedCategory === "consultation" || derivedCategory === "booking" ? "high" : "medium",
    isHinglish,
    lifeDomain,
    hasMedicalBoundary,
    hasFinancialBoundary,
    relevantKnowledge,
    suggestedAction: "continue",
  };
}

/**
 * Scores and retrieves top relevant knowledge base items
 */
export function retrieveRelevantKnowledge(
  role: "customer" | "astrologer",
  query: string,
  limit: number = 3
): KnowledgeItem[] {
  const normalized = query.trim().toLowerCase();
  const words = normalized.split(/\s+/).filter((w) => w.length > 2);

  const scored = PLATFORM_KNOWLEDGE_BASE.filter((item) => item.applicableRoles.includes(role)).map((item) => {
    let score = 0;

    // Check title match
    if (normalized.includes(item.title.toLowerCase())) {
      score += 12;
    }

    // Check standard keywords
    for (const kw of item.keywords) {
      if (normalized.includes(kw.toLowerCase())) {
        score += 5;
      }
    }

    // Check Hinglish keywords
    for (const hkw of item.hinglishKeywords) {
      if (normalized.includes(hkw.toLowerCase())) {
        score += 6;
      }
    }

    // Individual word overlap
    for (const word of words) {
      if (item.problemDescription.toLowerCase().includes(word)) {
        score += 1;
      }
      if (item.summary.toLowerCase().includes(word)) {
        score += 2;
      }
    }

    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Return items with score > 0, fallback to top items for generic troubleshooting context
  const matches = scored.filter((s) => s.score > 0).map((s) => s.item);
  if (matches.length === 0) {
    return scored.slice(0, limit).map((s) => s.item);
  }
  return matches.slice(0, limit);
}

/**
 * Generates an authentic, friendly, and concise greeting response based on the user's role and query.
 */
export function generateGreetingResponse(role: "customer" | "astrologer", query: string): string {
  const clean = query.toLowerCase().trim();

  // Namaste variations
  if (/\b(namaste|namaskar|namaskaram|pranam|pranaam|vandanam|vanakkam)\b/.test(clean)) {
    if (role === "astrologer") {
      return "Namaste! Welcome to JyotishSetu Astrologer Support. How may I assist you with your consultations, leads, or profile today?";
    }
    return "Namaste! Welcome to JyotishSetu. How may I assist you today? You can ask me about consultations, astrologers, your Kundli birth chart, or bookings.";
  }

  // Good morning / afternoon / evening
  if (/\bgood\s*morning\b/.test(clean)) {
    return role === "astrologer"
      ? "Good morning! Welcome to JyotishSetu Astrologer Support. How can I help you today? Feel free to ask about your leads, consultation room setup, or earnings."
      : "Good morning! Welcome to JyotishSetu. How can I help you today? Feel free to ask about astrologer consultations, your Kundli profile, or upcoming bookings.";
  }

  if (/\bgood\s*afternoon\b/.test(clean)) {
    return role === "astrologer"
      ? "Good afternoon! Welcome to JyotishSetu Astrologer Support. How can I help you today? Feel free to ask about your leads, consultation room setup, or earnings."
      : "Good afternoon! Welcome to JyotishSetu. How can I help you today? Feel free to ask about astrologer consultations, your Kundli profile, or upcoming bookings.";
  }

  if (/\bgood\s*evening\b/.test(clean)) {
    return role === "astrologer"
      ? "Good evening! Welcome to JyotishSetu Astrologer Support. How can I help you today? Feel free to ask about your leads, consultation room setup, or earnings."
      : "Good evening! Welcome to JyotishSetu. How can I help you today? Feel free to ask about astrologer consultations, your Kundli profile, or upcoming bookings.";
  }

  // How are you / Kaise ho
  if (/\b(how\s*are\s*you|how\s*r\s*u|how\s*do\s*you\s*do|kaise\s*ho|kya\s*haal\s*hai)\b/.test(clean)) {
    if (/\b(kaise\s*ho|kya\s*haal\s*hai)\b/.test(clean)) {
      return "Main bilkul theek hoon, dhanyawad! JyotishSetu mein aapka swagat hai. Main aapki kya sahayata kar sakta hoon?";
    }
    if (role === "astrologer") {
      return "I'm doing well, thank you! Welcome to JyotishSetu Astrologer Care. How can I assist you with your schedule, leads, or consultations today?";
    }
    return "I'm doing well, thank you! Welcome to JyotishSetu. How can I help you today? You can ask me about consultations, bookings, astrologers, birth details, or platform support.";
  }

  // Default friendly greeting (hi, hello, hey, hey there, etc.)
  if (role === "astrologer") {
    return "Hello! Welcome to JyotishSetu Astrologer Support. How can I help you today? You can ask about your assigned leads, upcoming bookings, earnings, or profile verification.";
  }
  return "Hi! Welcome to JyotishSetu. How can I help you today? You can ask me about consultations, bookings, astrologers, birth details, or platform support.";
}
