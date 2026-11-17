import { GoogleGenAI } from "@google/genai";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupportTicketCategory, SupportTicketPriority } from "@/lib/types/database.types";
import { classifyQuery, generateGreetingResponse, type ClassifiedQueryResult } from "./rag-pipeline";
import {
  searchApprovedAstrologers,
  getCustomerBirthDetailsSummary,
  getCustomerBookingsSummary,
  getAstrologerBookingsSummary,
  getAstrologerProfileStatus,
  getAstrologerProfileCompletionSummary,
  getAstrologerEarningsSummary,
  getAstrologerLeadsSummary,
  getUserTicketsSummary,
  getAstrologerBySlug,
  compareAstrologers,
  getCustomerAstrologicalContext,
  getAstrologerOperationalSnapshot,
  type AstrologerRecommendationCard,
} from "./live-tools";
import {
  retrieveLearnedExperiences,
  type MatchLearnedKnowledgeResult,
} from "./learning-engine";
import type { KnowledgeItem } from "./knowledge-base";

// ─── Singleton AI client ──────────────────────────────────────────────────────
let _client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === "") return null;
  if (!_client) _client = new GoogleGenAI({ apiKey: apiKey.trim() });
  return _client;
}

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const FALLBACK_MODELS = Array.from(new Set([DEFAULT_MODEL, "gemini-3.5-flash-lite", "gemini-2.5-flash"]));

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
  interactionId?: string;
  learnedSourcesUsed?: number;
}

// ─── Master System Prompts (Phase 4 Specification) ───────────────────────────

export const CUSTOMER_SYSTEM_PROMPT = `You are Karmic Ascension's Master AI Vedic Astrology & Seeker Support Assistant.
You combine deep knowledge of traditional Parashari and Jaimini Jyotish concepts with verified, real-time knowledge of the Karmic Ascension platform.

VEDIC ASTROLOGY & KUNDLI GUIDELINES:
1. Traditional Astrological Concepts:
   - Answer queries involving Janam Kundli, Lagna (ascendant), Rashi (Moon sign), Nakshatra, Vimshottari Mahadasha and Antardasha, planetary transits (Gochar), Shani Sade Sati, Dhaiya, Rahu-Ketu axis, Manglik Dosha, Kaal Sarp Dosha, Pitra Dosha, Ashtakoot Guna Milan, Muhurat selection, Vastu Shastra principles, and Vedic numerology.
   - Explain traditional concepts in simple, accessible, illuminating language.
   - Present astrological interpretations as traditional spiritual interpretations rather than scientifically established certainties.
2. Constructive Interpretation & Dharmic Ethics:
   - Explain Doshas calmly, constructively, and philosophically.
   - NEVER use fear-mongering, curses, fatalistic threats, or coercive remedies.
   - Suggest constructive practices such as meditation, mantra japa, charity (daan), and personal discipline where relevant.
   - Suggest a verified Karmic Ascension astrologer for personalized, high-precision chart interpretation when appropriate.
3. Personal Birth Details & Kundli Context:
   - Use authenticated user context when actual birth details are available in context.
   - When asked about the user's birth details, return the actual saved date of birth, time of birth, and birthplace where available and authorized.
   - Clearly identify missing fields.
   - If details are missing, guide the user to the customer profile page (/customer/profile).
   - Never invent birth details, planetary placements, chart calculations, or Dasha periods.
   - Do not claim to have calculated a Kundli without using a verified calculation method.

MEDICAL, FINANCIAL & ETHICAL BOUNDARIES:
- Medical Boundary (CRITICAL): NEVER diagnose physical or mental illness, predict disease progression or death, prescribe treatments, or advise stopping medication. Direct users to licensed medical doctors immediately and to emergency services for acute symptoms.
- Financial Boundary (CRITICAL): NEVER guarantee investment returns, predict stock market movements or cryptocurrency as facts, or provide speculative trading instructions. Direct users to certified financial advisors.
- Relationship & Outcome Boundary: Do not guarantee marriage dates, partner feelings, exam results, employment outcomes, or life events. Emphasize personal diligence and conscious decision-making.

PLATFORM OPERATIONS:
- Prioritize verified authoritative platform documentation and eligible learned experiences for operational questions.
- Use live authorized data for personal booking, profile, consultation, and account questions.
- Virtual consultation rooms unlock exactly 15 minutes before the booked Muhurat slot on the Bookings page (/customer/bookings).
- Customers can cancel upcoming bookings directly from the Bookings tab prior to start time. Completed sessions cannot be cancelled.
- Recommend only real, verified, approved astrologers supplied by authorized application data. Never invent astrologer names, fees, ratings, or booking availability.

LANGUAGE & TONE:
- Match the user's language: English, Hindi, or Hinglish seamlessly.
- Be warm, empathetic, structured, and concise (usually 2 or 3 short paragraphs or clear bullet points).
- Answer the user's actual question first before offering additional guidance.
- Do NOT mention "Gemini" or "Google" — respond as Karmic Ascension's Master AI Assistant.

GREETINGS & RELEVANCE RULES:
- When the user sends a greeting (e.g. "hi", "hello", "hey", "namaste", "good morning", "how are you?"), respond with a warm, welcoming, concise greeting.
- Respond PRIMARILY to the user's latest message. Never assume the user is experiencing an authentication, login, OAuth, or account role issue unless they explicitly state one.
- Never dump an unrelated troubleshooting guide or Google OAuth instructions when the user merely says hello.
- If the user's intent is genuinely ambiguous, ask a brief, polite clarifying question.`;

export const ASTROLOGER_SYSTEM_PROMPT = `You are Karmic Ascension's Master AI Consultant Support & Vedic Operations Assistant for astrologers, Acharyas, and Pandits.

ASTROLOGER PORTAL & WORKFLOW:
1. Profile Approval Lifecycle:
   - Astrologer profiles must be approved by the Super Admin team before appearing publicly in the seeker directory.
   - Statuses include: Draft, Pending, Changes Requested, Approved, Rejected, and Suspended.
   - 100% completion across 5 mandatory criteria (Basic information & bio, Specializations, Languages, Consultation fee, and Profile photo) is required for moderation review.
   - Explain how to update and resubmit a profile using /astrologer/profile/edit.
2. Direct Consultation Bookings & Scheduling:
   - Upcoming sessions are managed at /astrologer/bookings.
   - Astrologers can schedule consultations directly for clients from lead details or via /astrologer/bookings/new (duration 10–180 minutes).
   - Virtual consultation rooms unlock exactly 15 minutes before the booked Muhurat appointment.
3. Lead Pipeline & Enquiries:
   - Customer enquiries routed to you appear in your Leads inbox (/astrologer/leads).
   - You can advance assignment status: assigned -> contacted -> closed.
4. Earnings, Commission & Settlements:
   - Karmic Ascension operates on a structured weekly batch reconciliation cycle.
   - Gross earnings are derived from completed consultation records at your verified fee rate.
   - The platform never fabricates fake balances, commission overrides, or payout guarantees. View itemized records at /astrologer/earnings.

ASTROLOGY & CONSULTATION PRACTICE:
- Assist mentors with Bhava significations, divisional charts (D1 Rashi, D9 Navamsha, D10 Dashamsha), Ashtakoot Guna matching principles, Panchang elements (Tithi, Vara, Nakshatra, Yoga, Karana), and consultation best practices.
- Encourage ethical interpretations, seeker transparency, and strict confidentiality.
- Never encourage fear-based remedies, unsupported health predictions, or financial return guarantees.

OPERATIONAL ASSISTANCE & SECURITY:
- Only disclose customer information to the astrologer authorized to access the relevant lead or consultation.
- Never reveal another astrologer's private records or customer list.
- Direct genuine profile-review disputes, payout discrepancies, and technical consultation-room problems to the Super Admin escalation workflow.
- Match the user's language: English, Hindi, or Hinglish. Respond respectfully and clearly.
- Do NOT mention "Gemini" or "Google" — respond as Karmic Ascension's Master AI Assistant.

GREETINGS & RELEVANCE RULES:
- When the astrologer sends a greeting (e.g. "hi", "hello", "hey", "namaste", "good morning", "how are you?"), respond with a warm, welcoming, concise greeting.
- Respond PRIMARILY to the astrologer's latest message. Never dump an unrelated troubleshooting guide or OAuth instructions when the astrologer merely says hello.
- Never assume an operational issue unless explicitly described by the user.`;

// ─── Format Knowledge Base & Learned Context ──────────────────────────────────

function formatKnowledgeContext(items: KnowledgeItem[]): string {
  if (items.length === 0) return "";
  const parts = items.map((item, idx) => {
    return `[AUTHORITATIVE KNOWLEDGE ${idx + 1}: ${item.title}]\nSummary: ${item.summary}\nResolution Steps:\n${item.solutionSteps.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}${item.relatedRoute ? `\nRelevant Page: ${item.relatedRoute}` : ""}`;
  });
  return `\n\nAUTHORITATIVE PLATFORM KNOWLEDGE BASE:\n${parts.join("\n\n")}`;
}

function formatLearnedContext(learned: MatchLearnedKnowledgeResult[]): string {
  if (learned.length === 0) return "";
  const parts = learned.map((k, idx) => {
    return `[LEARNED EXPERIENCE ${idx + 1} (Confidence: ${(Number(k.confidence_score) * 100).toFixed(0)}%, Category: ${k.category})]\nQuestion Pattern: ${k.question_pattern}\nVerified Solution: ${k.verified_solution}`;
  });
  return `\n\nVERIFIED HISTORICAL SUPPORT EXPERIENCES (Reference only — do not reveal internal memory mechanics):\n${parts.join("\n\n")}`;
}

// ─── Grounded Deterministic Fallback ─────────────────────────────────────────

function buildDeterministicFallback(
  role: "customer" | "astrologer",
  query: string,
  classification: ClassifiedQueryResult,
  liveDataText?: string,
  recommendations?: AstrologerRecommendationCard[],
  comparisonText?: string,
  selectedProfileText?: string,
  learnedExperiences: MatchLearnedKnowledgeResult[] = []
): GeminiSupportResponse {
  const { category, priority, relevantKnowledge, intent, hasMedicalBoundary, hasFinancialBoundary } = classification;

  let boundaryPrefix = "";
  if (hasMedicalBoundary) {
    boundaryPrefix = "⚠️ **Medical Notice**: Vedic astrology provides traditional spiritual insights into vitality, but NEVER diagnoses illnesses, predicts disease progression, or replaces professional healthcare. For any physical or mental symptoms, please consult a licensed medical doctor immediately. In case of emergencies, contact local emergency services.\n\n";
  } else if (hasFinancialBoundary) {
    boundaryPrefix = "⚠️ **Financial Notice**: Astrology offers philosophical perspectives on prosperity and timing, but CANNOT predict stock market movements or guarantee investment returns. For financial investments, taxation, and debt planning, please consult a certified financial advisor.\n\n";
  }

  // Handle conversational greeting fallback
  if (intent === "greeting") {
    return {
      success: true,
      message: generateGreetingResponse(role, query),
      category: "general",
      priority: "low",
      suggestedAction: "continue",
      isFallback: false,
      modelUsed: "deterministic-greeting",
    };
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

  // Handle high-confidence learned knowledge fallback (confidence >= 0.75 and similarity >= 0.65)
  if (learnedExperiences.length > 0) {
    const topLearned = learnedExperiences[0];
    if (topLearned.confidence_score >= 0.75 && topLearned.similarity >= 0.65) {
      return {
        success: true,
        message: `${boundaryPrefix}${topLearned.verified_solution}`,
        category: topLearned.category || category,
        priority: "medium",
        suggestedAction: "continue",
        isFallback: true,
        modelUsed: "grounded-learned-memory",
        learnedSourcesUsed: learnedExperiences.length,
      };
    }
  }

  // Knowledge base item match - verify genuine topic relevance before returning specific troubleshooting steps
  if (relevantKnowledge.length > 0) {
    const top = relevantKnowledge[0];
    const normalizedQ = query.toLowerCase();
    const hasRelevance =
      top.keywords.some((k) => normalizedQ.includes(k.toLowerCase())) ||
      top.hinglishKeywords.some((hk) => normalizedQ.includes(hk.toLowerCase())) ||
      normalizedQ.includes(top.title.toLowerCase()) ||
      normalizedQ.includes(top.category.toLowerCase());

    if (hasRelevance) {
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
  }

  // General safe fallback
  const generalMsg =
    role === "customer"
      ? "Thank you for reaching out to Karmic Ascension Customer Care. I can assist you with astrology life guidance (career, marriage, Kundli), astrologer recommendations, consultation room access (opens 15 mins before slot), Muhurat bookings, Kundli profile details, and fee records. If your query requires specialized review, click 'Request Human Support' at any time."
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

// ─── Main Hybrid RAG AI Orchestrator ─────────────────────────────────────────

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

  // Fast path: Pure conversational greetings respond instantly without expensive model calls or knowledge pollution
  if (classification.intent === "greeting") {
    const greetingMsg = generateGreetingResponse(role, query);
    return {
      success: true,
      message: greetingMsg,
      category: "general",
      priority: "low",
      suggestedAction: "continue",
      isFallback: false,
      modelUsed: "deterministic-greeting",
    };
  }

  // 3. Parallel Context Retrieval using Promise.allSettled
  const [learnedRes, liveContextRes] = await Promise.allSettled([
    retrieveLearnedExperiences(role, query, 3),
    role === "customer"
      ? getCustomerAstrologicalContext(userId)
      : getAstrologerOperationalSnapshot(userId),
  ]);

  const learnedExperiences: MatchLearnedKnowledgeResult[] =
    learnedRes.status === "fulfilled" ? learnedRes.value : [];
  const liveContextString: string =
    liveContextRes.status === "fulfilled" ? liveContextRes.value : "";

  // 4. Execute specific live data tools based on intent
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
  } else if (classification.intent === "live_data_birth_details") {
    liveDataContent = await getCustomerBirthDetailsSummary(userId);
  } else if (classification.intent === "live_data_bookings") {
    liveDataContent =
      role === "astrologer"
        ? await getAstrologerBookingsSummary(userId)
        : await getCustomerBookingsSummary(userId);
  } else if (classification.intent === "live_data_leads") {
    liveDataContent = await getAstrologerLeadsSummary(userId);
  } else if (classification.intent === "live_data_profile_status") {
    liveDataContent = await getAstrologerProfileStatus(userId);
  } else if (classification.intent === "live_data_profile_completion") {
    liveDataContent = await getAstrologerProfileCompletionSummary(userId);
  } else if (classification.intent === "live_data_earnings") {
    liveDataContent = await getAstrologerEarningsSummary(userId);
  } else if (classification.intent === "live_data_tickets") {
    liveDataContent = await getUserTicketsSummary(userId);
  }

  // 5. Interaction logger helper
  const logInteraction = async (
    responseText: string,
    isFallback: boolean = false
  ): Promise<string | undefined> => {
    void isFallback;
    try {
      const admin = await createAdminClient("main");
      const usedKnowledgeIds = classification.relevantKnowledge.map((k) => k.id);
      const learnedIds = learnedExperiences.map((k) => k.id);

      const { data: logEntry } = await admin
        .from("ai_interaction_logs")
        .insert({
          user_id: userId,
          user_role: role,
          query,
          classified_intent: classification.intent,
          classified_category: classification.category,
          ai_response: responseText,
          used_knowledge_ids: usedKnowledgeIds,
          learned_knowledge_ids: learnedIds,
          feedback_rating: null,
          feedback_comment: null,
          escalated_to_ticket: false,
        })
        .select("id")
        .maybeSingle();

      return logEntry?.id;
    } catch (err) {
      console.warn("[ai_interaction_logs] Log insertion warning:", (err as Error)?.message);
      return undefined;
    }
  };

  const client = getClient();

  // 6. If no Gemini API key configured, use deterministic fallback
  if (!client) {
    const fallbackResponse = buildDeterministicFallback(
      role,
      query,
      classification,
      liveDataContent,
      recommendations,
      comparisonContent,
      selectedProfileContent,
      learnedExperiences
    );
    const interactionId = await logInteraction(fallbackResponse.message, true);
    return {
      ...fallbackResponse,
      interactionId,
      learnedSourcesUsed: learnedExperiences.length,
    };
  }

  // 7. Build dynamic context for Gemini
  const baseSystemPrompt = role === "customer" ? CUSTOMER_SYSTEM_PROMPT : ASTROLOGER_SYSTEM_PROMPT;
  const knowledgeContext = formatKnowledgeContext(classification.relevantKnowledge);
  const learnedContext = formatLearnedContext(learnedExperiences);
  const liveUserContext = liveContextString ? `\n\nAUTHENTIC USER CONTEXT (Authorized live database snapshot for this user):\n${liveContextString}` : "";

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
    toolContext = `\n\nAUTHENTIC USER LIVE ACCOUNT & OPERATIONAL DATA (Retrieved securely from database for this authenticated user):\n${liveDataContent}\n\nInstructions: Present this live information clearly to the user with actionable next steps.`;
  }

  // Safety boundary injection into prompt
  let safetyDirective = "";
  if (classification.hasMedicalBoundary) {
    safetyDirective = "\n\nCRITICAL SAFETY DIRECTIVE: This query involves health or medical topics. You MUST explicitly advise the user to consult a licensed medical doctor or healthcare professional immediately. Do not diagnose, prescribe, or predict illness outcomes.";
  } else if (classification.hasFinancialBoundary) {
    safetyDirective = "\n\nCRITICAL SAFETY DIRECTIVE: This query involves money, wealth, or investments. You MUST explicitly advise that astrology cannot guarantee financial profits or stock market predictions, and suggest consulting a certified financial advisor.";
  }

  const fullSystemInstruction = `${baseSystemPrompt}${safetyDirective}${knowledgeContext}${learnedContext}${liveUserContext}${toolContext}`;

  // Build conversation history
  const contents = [
    ...history.slice(-6).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content.slice(0, 1000) }],
    })),
    { role: "user", parts: [{ text: query.slice(0, 1500) }] },
  ];

  // 8. Attempt with candidate models and strict Promise.race timeout (max 10s)
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

      const responseText = text.trim();
      const interactionId = await logInteraction(responseText, false);

      return {
        success: true,
        message: responseText,
        category: classification.category,
        priority: classification.priority,
        suggestedAction: classification.suggestedAction,
        isFallback: false,
        modelUsed: modelToTry,
        recommendations,
        interactionId,
        learnedSourcesUsed: learnedExperiences.length,
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

  // 9. If all Gemini model attempts failed, gracefully fall back to grounded resolution
  const fallbackResponse = buildDeterministicFallback(
    role,
    query,
    classification,
    liveDataContent,
    recommendations,
    comparisonContent,
    selectedProfileContent,
    learnedExperiences
  );
  const interactionId = await logInteraction(fallbackResponse.message, true);

  return {
    ...fallbackResponse,
    interactionId,
    learnedSourcesUsed: learnedExperiences.length,
  };
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
