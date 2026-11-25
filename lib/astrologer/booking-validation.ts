import { toUtcIsoString } from "@/lib/astrologer/format";

export const MANUAL_BOOKING_MIN_LEAD_TIME_MS = 5 * 60 * 1000;
export const MANUAL_BOOKING_MAX_SERVICE_LENGTH = 120;
export const MANUAL_BOOKING_MAX_NOTES_LENGTH = 2000;
export const ALLOWED_CONSULTATION_MODES = ["Video", "Call", "Chat"] as const;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ManualBookingFormValues {
  customer_id: string;
  service_type: string;
  consultation_mode: string;
  scheduled_at: string;
  duration_minutes: number;
  notes: string;
}

export type ManualBookingFieldErrors = Partial<
  Record<keyof ManualBookingFormValues, string>
>;

/**
 * Validates a single manual booking field immediately for instant UX feedback.
 */
export function validateManualBookingField(
  name: keyof ManualBookingFormValues,
  value: string | number,
  nowMs: number = Date.now()
): string | undefined {
  switch (name) {
    case "customer_id": {
      const trimmed = String(value || "").trim();
      if (!trimmed) return "Customer ID is required.";
      if (!UUID_REGEX.test(trimmed)) {
        return "Customer ID must be a valid UUID (e.g. 00000000-0000-0000-0000-000000000000).";
      }
      return undefined;
    }
    case "service_type": {
      const trimmed = String(value || "").trim();
      if (!trimmed) return "Consultation topic / service is required.";
      if (trimmed.length > MANUAL_BOOKING_MAX_SERVICE_LENGTH) {
        return `Service topic must not exceed ${MANUAL_BOOKING_MAX_SERVICE_LENGTH} characters.`;
      }
      return undefined;
    }
    case "consultation_mode": {
      const mode = String(value || "");
      if (!ALLOWED_CONSULTATION_MODES.includes(mode as (typeof ALLOWED_CONSULTATION_MODES)[number])) {
        return "Consultation mode must be Video, Call, or Chat.";
      }
      return undefined;
    }
    case "scheduled_at": {
      const raw = String(value || "").trim();
      if (!raw) return "Please select a scheduled date and time.";
      const utcIso = toUtcIsoString(raw);
      if (!utcIso) return "Please enter a valid scheduled date and time.";
      const scheduledMs = new Date(utcIso).getTime();
      if (Number.isNaN(scheduledMs)) return "Please enter a valid scheduled date and time.";
      if (scheduledMs <= nowMs + MANUAL_BOOKING_MIN_LEAD_TIME_MS) {
        return "Booking slot must be scheduled at least 5 minutes in advance.";
      }
      return undefined;
    }
    case "duration_minutes": {
      const num = Number(value);
      if (!Number.isInteger(num) || num < 10 || num > 180) {
        return "Duration must be a whole number between 10 and 180 minutes.";
      }
      return undefined;
    }
    case "notes": {
      const trimmed = String(value || "").trim();
      if (trimmed.length > MANUAL_BOOKING_MAX_NOTES_LENGTH) {
        return `Notes must not exceed ${MANUAL_BOOKING_MAX_NOTES_LENGTH} characters.`;
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Validates the entire manual booking form before submission.
 */
export function validateManualBookingForm(
  values: ManualBookingFormValues,
  nowMs: number = Date.now()
): { valid: boolean; errors: ManualBookingFieldErrors; firstError: string | null } {
  const fields: (keyof ManualBookingFormValues)[] = [
    "customer_id",
    "service_type",
    "consultation_mode",
    "scheduled_at",
    "duration_minutes",
    "notes",
  ];
  const errors: ManualBookingFieldErrors = {};
  let firstError: string | null = null;

  for (const field of fields) {
    const err = validateManualBookingField(field, values[field], nowMs);
    if (err) {
      errors[field] = err;
      if (!firstError) firstError = err;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    firstError,
  };
}
