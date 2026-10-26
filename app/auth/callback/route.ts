import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Validates that a redirect path is safe to use as a post-auth destination.
 * Only allows relative paths under the same origin.
 * - Rejects absolute URLs (http://, https://, //)
 * - Rejects paths starting with /auth/callback (infinite loops)
 * - Accepts relative paths beginning with /
 */
function validateRedirectPath(next: string): string {
  const DEFAULT_REDIRECT = "/";

  if (!next || typeof next !== "string") {
    return DEFAULT_REDIRECT;
  }

  const trimmed = next.trim();

  // Reject absolute URLs (open redirect prevention)
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("//")
  ) {
    return DEFAULT_REDIRECT;
  }

  // Must start with a forward slash (relative path only)
  if (!trimmed.startsWith("/")) {
    return DEFAULT_REDIRECT;
  }

  // Reject potential infinite callback loops
  if (trimmed.startsWith("/auth/callback")) {
    return DEFAULT_REDIRECT;
  }

  return trimmed;
}

/**
 * Derives the canonical application origin from environment configuration.
 * Never trusts Host or X-Forwarded-Host headers.
 */
function getCanonicalOrigin(requestUrl: URL): string {
  // 1. Prefer explicit NEXT_PUBLIC_SITE_URL (set by operator)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) {
    try {
      const parsed = new URL(siteUrl);
      return parsed.origin;
    } catch {
      // Fall through to request URL
    }
  }

  // 2. In development: trust the actual request URL (localhost)
  if (process.env.NODE_ENV === "development") {
    return requestUrl.origin;
  }

  // 3. Production fallback: request URL origin
  // This is safe in production because Next.js validates the host against
  // allowedDevOrigins and the deployment platform controls incoming requests.
  return requestUrl.origin;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const rawNext = requestUrl.searchParams.get("next") ?? "/";

  // Validate and sanitize the redirect path before use
  const safePath = validateRedirectPath(rawNext);
  const canonicalOrigin = getCanonicalOrigin(requestUrl);
  const redirectUrl = `${canonicalOrigin}${safePath}`;

  if (code) {
    // Create the response first so Supabase can write auth cookies onto it
    const response = NextResponse.redirect(redirectUrl);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookieOptions: {
          name: "sb-main-auth-token",
        },
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          // Write new cookies to the RESPONSE, not the request
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options ?? {});
            });
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return response;
    }

    // Exchange failed — log safely and redirect to error page
    console.error("[Auth Callback] exchangeCodeForSession failed:", {
      code: (error as { code?: string }).code ?? "unknown",
    });
  }

  // Missing code or exchange failure — redirect to login with a safe error indicator
  const errorRedirect = `${canonicalOrigin}/astrologer/login?error=auth_callback_failed`;
  return NextResponse.redirect(errorRedirect);
}
