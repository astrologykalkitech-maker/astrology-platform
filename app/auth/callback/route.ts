import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Validates that a redirect path is safe to use as a post-auth destination.
 * Only allows relative paths under the same origin.
 * - Rejects absolute URLs (http://, https://, //)
 * - Rejects paths starting with /auth/callback (infinite loops)
 * - Accepts relative paths beginning with /
 */
function validateRedirectPath(next: string, fallback: string = "/"): string {
  if (!next || typeof next !== "string") {
    return fallback;
  }

  const trimmed = next.trim();

  // Reject absolute URLs (open redirect prevention)
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("//")
  ) {
    return fallback;
  }

  // Must start with a forward slash (relative path only)
  if (!trimmed.startsWith("/")) {
    return fallback;
  }

  // Reject potential infinite callback loops
  if (trimmed.startsWith("/auth/callback")) {
    return fallback;
  }

  return trimmed;
}

/**
 * Derives the canonical application origin from environment configuration.
 * Never trusts Host or X-Forwarded-Host headers.
 */
function getCanonicalOrigin(requestUrl: URL): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) {
    try {
      const parsed = new URL(siteUrl);
      return parsed.origin;
    } catch {
      // Fall through to request URL
    }
  }

  if (process.env.NODE_ENV === "development") {
    return requestUrl.origin;
  }

  return requestUrl.origin;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const rawNext = requestUrl.searchParams.get("next");
  const oauthRole = requestUrl.searchParams.get("role"); // Hint from signin button (customer or astrologer)

  const canonicalOrigin = getCanonicalOrigin(requestUrl);

  if (code) {
    // Temporary redirect response; destination may be updated after role inspection
    const response = NextResponse.redirect(new URL("/", canonicalOrigin));

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
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options ?? {});
            });
          },
        },
      }
    );

    const { data: authData, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && authData?.user) {
      const user = authData.user;

      // 1. Check if user already has an authoritative role in public.profiles
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, role, full_name")
        .eq("id", user.id)
        .maybeSingle();

      let userRole = profile?.role;

      // 2. If it's a first-time OAuth signup where role wasn't set or trigger defaulted to customer,
      // but the user explicitly signed up through the astrologer portal:
      if (oauthRole === "astrologer" && (!profile || profile.role === "customer")) {
        // If profile was just created or doesn't exist, we can update role to 'astrologer'
        // Check if user has an existing customer history (e.g. leads/bookings) to avoid accidental role override
        const { count: bookingCount } = await supabase
          .from("customer_bookings")
          .select("id", { count: "exact", head: true })
          .eq("customer_id", user.id);

        if (!bookingCount || bookingCount === 0) {
          await supabase
            .from("profiles")
            .update({ role: "astrologer" })
            .eq("id", user.id);
          userRole = "astrologer";
        }
      }

      // If full_name is missing in profile but present in OAuth user metadata, backfill it
      const metaName = user.user_metadata?.full_name || user.user_metadata?.name;
      if (metaName && profile && (!profile.full_name || profile.full_name === "User")) {
        await supabase
          .from("profiles")
          .update({ full_name: metaName })
          .eq("id", user.id);
      }

      // 3. Determine authoritative destination based strictly on database role
      let destination = "/customer/astrologers";

      if (userRole === "super_admin" || userRole === "admin") {
        destination = "/super-admin";
      } else if (userRole === "consultant_admin") {
        destination = "/admin";
      } else if (userRole === "astrologer") {
        // Check astrologer approval status to route appropriately
        const { data: astroProfile } = await supabase
          .from("astrologer_profiles")
          .select("approval_status")
          .eq("id", user.id)
          .maybeSingle();

        if (astroProfile?.approval_status === "suspended") {
          destination = "/astrologer/login?reason=suspended";
        } else if (astroProfile?.approval_status === "rejected") {
          destination = "/astrologer/login?reason=rejected";
        } else {
          destination = "/astrologer/dashboard";
        }
      } else {
        // Default customer role
        destination = rawNext ? validateRedirectPath(rawNext, "/customer") : "/customer";
      }

      // Update response destination
      const finalUrl = new URL(destination, canonicalOrigin);
      response.headers.set("Location", finalUrl.toString());
      return response;
    }

    console.error("[Auth Callback] exchangeCodeForSession failed:", {
      code: (error as { code?: string })?.code ?? "unknown",
      message: error?.message,
    });
  }

  // Missing code or exchange failure
  const fallbackLogin = oauthRole === "astrologer" ? "/astrologer/login" : "/customer/login";
  const errorRedirect = `${canonicalOrigin}${fallbackLogin}?error=auth_callback_failed`;
  return NextResponse.redirect(errorRedirect);
}
