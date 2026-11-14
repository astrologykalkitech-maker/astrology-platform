// =====================================================
// ASTROLOGER PROFILE RUNTIME VALIDATION
// =====================================================

import type {
  CreateAstrologerProfileInput,
  UpdateAstrologerProfileInput,
} from "@/lib/types/astrologer.types";
import type { ValidationResult } from "@/lib/validations/auth";

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const ALLOWED_FIELDS = new Set([
  "display_name",
  "bio",
  "experience_years",
  "specializations",
  "languages",
  "city",
  "state",
  "address",
  "upi_vpa",
  "consultation_fee",
  "voice_price_per_minute",
  "chat_price_per_minute",
  "video_price_per_minute",
  "voice_enabled",
  "chat_enabled",
  "video_enabled",
  "profile_photo_url",
  "slug",
]);

const PROTECTED_FIELDS = new Set([
  "id",
  "user_id",
  "approval_status",
  "created_at",
  "updated_at",
]);

/**
 * Generates a clean URL slug from a display name string.
 * e.g., "Pt. Ramesh Sharma, M.A." -> "pt-ramesh-sharma-ma"
 */
export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9\s-]/g, "") // remove invalid characters
    .replace(/\s+/g, "-") // replace whitespace with hyphens
    .replace(/-+/g, "-") // collapse repeated hyphens
    .replace(/^-+|-+$/g, ""); // strip leading/trailing hyphens
}

/**
 * Checks for unknown or protected fields in the payload.
 */
function checkForForbiddenKeys(raw: Record<string, unknown>): string | null {
  for (const key of Object.keys(raw)) {
    if (PROTECTED_FIELDS.has(key)) {
      return `Field '${key}' is protected and cannot be modified.`;
    }
    if (!ALLOWED_FIELDS.has(key)) {
      return `Unknown field '${key}' is not permitted.`;
    }
  }
  return null;
}

/**
 * Runtime validation for creating a new astrologer profile.
 */
export function validateCreateAstrologerProfileInput(
  raw: unknown
): ValidationResult<CreateAstrologerProfileInput> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { valid: false, error: "Invalid payload: must be an object." };
  }

  const rawObj = raw as Record<string, unknown>;

  // 1. Reject unknown or protected fields
  const forbiddenError = checkForForbiddenKeys(rawObj);
  if (forbiddenError) {
    return { valid: false, error: forbiddenError };
  }

  // 2. Validate display_name (required)
  if (
    typeof rawObj.display_name !== "string" ||
    rawObj.display_name.trim().length < 2 ||
    rawObj.display_name.trim().length > 100
  ) {
    return {
      valid: false,
      error: "Display name is required and must be between 2 and 100 characters.",
    };
  }

  const displayName = rawObj.display_name.trim();

  // 3. Validate slug (optional, auto-generated if omitted)
  let slug: string | null = null;
  if (rawObj.slug !== undefined && rawObj.slug !== null && rawObj.slug !== "") {
    if (typeof rawObj.slug !== "string") {
      return { valid: false, error: "Slug must be a string." };
    }
    const cleanSlug = rawObj.slug.trim().toLowerCase();
    if (!SLUG_REGEX.test(cleanSlug) || cleanSlug.length < 2 || cleanSlug.length > 100) {
      return {
        valid: false,
        error: "Slug must contain only lowercase letters, numbers, and hyphens (2-100 characters).",
      };
    }
    slug = cleanSlug;
  } else {
    // Generate slug from display name if not explicitly provided
    const autoSlug = generateSlug(displayName);
    slug = autoSlug.length >= 2 ? autoSlug : null;
  }

  // 4. Validate bio (optional)
  let bio: string | null = null;
  if (rawObj.bio !== undefined && rawObj.bio !== null) {
    if (typeof rawObj.bio !== "string") {
      return { valid: false, error: "Bio must be a string." };
    }
    const trimmed = rawObj.bio.trim();
    if (trimmed.length > 2000) {
      return { valid: false, error: "Bio cannot exceed 2000 characters." };
    }
    bio = trimmed.length > 0 ? trimmed : null;
  }

  // 5. Validate experience_years (optional)
  let experienceYears: number | null = null;
  if (rawObj.experience_years !== undefined && rawObj.experience_years !== null && rawObj.experience_years !== "") {
    const num = Number(rawObj.experience_years);
    if (!Number.isInteger(num) || num < 0 || num > 100) {
      return {
        valid: false,
        error: "Experience years must be an integer between 0 and 100.",
      };
    }
    experienceYears = num;
  }

  // 6. Validate consultation_fee (optional)
  let consultationFee: number | null = null;
  if (rawObj.consultation_fee !== undefined && rawObj.consultation_fee !== null && rawObj.consultation_fee !== "") {
    const num = Number(rawObj.consultation_fee);
    if (isNaN(num) || num < 0 || num > 1000000) {
      return {
        valid: false,
        error: "Consultation fee must be a valid number between 0 and 1,000,000.",
      };
    }
    // Round to 2 decimal places
    consultationFee = Math.round(num * 100) / 100;
  }

  // 7. Validate specializations (array of strings)
  const specializations: string[] = [];
  if (rawObj.specializations !== undefined && rawObj.specializations !== null) {
    if (!Array.isArray(rawObj.specializations)) {
      return { valid: false, error: "Specializations must be an array of strings." };
    }
    if (rawObj.specializations.length > 20) {
      return { valid: false, error: "Maximum 20 specializations allowed." };
    }
    for (const item of rawObj.specializations) {
      if (typeof item !== "string" || item.trim().length === 0 || item.trim().length > 50) {
        return {
          valid: false,
          error: "Each specialization must be a non-empty string under 50 characters.",
        };
      }
      specializations.push(item.trim());
    }
  }

  // 8. Validate languages (array of strings)
  const languages: string[] = [];
  if (rawObj.languages !== undefined && rawObj.languages !== null) {
    if (!Array.isArray(rawObj.languages)) {
      return { valid: false, error: "Languages must be an array of strings." };
    }
    if (rawObj.languages.length > 20) {
      return { valid: false, error: "Maximum 20 languages allowed." };
    }
    for (const item of rawObj.languages) {
      if (typeof item !== "string" || item.trim().length === 0 || item.trim().length > 50) {
        return {
          valid: false,
          error: "Each language must be a non-empty string under 50 characters.",
        };
      }
      languages.push(item.trim());
    }
  }

  // 9. Location fields (city, state, address)
  const parseOptionalText = (val: unknown, maxLen: number, fieldName: string): { val: string | null; error?: string } => {
    if (val === undefined || val === null) return { val: null };
    if (typeof val !== "string") return { val: null, error: `${fieldName} must be a string.` };
    const t = val.trim();
    if (t.length > maxLen) return { val: null, error: `${fieldName} cannot exceed ${maxLen} characters.` };
    return { val: t.length > 0 ? t : null };
  };

  const cityRes = parseOptionalText(rawObj.city, 100, "City");
  if (cityRes.error) return { valid: false, error: cityRes.error };

  const stateRes = parseOptionalText(rawObj.state, 100, "State");
  if (stateRes.error) return { valid: false, error: stateRes.error };

  const addressRes = parseOptionalText(rawObj.address, 255, "Address");
  if (addressRes.error) return { valid: false, error: addressRes.error };

  const upiVpaRes = parseUpiVpa(rawObj.upi_vpa);
  if (upiVpaRes.error) return { valid: false, error: upiVpaRes.error };

  // 10. Profile photo URL (optional)
  let profilePhotoUrl: string | null = null;
  if (rawObj.profile_photo_url !== undefined && rawObj.profile_photo_url !== null && rawObj.profile_photo_url !== "") {
    if (typeof rawObj.profile_photo_url !== "string") {
      return { valid: false, error: "Profile photo URL must be a string." };
    }
    const trimmed = rawObj.profile_photo_url.trim();
    if (trimmed.length > 500) {
      return { valid: false, error: "Profile photo URL cannot exceed 500 characters." };
    }
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      return { valid: false, error: "Profile photo URL must start with http:// or https://" };
    }
    profilePhotoUrl = trimmed;
  }

  return {
    valid: true,
    data: {
      display_name: displayName,
      slug,
      bio,
      experience_years: experienceYears,
      consultation_fee: consultationFee,
      specializations,
      languages,
      city: cityRes.val,
      state: stateRes.val,
      address: addressRes.val,
      upi_vpa: upiVpaRes.value,
      profile_photo_url: profilePhotoUrl,
    },
  };
}

/**
 * Runtime validation for updating an existing astrologer profile.
 */
export function validateUpdateAstrologerProfileInput(
  raw: unknown
): ValidationResult<UpdateAstrologerProfileInput> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { valid: false, error: "Invalid payload: must be an object." };
  }

  const rawObj = raw as Record<string, unknown>;

  // 1. Reject unknown or protected fields
  const forbiddenError = checkForForbiddenKeys(rawObj);
  if (forbiddenError) {
    return { valid: false, error: forbiddenError };
  }

  // Ensure at least one field is provided for update
  if (Object.keys(rawObj).length === 0) {
    return { valid: false, error: "At least one field must be provided for update." };
  }

  const result: UpdateAstrologerProfileInput = {};

  // 2. Validate display_name if provided
  if ("display_name" in rawObj) {
    if (
      typeof rawObj.display_name !== "string" ||
      rawObj.display_name.trim().length < 2 ||
      rawObj.display_name.trim().length > 100
    ) {
      return {
        valid: false,
        error: "Display name must be between 2 and 100 characters.",
      };
    }
    result.display_name = rawObj.display_name.trim();
  }

  // 3. Validate slug if provided
  if ("slug" in rawObj) {
    if (rawObj.slug === null || rawObj.slug === "") {
      result.slug = null;
    } else {
      if (typeof rawObj.slug !== "string") {
        return { valid: false, error: "Slug must be a string." };
      }
      const cleanSlug = rawObj.slug.trim().toLowerCase();
      if (!SLUG_REGEX.test(cleanSlug) || cleanSlug.length < 2 || cleanSlug.length > 100) {
        return {
          valid: false,
          error: "Slug must contain only lowercase letters, numbers, and hyphens (2-100 characters).",
        };
      }
      result.slug = cleanSlug;
    }
  }

  // 4. Validate bio if provided
  if ("bio" in rawObj) {
    if (rawObj.bio === null || rawObj.bio === "") {
      result.bio = null;
    } else {
      if (typeof rawObj.bio !== "string") {
        return { valid: false, error: "Bio must be a string." };
      }
      const trimmed = rawObj.bio.trim();
      if (trimmed.length > 2000) {
        return { valid: false, error: "Bio cannot exceed 2000 characters." };
      }
      result.bio = trimmed;
    }
  }

  // 5. Validate experience_years if provided
  if ("experience_years" in rawObj) {
    if (rawObj.experience_years === null || rawObj.experience_years === "") {
      result.experience_years = null;
    } else {
      const num = Number(rawObj.experience_years);
      if (!Number.isInteger(num) || num < 0 || num > 100) {
        return {
          valid: false,
          error: "Experience years must be an integer between 0 and 100.",
        };
      }
      result.experience_years = num;
    }
  }

  // 6. Validate consultation_fee if provided
  if ("consultation_fee" in rawObj) {
    if (rawObj.consultation_fee === null || rawObj.consultation_fee === "") {
      result.consultation_fee = null;
    } else {
      const num = Number(rawObj.consultation_fee);
      if (isNaN(num) || num < 0 || num > 1000000) {
        return {
          valid: false,
          error: "Consultation fee must be a number between 0 and 1,000,000.",
        };
      }
      result.consultation_fee = Math.round(num * 100) / 100;
    }
  }

  // 6b. Validate per-minute consultation rates & toggles
  const parseRate = (field: "voice_price_per_minute" | "chat_price_per_minute" | "video_price_per_minute", name: string) => {
    if (field in rawObj) {
      if (rawObj[field] === null || rawObj[field] === "") {
        result[field] = null;
      } else {
        const num = Number(rawObj[field]);
        if (isNaN(num) || num < 0 || num > 10000) {
          return `${name} price per minute must be between 0 and 10,000.`;
        }
        result[field] = Math.round(num * 100) / 100;
      }
    }
    return null;
  };

  const vErr = parseRate("voice_price_per_minute", "Voice");
  if (vErr) return { valid: false, error: vErr };
  const cErr = parseRate("chat_price_per_minute", "Chat");
  if (cErr) return { valid: false, error: cErr };
  const vidErr = parseRate("video_price_per_minute", "Video");
  if (vidErr) return { valid: false, error: vidErr };

  if ("voice_enabled" in rawObj) result.voice_enabled = Boolean(rawObj.voice_enabled);
  if ("chat_enabled" in rawObj) result.chat_enabled = Boolean(rawObj.chat_enabled);
  if ("video_enabled" in rawObj) result.video_enabled = Boolean(rawObj.video_enabled);

  // 7. Validate specializations if provided
  if ("specializations" in rawObj) {
    if (!Array.isArray(rawObj.specializations)) {
      return { valid: false, error: "Specializations must be an array of strings." };
    }
    if (rawObj.specializations.length > 20) {
      return { valid: false, error: "Maximum 20 specializations allowed." };
    }
    const cleanArr: string[] = [];
    for (const item of rawObj.specializations) {
      if (typeof item !== "string" || item.trim().length === 0 || item.trim().length > 50) {
        return {
          valid: false,
          error: "Each specialization must be a non-empty string under 50 characters.",
        };
      }
      cleanArr.push(item.trim());
    }
    result.specializations = cleanArr;
  }

  // 8. Validate languages if provided
  if ("languages" in rawObj) {
    if (!Array.isArray(rawObj.languages)) {
      return { valid: false, error: "Languages must be an array of strings." };
    }
    if (rawObj.languages.length > 20) {
      return { valid: false, error: "Maximum 20 languages allowed." };
    }
    const cleanArr: string[] = [];
    for (const item of rawObj.languages) {
      if (typeof item !== "string" || item.trim().length === 0 || item.trim().length > 50) {
        return {
          valid: false,
          error: "Each language must be a non-empty string under 50 characters.",
        };
      }
      cleanArr.push(item.trim());
    }
    result.languages = cleanArr;
  }

  // 9. Location fields (city, state, address)
  const parseField = (key: "city" | "state" | "address", maxLen: number) => {
    if (key in rawObj) {
      const val = rawObj[key];
      if (val === null || val === "") {
        result[key] = null;
      } else {
        if (typeof val !== "string") {
          return `${key} must be a string.`;
        }
        const t = val.trim();
        if (t.length > maxLen) {
          return `${key} cannot exceed ${maxLen} characters.`;
        }
        result[key] = t;
      }
    }
    return null;
  };

  const cityErr = parseField("city", 100);
  if (cityErr) return { valid: false, error: cityErr };

  const stateErr = parseField("state", 100);
  if (stateErr) return { valid: false, error: stateErr };

  const addressErr = parseField("address", 255);
  if (addressErr) return { valid: false, error: addressErr };

  if ("upi_vpa" in rawObj) {
    const upiVpaRes = parseUpiVpa(rawObj.upi_vpa);
    if (upiVpaRes.error) return { valid: false, error: upiVpaRes.error };
    result.upi_vpa = upiVpaRes.value;
  }

  // 10. Profile photo URL if provided
  if ("profile_photo_url" in rawObj) {
    if (rawObj.profile_photo_url === null || rawObj.profile_photo_url === "") {
      result.profile_photo_url = null;
    } else {
      if (typeof rawObj.profile_photo_url !== "string") {
        return { valid: false, error: "Profile photo URL must be a string." };
      }
      const trimmed = rawObj.profile_photo_url.trim();
      if (trimmed.length > 500) {
        return { valid: false, error: "Profile photo URL cannot exceed 500 characters." };
      }
      if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
        return { valid: false, error: "Profile photo URL must start with http:// or https://" };
      }
      result.profile_photo_url = trimmed;
    }
  }

  return { valid: true, data: result };
}

function parseUpiVpa(value: unknown): { value: string | null; error?: string } {
  if (value === undefined || value === null || value === "") {
    return { value: null };
  }
  if (
    typeof value !== "string" ||
    value.trim().length > 321 ||
    !/^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}$/.test(value.trim())
  ) {
    return { value: null, error: "Enter a valid astrologer UPI ID (for example, name@bank)." };
  }
  return { value: value.trim() };
}
