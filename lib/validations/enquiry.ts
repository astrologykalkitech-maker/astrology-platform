// =====================================================
// ENQUIRY RUNTIME SCHEMA & SANITIZATION (Phase 2)
// =====================================================

import { isValidUUID } from "@/lib/validations/lead";
import type { LeadPriority, LeadSourceType } from "@/lib/types/database.types";

export interface ValidatedEnquiryInput {
  subject: string;
  message: string;
  astrologer_id: string | null;
  source_type: LeadSourceType;
  source_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  customer_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  priority: LeadPriority;
}

export interface ValidationSuccess<T> {
  valid: true;
  data: T;
  error?: never;
}

export interface ValidationFailure {
  valid: false;
  error: string;
  data?: never;
}

export type EnquiryValidationResult =
  | ValidationSuccess<ValidatedEnquiryInput>
  | ValidationFailure;

const ALLOWED_PRIORITIES: ReadonlySet<LeadPriority> = new Set([
  "low",
  "medium",
  "high",
  "urgent",
]);

const ALLOWED_SOURCE_TYPES: ReadonlySet<LeadSourceType> = new Set([
  "platform",
  "direct",
  "campaign",
  "referral",
  "organic",
]);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{6,15}$/;

/**
 * Validates, normalizes, and bounds all fields in an incoming enquiry payload.
 */
export function validateEnquiryInput(raw: unknown): EnquiryValidationResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      valid: false,
      error: "Request payload must be a JSON object.",
    };
  }

  const obj = raw as Record<string, unknown>;

  // 1. Validate Subject
  if (typeof obj.subject !== "string" || !obj.subject.trim()) {
    return {
      valid: false,
      error: "Subject is required and cannot be empty.",
    };
  }
  const cleanSubject = obj.subject.trim();
  if (cleanSubject.length > 200) {
    return {
      valid: false,
      error: "Subject must be at most 200 characters.",
    };
  }

  // 2. Validate Message
  if (typeof obj.message !== "string" || !obj.message.trim()) {
    return {
      valid: false,
      error: "Message is required and cannot be empty.",
    };
  }
  const cleanMessage = obj.message.trim();
  if (cleanMessage.length > 5000) {
    return {
      valid: false,
      error: "Message must be at most 5000 characters.",
    };
  }

  // 3. Validate Astrologer ID (nullable, must be valid UUID if present)
  let cleanAstrologerId: string | null = null;
  if (obj.astrologer_id !== undefined && obj.astrologer_id !== null && obj.astrologer_id !== "") {
    if (typeof obj.astrologer_id !== "string" || !isValidUUID(obj.astrologer_id)) {
      return {
        valid: false,
        error: "Invalid astrologer_id. Must be a valid UUID or omitted for platform inquiries.",
      };
    }
    cleanAstrologerId = obj.astrologer_id.trim().toLowerCase();
  }

  // 4. Validate Priority
  let cleanPriority: LeadPriority = "medium";
  if (obj.priority !== undefined && obj.priority !== null) {
    if (typeof obj.priority !== "string" || !ALLOWED_PRIORITIES.has(obj.priority.toLowerCase() as LeadPriority)) {
      return {
        valid: false,
        error: "Priority must be one of: 'low', 'medium', 'high', 'urgent'.",
      };
    }
    cleanPriority = obj.priority.toLowerCase() as LeadPriority;
  }

  // 5. Validate Source Type
  let cleanSourceType: LeadSourceType = cleanAstrologerId ? "direct" : "platform";
  if (obj.source_type !== undefined && obj.source_type !== null) {
    if (typeof obj.source_type === "string" && ALLOWED_SOURCE_TYPES.has(obj.source_type.toLowerCase() as LeadSourceType)) {
      cleanSourceType = obj.source_type.toLowerCase() as LeadSourceType;
    }
  }

  // 6. Validate Source URL
  let cleanSourceUrl: string | null = null;
  if (typeof obj.source_url === "string" && obj.source_url.trim()) {
    const trimmedUrl = obj.source_url.trim();
    if (trimmedUrl.length > 500) {
      return {
        valid: false,
        error: "source_url must not exceed 500 characters.",
      };
    }
    cleanSourceUrl = trimmedUrl;
  }

  // 7. Validate UTM fields (bounded to 100 chars, alphanumeric + safe chars)
  const sanitizeUtm = (val: unknown, name: string): { value: string | null; error?: string } => {
    if (val === undefined || val === null || val === "") return { value: null };
    if (typeof val !== "string") return { value: null, error: `${name} must be a string.` };
    const trimmed = val.trim();
    if (trimmed.length > 100) return { value: null, error: `${name} must not exceed 100 characters.` };
    return { value: trimmed };
  };

  const utmSourceRes = sanitizeUtm(obj.utm_source, "utm_source");
  if (utmSourceRes.error) return { valid: false, error: utmSourceRes.error };

  const utmMediumRes = sanitizeUtm(obj.utm_medium, "utm_medium");
  if (utmMediumRes.error) return { valid: false, error: utmMediumRes.error };

  const utmCampaignRes = sanitizeUtm(obj.utm_campaign, "utm_campaign");
  if (utmCampaignRes.error) return { valid: false, error: utmCampaignRes.error };

  // 8. Validate customer_name
  let cleanCustomerName: string | null = null;
  if (typeof obj.customer_name === "string" && obj.customer_name.trim()) {
    cleanCustomerName = obj.customer_name.trim().slice(0, 150);
  }

  // 9. Validate contact_email
  let cleanContactEmail: string | null = null;
  if (typeof obj.contact_email === "string" && obj.contact_email.trim()) {
    const trimmedEmail = obj.contact_email.trim();
    if (!EMAIL_REGEX.test(trimmedEmail) || trimmedEmail.length > 255) {
      return {
        valid: false,
        error: "contact_email must be a valid email address.",
      };
    }
    cleanContactEmail = trimmedEmail.toLowerCase();
  }

  // 10. Validate contact_phone
  let cleanContactPhone: string | null = null;
  if (typeof obj.contact_phone === "string" && obj.contact_phone.trim()) {
    const trimmedPhone = obj.contact_phone.trim();
    if (!PHONE_REGEX.test(trimmedPhone) || trimmedPhone.length > 25) {
      return {
        valid: false,
        error: "contact_phone contains an invalid phone number format.",
      };
    }
    cleanContactPhone = trimmedPhone;
  }

  return {
    valid: true,
    data: {
      subject: cleanSubject,
      message: cleanMessage,
      astrologer_id: cleanAstrologerId,
      source_type: cleanSourceType,
      source_url: cleanSourceUrl,
      utm_source: utmSourceRes.value,
      utm_medium: utmMediumRes.value,
      utm_campaign: utmCampaignRes.value,
      customer_name: cleanCustomerName,
      contact_email: cleanContactEmail,
      contact_phone: cleanContactPhone,
      priority: cleanPriority,
    },
  };
}
