// =====================================================
// ASTROLOGER PROFILE TYPES
// =====================================================

import type { AstrologerProfile } from "@/lib/types/database.types";
import type { AuthResult } from "@/lib/types/auth.types";

/**
 * Input for creating a new astrologer profile.
 * Protected fields (id, user_id, approval_status, timestamps) are strictly forbidden.
 */
export interface CreateAstrologerProfileInput {
  display_name: string;
  bio?: string | null;
  experience_years?: number | null;
  specializations?: string[];
  languages?: string[];
  city?: string | null;
  state?: string | null;
  address?: string | null;
  consultation_fee?: number | null;
  voice_price_per_minute?: number | null;
  chat_price_per_minute?: number | null;
  video_price_per_minute?: number | null;
  voice_enabled?: boolean;
  chat_enabled?: boolean;
  video_enabled?: boolean;
  profile_photo_url?: string | null;
  slug?: string | null;
}

/**
 * Input for updating an existing astrologer profile.
 * All fields are optional. Protected fields cannot be passed.
 */
export interface UpdateAstrologerProfileInput {
  display_name?: string;
  bio?: string | null;
  experience_years?: number | null;
  specializations?: string[];
  languages?: string[];
  city?: string | null;
  state?: string | null;
  address?: string | null;
  consultation_fee?: number | null;
  voice_price_per_minute?: number | null;
  chat_price_per_minute?: number | null;
  video_price_per_minute?: number | null;
  voice_enabled?: boolean;
  chat_enabled?: boolean;
  video_enabled?: boolean;
  profile_photo_url?: string | null;
  slug?: string | null;
}

/**
 * Public-facing view of an approved astrologer.
 * Omits private fields (address, user_id, internal timestamps).
 */
export interface PublicAstrologerProfile {
  id: string;
  slug: string | null;
  display_name: string;
  bio: string | null;
  experience_years: number | null;
  specializations: string[];
  languages: string[];
  city: string | null;
  state: string | null;
  consultation_fee: number | null;
  voice_price_per_minute?: number | null;
  chat_price_per_minute?: number | null;
  video_price_per_minute?: number | null;
  voice_enabled?: boolean;
  chat_enabled?: boolean;
  video_enabled?: boolean;
  profile_photo_url: string | null;
  approval_status: "approved";
  is_featured?: boolean;
  featured_until?: string | null;
  ranking_priority?: number;
}

export type AstrologerProfileResult = AuthResult<AstrologerProfile>;
export type OptionalAstrologerProfileResult = AuthResult<AstrologerProfile | null>;

export interface PublicAstrologersQueryOptions {
  specialization?: string;
  language?: string;
  city?: string;
  limit?: number;
  offset?: number;
}
