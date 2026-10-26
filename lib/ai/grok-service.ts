import { checkRateLimit } from "@/lib/security/rate-limit";
import type { SupportTicketCategory, SupportTicketPriority } from "@/lib/types/database.types";

export interface GrokChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface GrokSupportResponse {
  success: boolean;
  message: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  suggestedAction?: "continue" | "escalate" | "self_service";
  isFallback: boolean;
  modelUsed: string;
  error?: string;
}

const XAI_API_ENDPOINT =
  process.env.XAI_API_ENDPOINT ||
  process.env.AI_API_ENDPOINT ||
  "https://api.x.ai/v1/responses";
const DEFAULT_MODEL = process.env.XAI_MODEL || "grok-4.7";

/**
 * System prompt grounding for Customer / Seeker support
 */
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
- If unsure, ask clarifying questions or suggest human escalation.`;

/**
 * System prompt grounding for Astrologer support
 */
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
- Be respectful, direct, and respectful of traditional Vedic astrological wisdom.
- Never promise automatic profile approval, override administrative decisions, or alter platform commission.
- If technical assistance is required, suggest escalating to the Super Admin support desk.`;

/**
 * Deterministic grounding fallbacks when API is unreachable or key is not provided
 */
function getGroundedFallback(role: "customer" | "astrologer", query: string): {
  message: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
} {
  const q = query.toLowerCase();

  if (role === "customer") {
    if (
      q.includes("room") ||
      q.includes("join") ||
      q.includes("video") ||
      q.includes("call") ||
      q.includes("muhurat") ||
      q.includes("meeting") ||
      q.includes("slot") ||
      q.includes("consult")
    ) {
      return {
        message: "Your live consultation room unlocks precisely 15 minutes before your scheduled Muhurat time. You can enter the secure browser room directly from your Bookings tab. Ensure your camera and microphone permissions are granted in your browser. If you continue experiencing connection difficulties, please escalate below for human support.",
        category: "consultation",
        priority: "high",
      };
    }
    if (q.includes("cancel") || q.includes("reschedule") || q.includes("booking")) {
      return {
        message: "You can manage, cancel, or reschedule upcoming consultation sessions from your Customer Dashboard Bookings page before the slot start time. If your astrologer is unavailable or missed the session, you can request an administrative reschedule by escalating this request.",
        category: "booking",
        priority: "medium",
      };
    }
    if (q.includes("birth") || q.includes("kundli") || q.includes("profile") || q.includes("chart")) {
      return {
        message: "You can update your birth details (date of birth, exact time of birth, and birthplace coordinates) in your Profile settings. These details are automatically used to compute your Vedic Lagna and Planetary positions for consultations.",
        category: "profile",
        priority: "low",
      };
    }
    if (q.includes("payment") || q.includes("refund") || q.includes("fee") || q.includes("money") || q.includes("bill")) {
      return {
        message: "JyotishSetu's payment gateway integration is currently in scheduled rollout. Current bookings reflect accurate consultation fees as complimentary or pending platform reconciliation. For payment queries or fee reviews, our administrative team will assist you upon escalation.",
        category: "billing",
        priority: "medium",
      };
    }
    return {
      message: "Thank you for reaching out to JyotishSetu Customer Care. I can assist you with astrologer directory searches, consultation room access, Muhurat slot timings, birth chart settings, and bookings. If your query requires specialized review, feel free to click 'Request Human Support' at any time.",
      category: "general",
      priority: "medium",
    };
  }

  // Astrologer role fallbacks
  if (
    q.includes("approval") ||
    q.includes("verif") ||
    q.includes("pending") ||
    q.includes("review") ||
    q.includes("profile")
  ) {
    return {
      message: "Astrologer listings are reviewed by the Super Admin moderation team. Once approved, your profile and booking slots will immediately be visible in the customer directory. If changes were requested, please update your certifications and bio in your Profile page.",
      category: "profile",
      priority: "medium",
    };
  }
  if (q.includes("lead") || q.includes("enquiry") || q.includes("client") || q.includes("contact")) {
    return {
      message: "Assigned customer leads appear in your Astrologer Leads inbox. As you reach out to clients, update the lead status from 'New' to 'Contacted' and 'Qualified'. Closing a lead records the consultation and allows the seeker to submit a verified review.",
      category: "leads",
      priority: "medium",
    };
  }
  if (q.includes("rate") || q.includes("price") || q.includes("earning") || q.includes("fee")) {
    return {
      message: "You can adjust your per-minute or session rates for Vedic consultations in your Astrologer Profile settings. Recorded consultation fees are logged in your dashboard earnings overview.",
      category: "billing",
      priority: "low",
    };
  }

  return {
    message: "Welcome to Astrologer Support. I can guide you on profile moderation standards, lead pipeline management, consultation room setup, and platform guidelines. If you require immediate administrative action, click 'Request Human Support' to open a ticket directly with Super Admin.",
    category: "general",
    priority: "medium",
  };
}

/**
 * Ask Grok AI with automatic grounding, timeout, error handling, and offline fallbacks
 */
export async function askGrokSupport(params: {
  userId: string;
  role: "customer" | "astrologer";
  query: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<GrokSupportResponse> {
  const { userId, role, query, history = [] } = params;

  // 1. Per-user rate limiting: 10 queries per minute
  const rateLimit = checkRateLimit(`grok:support:${userId}`, 10, 60_000);
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

  const apiKey = process.env.XAI_API_KEY;

  // 2. If no API key configured, seamlessly use deterministic platform grounding
  if (!apiKey || apiKey === "your-xai-api-key" || apiKey.trim() === "") {
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

  // 3. Prepare payload for xAI Grok API
  const systemPrompt = role === "customer" ? CUSTOMER_SYSTEM_PROMPT : ASTROLOGER_SYSTEM_PROMPT;
  const messages: GrokChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.slice(-6).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content.slice(0, 1000),
    })),
    { role: "user", content: query.slice(0, 1500) },
  ];

  // 4. Execute request with 15-second timeout and bounded retry
  let attempts = 0;
  const maxAttempts = 2;

  while (attempts < maxAttempts) {
    attempts++;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    try {
      const isResponsesEndpoint = XAI_API_ENDPOINT.includes("/responses");
      const requestBody = isResponsesEndpoint
        ? {
            model: DEFAULT_MODEL,
            input: messages,
          }
        : {
            model: DEFAULT_MODEL,
            messages,
            temperature: 0.3,
            max_tokens: 800,
          };

      const response = await fetch(XAI_API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.warn(`[Grok API Error ${response.status}] Attempt ${attempts}:`, errorText.slice(0, 200));

        if (response.status === 401 || response.status === 403 || response.status === 429) {
          // Non-retryable auth or quota error, drop to grounded fallback immediately
          break;
        }

        if (attempts >= maxAttempts) {
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      const data = await response.json();
      let content: string | null = null;

      if (typeof data === "string") {
        content = data;
      } else if (typeof data?.output === "string") {
        content = data.output;
      } else if (Array.isArray(data?.output)) {
        content = data.output.map((o: unknown) => (typeof o === "string" ? o : (o as Record<string, unknown>)?.content || (o as Record<string, unknown>)?.text || "")).join("\n");
      } else if (typeof data?.response === "string") {
        content = data.response;
      } else if (typeof data?.text === "string") {
        content = data.text;
      } else if (data?.choices?.[0]?.message?.content) {
        content = data.choices[0].message.content;
      } else if (data?.choices?.[0]?.text) {
        content = data.choices[0].text;
      }

      if (!content || typeof content !== "string" || !content.trim()) {
        throw new Error("Invalid response format from AI API");
      }

      // Infer category & priority from response & query
      const inferred = getGroundedFallback(role, query);

      return {
        success: true,
        message: content.trim(),
        category: inferred.category,
        priority: inferred.priority,
        suggestedAction: "continue",
        isFallback: false,
        modelUsed: DEFAULT_MODEL,
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const isAbort = (err as Error)?.name === "AbortError";
      console.warn(`[Grok API ${isAbort ? "Timeout" : "Exception"}] Attempt ${attempts}`);

      if (attempts >= maxAttempts) {
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // Graceful fallback if Grok was unreachable
  const fallback = getGroundedFallback(role, query);
  return {
    success: true,
    message: `${fallback.message}\n\n*(Note: AI assistance is currently operating in offline grounded mode. You can request immediate human assistance below).*`,
    category: fallback.category,
    priority: fallback.priority,
    suggestedAction: "continue",
    isFallback: true,
    modelUsed: "grounded-fallback",
  };
}

/**
 * Generate a concise internal AI summary and escalation reason for the Super Admin ticket
 */
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

  const summary = `AI-Generated Summary (${role.toUpperCase()}): User initiated consultation support regarding "${lastUserMsg.slice(0, 120)}...". Context categorized as [${inferred.category.toUpperCase()}]. AI provided platform guidance; user requested administrator review.`;

  return {
    summary,
    category: inferred.category,
    priority: inferred.priority,
    escalationReason,
  };
}
