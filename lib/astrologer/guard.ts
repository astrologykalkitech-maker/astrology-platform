import { cache } from "react";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { getMyAstrologerProfile } from "@/app/actions/astrologer-profile";
import type {
  AstrologerProfile,
  Profile,
} from "@/lib/types/database.types";

export const ASTROLOGER_LOGIN_PATH = "/astrologer/login";

/**
 * Server-side page guard. Call it at the top of every astrologer page and layout.
 * - Not logged in            -> /astrologer/login
 * - Logged in, not astrologer -> /astrologer/login?reason=role
 * Role comes from public.profiles (via getCurrentProfile), never from client data.
 * Wrapped in cache() so a layout and a page in the same request share one lookup.
 */
export const requireAstrologerPage = cache(async (): Promise<Profile> => {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect(ASTROLOGER_LOGIN_PATH);
  }

  if (profile.role !== "astrologer") {
    redirect(`${ASTROLOGER_LOGIN_PATH}?reason=role`);
  }

  return profile;
});

/**
 * The signed-in astrologer's own astrologer_profiles row (or null if not created yet).
 * Uses the existing getMyAstrologerProfile Server Action.
 */
export const getOwnAstrologerProfile = cache(
  async (): Promise<{ profile: AstrologerProfile | null; error: string | null }> => {
    const result = await getMyAstrologerProfile();

    if (!result.success) {
      return { profile: null, error: result.error };
    }

    return { profile: result.data, error: null };
  }
);
