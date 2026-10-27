/**
 * @deprecated This module now delegates to the Google Gemini AI service.
 * All exports are preserved for backwards compatibility.
 * Import directly from "@/lib/ai/gemini-service" for new code.
 */
export {
  askGeminiSupport as askGrokSupport,
  generateAiTicketSummary,
  type GeminiSupportResponse as GrokSupportResponse,
  type GeminiChatMessage as GrokChatMessage,
} from "./gemini-service";
