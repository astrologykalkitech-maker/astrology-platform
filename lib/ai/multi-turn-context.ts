/**
 * Multi-Turn Conversation Context & Follow-Up Resolver
 *
 * Preserves conversational state, accumulated user preferences (specialization,
 * language, budget, experience), and resolves natural language references such as:
 * - "Yes", "Please send", "Show me"
 * - "Only Hindi speaking ones"
 * - "Show cheaper options", "Under 500"
 * - "Book the second one", "Select the first astrologer"
 * - "Compare them"
 */

import type { AstrologerPreferenceExtraction } from "./rag-pipeline";

export interface ConversationTurn {
  role: string;
  content: string;
}

export interface ResolvedContext {
  effectiveQuery: string;
  isFollowUp: boolean;
  followUpType?:
    | "confirmation"
    | "refine_language"
    | "refine_budget"
    | "more_options"
    | "select_profile"
    | "compare"
    | "astrologer_status_followup"
    | "astrologer_checklist_followup"
    | "astrologer_earnings_followup"
    | "astrologer_bookings_followup";
  selectedOrdinal?: number; // 1 for first, 2 for second, etc.
  accumulatedPreferences: AstrologerPreferenceExtraction;
  referencedAstrologerSlugs: string[];
}

/**
 * Extracts accumulated preferences and resolves follow-up references across turns
 */
export function resolveMultiTurnContext(
  history: ConversationTurn[] = [],
  currentQuery: string
): ResolvedContext {
  const normalizedCurrent = currentQuery.trim().toLowerCase();
  const accumulated: AstrologerPreferenceExtraction = {};
  const referencedSlugs: string[] = [];

  // 1. Scan history in chronological order to accumulate preferences
  for (const turn of history) {
    const text = turn.content.toLowerCase();

    // Specializations
    if (text.includes("career") || text.includes("job") || text.includes("naukri") || text.includes("profession")) {
      accumulated.specialization = "Career";
    } else if (text.includes("marriage") || text.includes("love") || text.includes("relationship") || text.includes("shaadi") || text.includes("vivah")) {
      accumulated.specialization = "Marriage";
    } else if (text.includes("kundli") || text.includes("horoscope") || text.includes("patrika")) {
      accumulated.specialization = "Kundli";
    } else if (text.includes("vastu")) {
      accumulated.specialization = "Vastu";
    } else if (text.includes("finance") || text.includes("wealth") || text.includes("money") || text.includes("dhan")) {
      accumulated.specialization = "Finance";
    } else if (text.includes("business") || text.includes("trade") || text.includes("startup")) {
      accumulated.specialization = "Business";
    } else if (text.includes("education") || text.includes("study") || text.includes("exam")) {
      accumulated.specialization = "Education";
    }

    // Languages
    if (text.includes("hindi")) accumulated.language = "Hindi";
    else if (text.includes("english")) accumulated.language = "English";
    else if (text.includes("sanskrit")) accumulated.language = "Sanskrit";
    else if (text.includes("gujarati")) accumulated.language = "Gujarati";
    else if (text.includes("marathi")) accumulated.language = "Marathi";

    // Budget
    const budgetMatch = text.match(/(?:under|below|budget|max|less than|rs\.?|₹)\s*(\d{2,5})/);
    if (budgetMatch && budgetMatch[1]) {
      const b = parseInt(budgetMatch[1], 10);
      if (!isNaN(b) && b > 0) accumulated.maxBudget = b;
    }

    // Extract any slugs mentioned in links like /customer/astrologers/[slug]
    const slugMatches = turn.content.matchAll(/\/customer\/astrologers\/([a-zA-Z0-9_-]+)/g);
    for (const sm of slugMatches) {
      if (sm[1] && !referencedSlugs.includes(sm[1])) {
        referencedSlugs.push(sm[1]);
      }
    }
  }

  // 2. Detect follow-up pattern in current user message
  let isFollowUp = false;
  let followUpType: ResolvedContext["followUpType"];
  let selectedOrdinal: number | undefined;
  let effectiveQuery = currentQuery;

  // Pattern A: Confirmation ("Yes", "Sure", "Please send", "Show me", "Haan", "Yes please send")
  const isConfirmation =
    /^(yes|yeah|yep|sure|please send|show me|show|haan|ha|batao|send profiles?|okay|ok)\b/i.test(normalizedCurrent) &&
    normalizedCurrent.length < 35;
  if (isConfirmation && (accumulated.specialization || history.length > 0)) {
    isFollowUp = true;
    followUpType = "confirmation";
    effectiveQuery = `Please recommend astrologers for ${accumulated.specialization || "Vedic astrology"} guidance.`;
  }

  // Pattern B: Refine language ("Only Hindi", "Hindi speaking", "English only")
  const isLanguageOnly = /^(only\s+(?:hindi|english|gujarati|marathi)|(?:hindi|english)\s+only|in\s+(?:hindi|english))$/i.test(normalizedCurrent);
  if (isLanguageOnly) {
    isFollowUp = true;
    followUpType = "refine_language";
    const lang = normalizedCurrent.includes("hindi") ? "Hindi" : "English";
    accumulated.language = lang;
    effectiveQuery = `Find ${lang} speaking astrologers for ${accumulated.specialization || "Vedic astrology"} guidance.`;
  }

  // Pattern C: Refine budget ("Cheaper options", "Show cheaper ones", "Under 500", "Under 1000", "Kam fees wale")
  const isBudgetRefinement = /(?:cheaper|low cost|kam fees|under\s+\d+|below\s+\d+|affordable)/i.test(normalizedCurrent);
  if (isBudgetRefinement && (accumulated.specialization || history.length > 0)) {
    isFollowUp = true;
    followUpType = "refine_budget";
    const budgetMatch = normalizedCurrent.match(/(?:under|below|max|rs\.?|₹)\s*(\d{2,5})/);
    if (budgetMatch && budgetMatch[1]) {
      accumulated.maxBudget = parseInt(budgetMatch[1], 10);
    } else {
      accumulated.maxBudget = 500; // default affordable threshold
    }
    effectiveQuery = `Show astrologers under ${accumulated.maxBudget} for ${accumulated.specialization || "Vedic astrology"}.`;
  }

  // Pattern D: Profile selection ("Book the second one", "Select #1", "First one", "Pehela wala")
  const selectMatch = normalizedCurrent.match(/\b(?:book|select|choose|open|pehla|doosra|second|first|third|1st|2nd|3rd|#1|#2|#3)\b/);
  if (selectMatch && referencedSlugs.length > 0) {
    if (normalizedCurrent.includes("first") || normalizedCurrent.includes("1st") || normalizedCurrent.includes("#1") || normalizedCurrent.includes("pehla")) {
      selectedOrdinal = 1;
    } else if (normalizedCurrent.includes("second") || normalizedCurrent.includes("2nd") || normalizedCurrent.includes("#2") || normalizedCurrent.includes("doosra")) {
      selectedOrdinal = 2;
    } else if (normalizedCurrent.includes("third") || normalizedCurrent.includes("3rd") || normalizedCurrent.includes("#3") || normalizedCurrent.includes("teesra")) {
      selectedOrdinal = 3;
    }

    if (selectedOrdinal !== undefined) {
      isFollowUp = true;
      followUpType = "select_profile";
      const targetSlug = referencedSlugs[selectedOrdinal - 1] || referencedSlugs[0];
      effectiveQuery = `How do I book astrologer profile ${targetSlug}?`;
    }
  }

  // Pattern E: Comparison ("Compare these two", "Compare them", "Which is better")
  const isCompare = /\b(compare|dono me se|difference between|kaunsa better hai)\b/i.test(normalizedCurrent);
  if (isCompare && referencedSlugs.length >= 2) {
    isFollowUp = true;
    followUpType = "compare";
    effectiveQuery = `Compare astrologers ${referencedSlugs[0]} and ${referencedSlugs[1]}`;
  }

  // Pattern F: Show more ("Show another", "More options", "Aur dikhao")
  const isMore = /\b(show more|more options|another one|aur dikhao|aur options)\b/i.test(normalizedCurrent);
  if (isMore && accumulated.specialization) {
    isFollowUp = true;
    followUpType = "more_options";
    effectiveQuery = `Show more astrologers for ${accumulated.specialization}`;
  }

  // Pattern G: Astrologer Profile Moderation / Status Follow-up
  const isAstroStatusFollowUp =
    /^(why is it pending|when will it be approved|is it approved|is my profile approved|kab approve hoga|why pending|what about my status|what about my approval|i uploaded the document|i uploaded document|i updated my bio|i made the changes)\b/i.test(
      normalizedCurrent
    );
  if (isAstroStatusFollowUp) {
    isFollowUp = true;
    followUpType = "astrologer_status_followup";
    effectiveQuery = "Check my astrologer profile approval status and explain why it is pending or what actions are required.";
  }

  // Pattern H: Astrologer Profile Checklist / Missing Requirements Follow-up
  const isAstroChecklistFollowUp =
    /^(what is missing|kya baki hai|what else do i need|what is needed|checklist please|profile checklist|how to reach 100%|check my profile completion)\b/i.test(
      normalizedCurrent
    );
  if (isAstroChecklistFollowUp) {
    isFollowUp = true;
    followUpType = "astrologer_checklist_followup";
    effectiveQuery = "Check my astrologer profile completion checklist and show missing fields.";
  }

  // Pattern I: Astrologer Earnings & Payout Follow-up
  const isAstroEarningsFollowUp =
    /^(what about my earnings|how much did i earn|show my earnings|show my payout|meri kamai|payout details|when will i get paid)\b/i.test(
      normalizedCurrent
    );
  if (isAstroEarningsFollowUp) {
    isFollowUp = true;
    followUpType = "astrologer_earnings_followup";
    effectiveQuery = "Show my consultation earnings summary and payout schedule.";
  }

  // Pattern J: Astrologer Consultation Bookings Follow-up
  const isAstroBookingsFollowUp =
    /^(what about my bookings|any calls today|do i have any appointments|show my scheduled sessions|any meetings today|meri bookings)\b/i.test(
      normalizedCurrent
    );
  if (isAstroBookingsFollowUp) {
    isFollowUp = true;
    followUpType = "astrologer_bookings_followup";
    effectiveQuery = "Show my scheduled consultation bookings schedule.";
  }

  return {
    effectiveQuery,
    isFollowUp,
    followUpType,
    selectedOrdinal,
    accumulatedPreferences: accumulated,
    referencedAstrologerSlugs: referencedSlugs,
  };
}
