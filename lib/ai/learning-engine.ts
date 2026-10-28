/**
 * Self-Learning Engine for JyotishSetu AI
 *
 * Implements:
 * 1. Semantic Embedding Generation (text-embedding-004, 768-dim)
 * 2. Hybrid RAG Knowledge Retrieval with Vector RPC & Keyword Fallback
 * 3. Learning from Resolved Administrator Support Tickets
 * 4. Promoting Novel High-Rated AI Interactions to Learned Memory
 */

import { GoogleGenAI } from "@google/genai";
import { createAdminClient } from "@/lib/supabase/admin";
export type { MatchLearnedKnowledgeResult };
import type {
  MatchLearnedKnowledgeResult,
  SupportTicketCategory,
} from "@/lib/types/database.types";

// In-memory LRU embedding cache (max 200 items) to prevent redundant API calls
const EMBEDDING_CACHE = new Map<string, number[]>();
const MAX_CACHE_SIZE = 200;

function getEmbeddingClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === "") return null;
  return new GoogleGenAI({ apiKey: apiKey.trim() });
}

/**
 * Generate 768-dimensional text embedding using text-embedding-004.
 * Returns null safely if API key is not configured or an error occurs.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const sanitized = text.trim();
  if (!sanitized) return null;

  // Check in-memory cache
  if (EMBEDDING_CACHE.has(sanitized)) {
    return EMBEDDING_CACHE.get(sanitized)!;
  }

  const client = getEmbeddingClient();
  if (!client) return null;

  try {
    const response = await client.models.embedContent({
      model: "text-embedding-004",
      contents: sanitized,
    });

    // Extract values array from response safely without any
    interface EmbedContentResponse {
      embedding?: { values?: number[] };
      embeddings?: Array<{ values?: number[] }>;
    }
    const embedRes = response as unknown as EmbedContentResponse;
    const values = embedRes.embedding?.values || embedRes.embeddings?.[0]?.values;

    if (Array.isArray(values) && values.length === 768) {
      if (EMBEDDING_CACHE.size >= MAX_CACHE_SIZE) {
        const oldestKey = EMBEDDING_CACHE.keys().next().value;
        if (oldestKey) EMBEDDING_CACHE.delete(oldestKey);
      }
      EMBEDDING_CACHE.set(sanitized, values);
      return values;
    }

    return null;
  } catch (err) {
    // Non-fatal: Vector search will fall back to keyword matching
    console.error("[generateEmbedding] Vector generation failed, falling back to keyword search:", (err as Error)?.message);
    return null;
  }
}

/**
 * Retrieves learned experiences for customer or astrologer role.
 * Uses match_learned_knowledge RPC when vector search is available,
 * and falls back to token/keyword overlap when embeddings are offline.
 */
export async function retrieveLearnedExperiences(
  role: "customer" | "astrologer",
  query: string,
  limit: number = 3
): Promise<MatchLearnedKnowledgeResult[]> {
  try {
    const admin = await createAdminClient("main");
    const queryEmbedding = await generateEmbedding(query);

    // 1. Vector Search via RPC
    if (queryEmbedding && Array.isArray(queryEmbedding) && queryEmbedding.length === 768) {
      const { data: rpcResults, error: rpcError } = await admin.rpc(
        "match_learned_knowledge",
        {
          query_embedding: queryEmbedding,
          target_role: role,
          match_threshold: 0.72,
          match_count: limit,
        }
      );

      if (!rpcError && Array.isArray(rpcResults) && rpcResults.length > 0) {
        return rpcResults as MatchLearnedKnowledgeResult[];
      }
    }

    // 2. Keyword / Token Overlap Fallback (Threshold: confidence >= 0.50)
    const { data: fallbackRows, error: fallbackError } = await admin
      .from("ai_learned_knowledge")
      .select("*")
      .eq("is_active", true)
      .or(`applicable_role.eq.${role},applicable_role.eq.both`)
      .gte("confidence_score", 0.50)
      .limit(30);

    if (fallbackError || !fallbackRows || fallbackRows.length === 0) {
      return [];
    }

    const queryTokens = new Set(
      query
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 2)
    );

    const scored = fallbackRows
      .map((row) => {
        const patternTokens = (row.question_pattern || "").toLowerCase().split(/\s+/);
        const keywords = (row.keywords || []).map((k: string) => k.toLowerCase());
        const allTokens = [...patternTokens, ...keywords];

        let matchCount = 0;
        for (const token of allTokens) {
          if (queryTokens.has(token)) matchCount++;
        }

        const similarity = Math.min(1.0, matchCount / Math.max(1, queryTokens.size));
        const hybridRank = similarity * 0.75 + Number(row.confidence_score) * 0.25;

        return {
          id: row.id,
          source_ticket_id: row.source_ticket_id,
          applicable_role: row.applicable_role,
          category: row.category,
          question_pattern: row.question_pattern,
          verified_solution: row.verified_solution,
          keywords: row.keywords || [],
          helpful_count: row.helpful_count,
          unhelpful_count: row.unhelpful_count,
          confidence_score: Number(row.confidence_score),
          similarity,
          hybrid_rank: hybridRank,
        };
      })
      .filter((item) => item.similarity > 0.2)
      .sort((a, b) => b.hybrid_rank - a.hybrid_rank)
      .slice(0, limit);

    return scored;
  } catch (err) {
    console.error("[retrieveLearnedExperiences] Error:", (err as Error)?.message);
    return [];
  }
}

/**
 * PII sanitization helper to strip customer phone numbers, emails, and UUIDs.
 */
function sanitizePii(text: string): string {
  return text
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[REDACTED_EMAIL]")
    .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, "[REDACTED_ID]")
    .replace(/(?:\+\d{1,3}[-.\s]*)?\b(?:\d{5}[-.\s]*\d{5}|\d{10}|\(?\d{3}\)?[-.\s]*\d{3}[-.\s]*\d{4})\b/g, "[REDACTED_PHONE]");
}

/**
 * Learns a generalized knowledge pattern from an administrator-resolved support ticket.
 */
export async function learnFromResolvedTicket(ticketId: string): Promise<boolean> {
  try {
    const admin = await createAdminClient("main");

    // 1. Fetch ticket and check status
    const { data: ticket, error: ticketErr } = await admin
      .from("support_tickets")
      .select("id, status, user_role, category, subject")
      .eq("id", ticketId)
      .maybeSingle();

    if (ticketErr || !ticket) {
      return false;
    }

    if (ticket.status !== "resolved" && ticket.status !== "closed") {
      return false;
    }

    // 2. Prevent duplicate learning from the same ticket
    const { data: existing } = await admin
      .from("ai_learned_knowledge")
      .select("id")
      .eq("source_ticket_id", ticketId)
      .limit(1);

    if (existing && existing.length > 0) {
      return true; // Already distilled
    }

    // 3. Fetch public messages
    const { data: messages, error: msgErr } = await admin
      .from("support_messages")
      .select("sender_role, message")
      .eq("ticket_id", ticketId)
      .eq("is_internal", false)
      .order("created_at", { ascending: true });

    if (msgErr || !messages || messages.length < 2) {
      return false; // Insufficient dialogue context
    }

    const conversationTranscript = messages
      .map((m) => `${m.sender_role.toUpperCase()}: ${sanitizePii(m.message)}`)
      .join("\n");

    const client = getEmbeddingClient();
    if (!client) {
      return false;
    }

    // 4. Distill using Gemini with structured prompt
    const prompt = `You are JyotishSetu's Knowledge Distillation Specialist.
Analyze the resolved customer support dialogue below and extract a generalized question pattern and verified solution.

RULES:
1. Strip all personal identifying info (names, phone numbers, emails, order/booking IDs).
2. Generalize the issue so other seekers or astrologers encountering this situation receive clear resolution steps.
3. If the dialogue is incomplete, contradictory, contains unsafe instructions, or is trivial, set "skip": true.
4. Otherwise set "skip": false and provide:
   - "question_pattern": concise query pattern describing the seeker/astrologer's problem
   - "verified_solution": structured, compassionate step-by-step resolution verified by the admin
   - "keywords": 3 to 6 lowercase search keywords

DIALOGUE TRANSCRIPT:
${conversationTranscript}

Return valid JSON with keys: skip, question_pattern, verified_solution, keywords.`;

    const modelResponse = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const rawJson = modelResponse.text ? modelResponse.text.trim() : "";
    if (!rawJson) return false;

    let parsed: {
      skip?: boolean;
      question_pattern?: string;
      verified_solution?: string;
      keywords?: string[];
    };

    try {
      parsed = JSON.parse(rawJson);
    } catch {
      return false;
    }

    if (parsed.skip || !parsed.question_pattern || !parsed.verified_solution) {
      return false;
    }

    const pattern = sanitizePii(parsed.question_pattern);
    const solution = sanitizePii(parsed.verified_solution);
    const keywords = (parsed.keywords || []).map((k) => k.toLowerCase().trim()).filter(Boolean);

    // 5. Generate embedding for distilled pattern
    const embedding = await generateEmbedding(pattern);

    // 6. Insert into ai_learned_knowledge
    const { error: insertErr } = await admin
      .from("ai_learned_knowledge")
      .insert({
        source_ticket_id: ticketId,
        applicable_role: ticket.user_role === "astrologer" ? "astrologer" : "customer",
        category: ticket.category as SupportTicketCategory,
        question_pattern: pattern,
        verified_solution: solution,
        keywords,
        embedding: embedding || null,
        helpful_count: 3, // Initial trust score for admin-resolved tickets
        unhelpful_count: 0,
        is_active: true,
      });

    return !insertErr;
  } catch (err) {
    console.error("[learnFromResolvedTicket] Error:", (err as Error)?.message);
    return false;
  }
}

/**
 * Promotes a high-rated, novel user interaction (+1 rating without prior learned memory)
 * into a candidate learned knowledge record.
 */
export async function promoteHighRatedInteractionToKnowledge(
  interactionId: string
): Promise<void> {
  try {
    const admin = await createAdminClient("main");

    const { data: log, error: logErr } = await admin
      .from("ai_interaction_logs")
      .select("*")
      .eq("id", interactionId)
      .maybeSingle();

    if (logErr || !log || log.feedback_rating !== 1) {
      return;
    }

    // Only promote if this interaction was novel (did not already use learned knowledge)
    if (Array.isArray(log.learned_knowledge_ids) && log.learned_knowledge_ids.length > 0) {
      return;
    }

    const cleanQuery = sanitizePii(log.query);
    const cleanAnswer = sanitizePii(log.ai_response);

    const embedding = await generateEmbedding(cleanQuery);

    const keywords = Array.from(
      new Set(
        cleanQuery
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length > 3)
      )
    ).slice(0, 5);

    const { data: inserted, error: insertErr } = await admin
      .from("ai_learned_knowledge")
      .insert({
        applicable_role: log.user_role === "astrologer" ? "astrologer" : "customer",
        category: (log.classified_category as SupportTicketCategory) || "general",
        question_pattern: cleanQuery,
        verified_solution: cleanAnswer,
        keywords,
        embedding: embedding || null,
        helpful_count: 1,
        unhelpful_count: 0,
        is_active: true,
      })
      .select("id")
      .maybeSingle();

    if (!insertErr && inserted) {
      await admin
        .from("ai_interaction_logs")
        .update({
          learned_knowledge_ids: [inserted.id],
        })
        .eq("id", interactionId);
    }
  } catch (err) {
    console.error("[promoteHighRatedInteractionToKnowledge] Error:", (err as Error)?.message);
  }
}
