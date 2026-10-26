import { GoogleGenAI } from "@google/genai";
import { checkRateLimit } from "@/lib/security/rate-limit";
import type { SupportTicketCategory, SupportTicketPriority } from "@/lib/types/database.types";

// ─── Singleton AI client ──────────────────────────────────────────────────────
let _client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === "") return null;
  if (!_client) _client = new GoogleGenAI({ apiKey: apiKey.trim() });
  return _client;
}

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

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
}

// ─── System prompts ───────────────────────────────────────────────────────────

const CUSTOMER_SYSTEM_PROMPT = `You are JyotishSetu's AI Support Assistant for seekers and customers.
Your mission is to provide concise, empathetic, polite, and actionable support for using the JyotishSetu Vedic astrology platform.

PLATFORM FACTS YOU MUST FOLLOW:
1. Bookings & Consultations: Customers can book verified astrologers for Video, Voice Call, or Chat sessions.
2. Virtual Consultation Rooms: Video and Voice rooms unlock precisely 15 minutes before the scheduled Muhurat time on the booking card. Both customer and astrologer enter via secure browser rooms.
3. Cancellations & Rescheduling: Bookings can be cancelled or rescheduled prior to the consultation start time from the Customer Portal Bookings tab.
4. Billing & Fees: Payment gateway integrations are currently in progress. Consultations may be recorded as complimentary (₹0) or pending. Never fabricate transaction IDs, receipts, or claim refunds are processed.
5. Birth Charts: Kundli and birth chart data (Date, Time, Birthplace) can be updated in the Customer Profile section.
6. Support Escalation: If a problem cannot be resolved immediately, or involves an account dispute or sensitive issue, encourage the user to click "Request Human Support" to open a ticket for our Super Admin team.

STYLE & SAFETY:
- Be polite, concise (max 3-4 paragraphs), clear, and professional.
- Never pretend to be a human administrator.
- Never execute unauthorized database changes or promise specific outcomes.
- If unsure, ask clarifying questions or suggest human escalation.
- Do NOT mention "Gemini" or "Google" — respond as JyotishSetu's AI Support Assistant.`;

const ASTROLOGER_SYSTEM_PROMPT = `You are JyotishSetu's AI Support Assistant for verified astrologers and Vedic consultants.
Your mission is to provide prompt, professional operational guidance for the Astrologer Portal.

PLATFORM FACTS YOU MUST FOLLOW:
1. Profile Approval Lifecycle: Astrologer profiles must be approved by the Super Admin team before appearing publicly in the seeker directory. Statuses include: Draft, Pending, Changes Requested, Approved, Suspended.
2. Lead Management: Customer enquiries routed to you appear in your Astrologer Leads inbox. You can update lead status (New -> Contacted -> Qualified -> Converted -> Closed).
3. Consultation Rooms: Your live consultation room button unlocks 15 minutes before the booked Muhurat slot on your Bookings page.
4. Consultation Rates & Bio: You can update your bio, experience, and consultation rates in your Astrologer Profile tab.
5. Reviews & Ratings: Verified seekers can leave 1 to 5-star reviews upon completion of consultation sessions.
6. Support Escalation: For profile re-evaluations, technical errors during consultations, or administrative inquiries, you can escalate directly to the Super Admin desk.

STYLE & SAFETY:
- Be respectful, direct, and mindful of traditional Vedic astrological wisdom.
- Never promise automatic profile approval, override administrative decisions, or alter platform commission.
- If technical assistance is required, suggest escalating to the Super Admin support desk.
- Do NOT mention "Gemini" or "Google" — respond as JyotishSetu's AI Support Assistant.`;

// ─── Deterministic grounding fallbacks ───────────────────────────────────────

function getGroundedFallback(role: "customer" | "astrologer", query: string): {
  message: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
} {
  const q = query.toLowerCase();

  if (role === "customer") {
    if (q.match(/room|join|video|call|muhurat|meeting|slot|consult/)) {
      return {
        message:
          "Your live consultation room unlocks precisely 15 minutes before your scheduled Muhurat time. You can enter the secure browser room directly from your Bookings tab. Ensure your camera and microphone permissions are granted in your browser. If you continue experiencing connection difficulties, please escalate below for human support.",
        category: "consultation",
        priority: "high",
      };
    }
    if (q.match(/cancel|reschedule|booking/)) {
      return {
        message:
          "You can manage, cancel, or reschedule upcoming consultation sessions from your Customer Dashboard Bookings page before the slot start time. If your astrologer is unavailable or missed the session, you can request an administrative reschedule by escalating this request.",
        category: "booking",
        priority: "medium",
      };
    }
    if (q.match(/birth|kundli|profile|chart/)) {
      return {
        message:
          "You can update your birth details (date of birth, exact time of birth, and birthplace coordinates) in your Profile settings. These details are automatically used to compute your Vedic Lagna and Planetary positions for consultations.",
        category: "profile",
        priority: "low",
      };
    }
    if (q.match(/payment|refund|fee|money|bill/)) {
      return {
        message:
          "JyotishSetu's payment gateway integration is currently in scheduled rollout. Current bookings reflect accurate consultation fees as complimentary or pending platform reconciliation. For payment queries or fee reviews, our administrative team will assist you upon escalation.",
        category: "billing",
        priority: "medium",
      };
    }
    return {
      message:
        "Thank you for reaching out to JyotishSetu Customer Care. I can assist you with astrologer directory searches, consultation room access, Muhurat slot timings, birth chart settings, and bookings. If your query requires specialized review, feel free to click 'Request Human Support' at any time.",
      category: "general",
      priority: "medium",
    };
  }

  // Astrologer fallbacks
  if (q.match(/approval|verif|pending|review|profile/)) {
    return {
      message:
        "Astrologer listings are reviewed by the Super Admin moderation team. Once approved, your profile and booking slots will immediately be visible in the customer directory. If changes were requested, please update your certifications and bio in your Profile page.",
      category: "profile",
      priority: "medium",
    };
  }
  if (q.match(/lead|enquiry|client|contact/)) {
    return {
      message:
        "Assigned customer leads appear in your Astrologer Leads inbox. As you reach out to clients, update the lead status from 'New' to 'Contacted' and 'Qualified'. Closing a lead records the consultation and allows the seeker to submit a verified review.",
      category: "leads",
      priority: "medium",
    };
  }
  if (q.match(/rate|price|earning|fee/)) {
    return {
      message:
        "You can adjust your per-minute or session rates for Vedic consultations in your Astrologer Profile settings. Recorded consultation fees are logged in your dashboard earnings overview.",
      category: "billing",
      priority: "low",
    };
  }
  return {
    message:
      "Welcome to Astrologer Support. I can guide you on profile moderation standards, lead pipeline management, consultation room setup, and platform guidelines. If you require immediate administrative action, click 'Request Human Support' to open a ticket directly with Super Admin.",
    category: "general",
    priority: "medium",
  };
}

// ─── Main support chat function ───────────────────────────────────────────────

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

  const client = getClient();

  // 2. No key → grounded fallback
  if (!client) {
    const fallback = getGroundedFallback(role, query);
    return {
      success: true,
      message: fallback.message,
      category: fallback.category,
      priority: fallback.priority,
      suggestedAction: "continue",
      isFallback: true,
      modelUsed: "grounded-fallback",
    };
  }

  // 3. Build conversation for Gemini
  const systemPrompt = role === "customer" ? CUSTOMER_SYSTEM_PROMPT : ASTROLOGER_SYSTEM_PROMPT;

  // Build contents array: system instruction + history + current query
  const contents = [
    ...history.slice(-6).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content.slice(0, 1000) }],
    })),
    { role: "user", parts: [{ text: query.slice(0, 1500) }] },
  ];

  // 4. Attempt with retry
  let attempts = 0;
  const maxAttempts = 2;

  while (attempts < maxAttempts) {
    attempts++;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    try {
      const result = await client.models.generateContent({
        model: DEFAULT_MODEL,
        contents,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.4,
          maxOutputTokens: 800,
        },
      });

      clearTimeout(timeoutId);

      const text = result.text;
      if (!text || !text.trim()) {
        throw new Error("Empty response from Gemini");
      }

      const inferred = getGroundedFallback(role, query);

      return {
        success: true,
        message: text.trim(),
        category: inferred.category,
        priority: inferred.priority,
        suggestedAction: "continue",
        isFallback: false,
        modelUsed: DEFAULT_MODEL,
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const errMsg = (err as Error)?.message || "";
      const isAbort = (err as Error)?.name === "AbortError";
      const isOverloaded = errMsg.toLowerCase().includes("overload") ||
        errMsg.toLowerCase().includes("unavailable") ||
        errMsg.toLowerCase().includes("503") ||
        errMsg.toLowerCase().includes("high demand");

      console.warn(`[Gemini Support ${isAbort ? "Timeout" : isOverloaded ? "Overloaded" : "Error"}] Attempt ${attempts}:`, errMsg.slice(0, 120));

      // Non-retryable auth errors
      if (errMsg.includes("401") || errMsg.includes("403") || errMsg.includes("API_KEY")) {
        break;
      }

      if (attempts >= maxAttempts) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  // 5. Graceful offline fallback
  const fallback = getGroundedFallback(role, query);
  return {
    success: true,
    message: `${fallback.message}\n\n*(AI assistant is temporarily under high demand. For immediate help, click 'Request Human Support' below).*`,
    category: fallback.category,
    priority: fallback.priority,
    suggestedAction: "continue",
    isFallback: true,
    modelUsed: "grounded-fallback",
  };
}

// ─── Ticket summary generator (unchanged interface) ───────────────────────────

export function generateAiTicketSummary(
  role: "customer" | "astrologer",
  messages: Array<{ role: string; content: string }>
): {
  summary: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  escalationReason: string;
} {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content || "General inquiry";
  const userMsgCount = messages.filter((m) => m.role === "user").length;
  const inferred = getGroundedFallback(role, lastUserMsg);

  const escalationReason =
    userMsgCount >= 2
      ? "User requested human escalation after AI troubleshooting."
      : "User requested direct human administrator assistance.";

  const summary = `AI-Generated Summary (${role.toUpperCase()}): User initiated support regarding "${lastUserMsg.slice(0, 120)}...". Context categorized as [${inferred.category.toUpperCase()}]. Gemini AI provided platform guidance; user requested administrator review.`;

  return {
    summary,
    category: inferred.category,
    priority: inferred.priority,
    escalationReason,
  };
}

// ─── Backwards-compat aliases (so existing imports keep working) ───────────────

/** @deprecated Use askGeminiSupport instead */
export const askGrokSupport = askGeminiSupport;
