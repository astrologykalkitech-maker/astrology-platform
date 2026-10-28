import { GoogleGenAI } from "@google/genai";
import { checkRateLimit } from "@/lib/security/rate-limit";
import type { SupportTicketCategory, SupportTicketPriority } from "@/lib/types/database.types";
import { classifyQuery, type ClassifiedQueryResult } from "./rag-pipeline";
import {
  searchApprovedAstrologers,
  getCustomerBookingsSummary,
  getAstrologerProfileStatus,
  getAstrologerLeadsSummary,
  getUserTicketsSummary,
  getAstrologerBySlug,
  compareAstrologers,
  type AstrologerRecommendationCard,
} from "./live-tools";
import type { KnowledgeItem } from "./knowledge-base";

// ─── Singleton AI client ──────────────────────────────────────────────────────
let _client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === "") return null;
  if (!_client) _client = new GoogleGenAI({ apiKey: apiKey.trim() });
  return _client;
}

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const FALLBACK_MODELS = Array.from(new Set([DEFAULT_MODEL, "gemini-2.5-flash"]));

// ─── Public types ─────────────────────────────────────────────────────────────

export interface GeminiChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GeminiSupportResponse {
  success: boolean;
  message: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  suggestedAction?: "continue" | "escalate" | "self_service";
  isFallback: boolean;
  modelUsed: string;
  error?: string;
  recommendations?: AstrologerRecommendationCard[];
}

// ─── System Prompts with Domain Directives & Boundaries ───────────────────────

const CUSTOMER_SYSTEM_PROMPT = `You are JyotishSetu's AI Support Assistant for seekers and customers.
Your mission is to provide concise, empathetic, polite, actionable, and safety-conscious guidance on astrology, life questions, and using the JyotishSetu platform.

CORE PRINCIPLES & ETHICAL BOUNDARIES:
1. Medical Boundary (CRITICAL):
   - You MUST NEVER diagnose illnesses, predict disease progression or death, prescribe treatments, or suggest stopping medication.
   - For any health symptoms or medical queries, clearly remind the customer to consult a licensed medical doctor or healthcare professional immediately. For emergencies, direct them to local emergency services.
   - You may offer traditional, non-medical Ayurvedic lifestyle, vitality, or spiritual peace perspective only.
2. Financial Boundary (CRITICAL):
   - You MUST NEVER guarantee investment returns, predict stock prices or crypto as facts, or give personalized trading instructions.
   - For investment, tax, or legal financial decisions, clearly remind the customer to consult a certified financial advisor. Offer philosophical perspective on prosperity (Dhana Yogas) and discipline only.
3. Relationship & Marriage:
   - Provide compassionate, supportive guidance on compatibility, Ashtakoot Guna Milan, and planetary harmony.
   - NEVER guarantee marriage dates, outcomes, reconciliation, or claim to control or predict another person's feelings.
4. Career & Education:
   - Provide constructive perspective on natural vocational strengths (10th House Karma Bhava) and study focus.
   - Emphasize that astrology guides natural inclinations, but personal diligence, study, and preparation are fundamental. Never guarantee exam or job selection.
5. Platform Facts:
   - Virtual consultation rooms unlock exactly 15 minutes before the booked Muhurat slot on the Bookings page (/customer/bookings).
   - Customers can cancel upcoming pending/confirmed bookings prior to start time. Completed sessions cannot be cancelled.
   - Payment gateway integration is in scheduled rollout; fee schedules reflect recorded amounts as complimentary or pending.
   - Kundli birth details (Date, Time, Place of birth) can be updated in Profile (/customer/profile).
6. Astrologer Recommendations:
   - Recommend only real, approved astrologers provided in context. Never invent astrologers, prices, or ratings.
   - Present matches concisely and encourage clicking profile cards below.
7. Multi-Turn Follow-Ups:
   - When a user refines preferences (e.g. "Only Hindi", "Under 500", "Book the first one"), acknowledge the refinement and proceed smoothly.

STYLE & SAFETY:
- Be polite, concise (max 2-3 short paragraphs), warm, and respectful.
- Seamlessly support English, Hindi, and Hinglish.
- Do NOT mention "Gemini" or "Google" — respond as JyotishSetu's AI Support Assistant.`;

const ASTROLOGER_SYSTEM_PROMPT = `You are JyotishSetu's AI Support Assistant for verified astrologers and Vedic consultants.
Your mission is to provide prompt, professional operational guidance for the Astrologer Portal.

PLATFORM FACTS YOU MUST FOLLOW:
1. Profile Approval Lifecycle: Astrologer profiles must be approved by the Super Admin team before appearing publicly in the seeker directory. Statuses include: Draft, Pending, Changes Requested, Approved, Suspended.
2. Lead Management: Customer enquiries routed to you appear in your Astrologer Leads inbox (/astrologer/leads). You can update lead status (assigned -> contacted -> closed).
3. Consultation Rooms: Your live consultation room button unlocks 15 minutes before the booked Muhurat slot on your Bookings page (/astrologer/bookings).
4. Direct Booking Scheduling: Astrologers can schedule consultations for existing clients at /astrologer/bookings/new (duration 10–180 minutes).
5. Consultation Rates & Bio: You can update your bio, experience, languages, and consultation rates in your Astrologer Profile tab (/astrologer/profile/edit).
6. Reviews & Ratings: Verified seekers can leave 1 to 5-star reviews upon completion of consultation sessions.
7. Support Escalation: For profile re-evaluations, technical errors during consultations, or administrative inquiries, you can escalate directly to the Super Admin desk.

STYLE & SAFETY:
- Be respectful, direct, and mindful of traditional Vedic astrological wisdom. Support English and Hinglish naturally.
- Never promise automatic profile approval, override administrative decisions, or alter platform commission.
- If technical assistance is required, suggest escalating to the Super Admin support desk.
- Do NOT mention "Gemini" or "Google" — respond as JyotishSetu's AI Support Assistant.`;

// ─── Format Knowledge Base Context ───────────────────────────────────────────

function formatKnowledgeContext(items: KnowledgeItem[]): string {
  if (items.length === 0) return "";
  const parts = items.map((item, idx) => {
    return `[VERIFIED KNOWLEDGE ${idx + 1}: ${item.title}]\nSummary: ${item.summary}\nResolution Steps:\n${item.solutionSteps.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}${item.relatedRoute ? `\nRelevant Page: ${item.relatedRoute}` : ""}`;
  });
  return `\n\nAUTHORITATIVE PLATFORM KNOWLEDGE BASE:\n${parts.join("\n\n")}`;
}

// ─── Grounded Deterministic Fallback ─────────────────────────────────────────

function buildDeterministicFallback(
  role: "customer" | "astrologer",
  query: string,
  classification: ClassifiedQueryResult,
  liveDataText?: string,
  recommendations?: AstrologerRecommendationCard[],
  comparisonText?: string,
  selectedProfileText?: string
): GeminiSupportResponse {
  const { category, priority, relevantKnowledge, intent, hasMedicalBoundary, hasFinancialBoundary } = classification;

  let boundaryPrefix = "";
  if (hasMedicalBoundary) {
    boundaryPrefix = "⚠️ **Medical Notice**: Vedic astrology provides traditional spiritual insights into vitality, but NEVER diagnoses illnesses, predicts disease progression, or replaces professional healthcare. For any physical or mental symptoms, please consult a licensed medical doctor immediately. In case of emergencies, contact local emergency services.\n\n";
  } else if (hasFinancialBoundary) {
    boundaryPrefix = "⚠️ **Financial Notice**: Astrology offers philosophical perspectives on prosperity and timing, but CANNOT predict stock market movements or guarantee investment returns. For financial investments, taxation, and debt planning, please consult a certified financial advisor.\n\n";
  }

  // Handle profile selection follow-up
  if (intent === "profile_selection" && selectedProfileText) {
    return {
      success: true,
      message: `${boundaryPrefix}${selectedProfileText}`,
      category: "booking",
      priority: "medium",
      suggestedAction: "continue",
      isFallback: true,
      modelUsed: "grounded-selection",
      recommendations,
    };
  }

  // Handle comparison fallback
  if (intent === "compare_astrologers" && comparisonText) {
    return {
      success: true,
      message: `${boundaryPrefix}${comparisonText}`,
      category: "consultation",
      priority: "medium",
      suggestedAction: "continue",
      isFallback: true,
      modelUsed: "grounded-comparison",
      recommendations,
    };
  }

  // Handle recommendation fallback
  if (intent === "recommend_astrologer" && recommendations && recommendations.length > 0) {
    return {
      success: true,
      message: `${boundaryPrefix}Here are our top recommended Vedic astrologers based on your preferences:\n\n${recommendations.map((a, i) => `${i + 1}. **${a.name}** — ${a.match_reason}\n   • Specializations: ${a.specializations.join(", ")}\n   • Languages: ${a.languages.join(", ")} | Experience: ${a.experience_years}+ years\n   • Fee: ₹${a.consultation_fee}/session | Rating: ⭐ ${a.rating_avg} (${a.total_reviews} reviews)`).join("\n\n")}\n\nYou can click on any profile card below to view their complete details, client testimonials, and book a consultation slot.`,
      category: "consultation",
      priority: "medium",
      suggestedAction: "continue",
      isFallback: true,
      modelUsed: "grounded-recommendation",
      recommendations,
    };
  }

  // Handle live data query fallback
  if (liveDataText) {
    return {
      success: true,
      message: `${boundaryPrefix}${liveDataText}`,
      category,
      priority,
      suggestedAction: "continue",
      isFallback: true,
      modelUsed: "grounded-live-data",
    };
  }

  // Handle human escalation
  if (intent === "human_escalation") {
    return {
      success: true,
      message:
        "I have prepared your request for our Super Admin support desk. Please click the 'Request Human Support' button above or switch to the 'Submit Ticket' tab to submit your request. Our team will review your inquiry promptly and respond in your Support Tickets inbox.",
      category: "general",
      priority: "high",
      suggestedAction: "escalate",
      isFallback: true,
      modelUsed: "grounded-escalation",
    };
  }

  // Knowledge base item match
  if (relevantKnowledge.length > 0) {
    const top = relevantKnowledge[0];
    const stepsFormatted = top.solutionSteps.map((s, i) => `${i + 1}. ${s}`).join("\n");
    const routeText = top.relatedRoute ? `\n\nYou can access this directly at: ${top.relatedRoute}` : "";

    return {
      success: true,
      message: `${boundaryPrefix}${top.summary}\n\nHere is how to approach this:\n${stepsFormatted}${routeText}\n\nIf you need personalized consultation, feel free to ask me for an astrologer recommendation or click 'Request Human Support' for administrative assistance.`,
      category: top.category,
      priority: top.category === "consultation" || top.category === "booking" ? "high" : "medium",
      suggestedAction: top.escalateIfUnresolved ? "escalate" : "continue",
      isFallback: true,
      modelUsed: "grounded-knowledge-base",
    };
  }

  // General safe fallback
  const generalMsg =
    role === "customer"
      ? "Thank you for reaching out to JyotishSetu Customer Care. I can assist you with astrology life guidance (career, marriage, Kundli), astrologer recommendations, consultation room access (opens 15 mins before slot), Muhurat bookings, Kundli profile details, and fee records. If your query requires specialized review, click 'Request Human Support' at any time."
      : "Welcome to Astrologer Support. I can guide you on profile verification standards, lead pipeline management, direct customer booking creation, and consultation room setup. For administrative reviews, click 'Request Human Support' to connect directly with the Super Admin team.";

  return {
    success: true,
    message: `${boundaryPrefix}${generalMsg}`,
    category: "general",
    priority: "medium",
    suggestedAction: "continue",
    isFallback: true,
    modelUsed: "grounded-fallback",
  };
}

// ─── Main Support Chat Function ───────────────────────────────────────────────

export async function askGeminiSupport(params: {
  userId: string;
  role: "customer" | "astrologer";
  query: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<GeminiSupportResponse> {
  const { userId, role, query, history = [] } = params;

  // 1. Per-user rate limit: 10 queries / minute
  const rateLimit = checkRateLimit(`gemini:support:${userId}`, 10, 60_000);
  if (!rateLimit.allowed) {
    return {
      success: false,
      message: `AI query rate limit exceeded. Please wait ${rateLimit.retryAfterSeconds} seconds or escalate directly to human support.`,
      category: "general",
      priority: "medium",
      suggestedAction: "escalate",
      isFallback: true,
      modelUsed: "rate-limit",
      error: "Rate limit exceeded",
    };
  }

  // 2. Classify intent, extract entities, resolve multi-turn conversation history
  const classification = classifyQuery(role, query, history);

  // 3. Execute live data tools based on intent
  let liveDataContent: string | undefined;
  let recommendations: AstrologerRecommendationCard[] | undefined;
  let comparisonContent: string | undefined;
  let selectedProfileContent: string | undefined;

  if (classification.intent === "recommend_astrologer") {
    recommendations = await searchApprovedAstrologers(classification.preferences, 3);
  } else if (classification.intent === "profile_selection" && classification.targetAstrologerSlug) {
    const astroCard = await getAstrologerBySlug(classification.targetAstrologerSlug);
    if (astroCard) {
      recommendations = [astroCard];
      selectedProfileContent = `You have selected **${astroCard.name}** (${astroCard.specializations.join(", ")}, ₹${astroCard.consultation_fee}/session).\n\nTo schedule your consultation:\n1. Click the 'View Profile & Book' button below to open their profile.\n2. Choose your preferred consultation mode (Video Call, Voice Call, or Discussion Thread).\n3. Select your desired date and available Muhurat time slot.\n4. Confirm your appointment. Your virtual consultation room will unlock 15 minutes before the session on your Bookings tab.`;
    }
  } else if (classification.intent === "compare_astrologers" && classification.comparisonSlugs) {
    const compResult = await compareAstrologers(classification.comparisonSlugs[0], classification.comparisonSlugs[1]);
    comparisonContent = compResult.text;
    recommendations = compResult.cards;
  } else if (classification.intent === "live_data_bookings") {
    liveDataContent = await getCustomerBookingsSummary(userId);
  } else if (classification.intent === "live_data_leads") {
    liveDataContent = await getAstrologerLeadsSummary(userId);
  } else if (classification.intent === "live_data_profile_status") {
    liveDataContent = await getAstrologerProfileStatus(userId);
  } else if (classification.intent === "live_data_tickets") {
    liveDataContent = await getUserTicketsSummary(userId);
  }

  const client = getClient();

  // 4. If no Gemini API key configured, use comprehensive deterministic fallback
  if (!client) {
    return buildDeterministicFallback(
      role,
      query,
      classification,
      liveDataContent,
      recommendations,
      comparisonContent,
      selectedProfileContent
    );
  }

  // 5. Build dynamic context for Gemini
  const baseSystemPrompt = role === "customer" ? CUSTOMER_SYSTEM_PROMPT : ASTROLOGER_SYSTEM_PROMPT;
  const knowledgeContext = formatKnowledgeContext(classification.relevantKnowledge);

  let toolContext = "";
  if (selectedProfileContent && recommendations && recommendations.length > 0) {
    toolContext = `\n\nSELECTED ASTROLOGER PROFILE:\n${selectedProfileContent}\n\nInstructions: Acknowledge the user's choice enthusiastically and guide them to book via the profile card below.`;
  } else if (comparisonContent && recommendations && recommendations.length > 0) {
    toolContext = `\n\nASTROLOGER COMPARISON DATA:\n${comparisonContent}\n\nInstructions: Present this objective comparison warmly and encourage the user to choose the astrologer best aligned with their priorities.`;
  } else if (recommendations && recommendations.length > 0) {
    const list = recommendations
      .map(
        (a, i) =>
          `Astrologer ${i + 1}: ${a.name} (Slug: ${a.slug})\n• Specializations: ${a.specializations.join(", ")}\n• Languages: ${a.languages.join(", ")}\n• Experience: ${a.experience_years} years\n• Fee: ₹${a.consultation_fee}/session\n• Rating: ⭐ ${a.rating_avg} (${a.total_reviews} reviews)\n• Match Reason: ${a.match_reason}\n• Profile URL: ${a.profile_url}`
      )
      .join("\n\n");
    toolContext = `\n\nVERIFIED ASTROLOGER RECOMMENDATIONS AVAILABLE (Interactive cards will be displayed to user below your message):\n${list}\n\nInstructions: Acknowledge the user's request warmly, present these astrologers concisely with key highlights, and encourage them to click on the profile cards below to book.`;
  } else if (liveDataContent) {
    toolContext = `\n\nAUTHENTIC USER LIVE ACCOUNT DATA (Retrieved securely from database for this authenticated user):\n${liveDataContent}\n\nInstructions: Present this live information clearly to the user with actionable next steps.`;
  }

  // Safety boundary injection into prompt
  let safetyDirective = "";
  if (classification.hasMedicalBoundary) {
    safetyDirective = "\n\nCRITICAL SAFETY DIRECTIVE: This query involves health or medical topics. You MUST explicitly advise the user to consult a licensed medical doctor or healthcare professional immediately. Do not diagnose, prescribe, or predict illness outcomes.";
  } else if (classification.hasFinancialBoundary) {
    safetyDirective = "\n\nCRITICAL SAFETY DIRECTIVE: This query involves money, wealth, or investments. You MUST explicitly advise that astrology cannot guarantee financial profits or stock market predictions, and suggest consulting a certified financial advisor.";
  }

  const fullSystemInstruction = `${baseSystemPrompt}${safetyDirective}${knowledgeContext}${toolContext}`;

  // Build conversation history
  const contents = [
    ...history.slice(-6).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content.slice(0, 1000) }],
    })),
    { role: "user", parts: [{ text: query.slice(0, 1500) }] },
  ];

  // 6. Attempt with candidate models and strict Promise.race timeout (max 10s)
  for (const modelToTry of FALLBACK_MODELS) {
    try {
      const generatePromise = client.models.generateContent({
        model: modelToTry,
        contents,
        config: {
          systemInstruction: fullSystemInstruction,
          temperature: 0.3,
          maxOutputTokens: 800,
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        const id = setTimeout(() => {
          clearTimeout(id);
          reject(new Error(`Timeout: Gemini ${modelToTry} did not respond within 10 seconds`));
        }, 10_000);
      });

      const result = await Promise.race([generatePromise, timeoutPromise]);
      const text = result?.text;
      if (!text || !text.trim()) {
        throw new Error(`Empty response from Gemini model ${modelToTry}`);
      }

      return {
        success: true,
        message: text.trim(),
        category: classification.category,
        priority: classification.priority,
        suggestedAction: classification.suggestedAction,
        isFallback: false,
        modelUsed: modelToTry,
        recommendations,
      };
    } catch (err: unknown) {
      const errMsg = (err as Error)?.message || "";
      const isOverloaded =
        errMsg.toLowerCase().includes("overload") ||
        errMsg.toLowerCase().includes("unavailable") ||
        errMsg.toLowerCase().includes("503") ||
        errMsg.toLowerCase().includes("high demand") ||
        errMsg.toLowerCase().includes("timeout");

      console.warn(`[Gemini Support Error] Model ${modelToTry} (overloaded: ${isOverloaded}):`, errMsg.slice(0, 140));

      if (errMsg.includes("API key not valid") || errMsg.includes("PERMISSION_DENIED")) {
        break; // Do not loop if credentials are invalid
      }
    }
  }

  // 7. If all Gemini model attempts failed, gracefully fall back to grounded resolution
  return buildDeterministicFallback(
    role,
    query,
    classification,
    liveDataContent,
    recommendations,
    comparisonContent,
    selectedProfileContent
  );
}

// ─── Ticket Summary Generator ─────────────────────────────────────────────────

export function generateAiTicketSummary(
  role: "customer" | "astrologer",
  messages: Array<{ role: string; content: string }>
): {
  summary: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  escalationReason: string;
} {
  const allUserText = messages.filter((m) => m.role === "user").map((m) => m.content).join(" ");
  const userMessages = messages.filter((m) => m.role === "user");
  const initialUserMsg = userMessages[0]?.content || "General inquiry";
  const userMsgCount = userMessages.length;
  const classification = classifyQuery(role, allUserText || initialUserMsg);

  const escalationReason =
    userMsgCount >= 2
      ? "User requested human escalation after AI troubleshooting."
      : "User requested direct human administrator assistance.";

  const priority: SupportTicketPriority =
    classification.category === "consultation" || classification.category === "booking"
      ? "high"
      : classification.priority;

  const issueSnippet = initialUserMsg.length > 100 ? initialUserMsg.slice(0, 100) + "..." : initialUserMsg;
  const summary = `AI-Generated Summary (${role.toUpperCase()}): User reported "${issueSnippet}". Context categorized as [${classification.category.toUpperCase()}]. Gemini AI provided platform guidance; user requested administrator review.`;

  return {
    summary,
    category: classification.category,
    priority,
    escalationReason,
  };
}

// ─── Backwards-compat aliases ─────────────────────────────────────────────────

/** @deprecated Use askGeminiSupport instead */
export const askGrokSupport = askGeminiSupport;
