import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { sanitizeRedirectPath } from "@/lib/security/safe-redirect";

/**
 * Validates that a redirect path is safe to use as a post-auth destination.
 * Only allows relative paths under the same origin.
 * - Rejects absolute URLs (http://, https://, //)
 * - Rejects paths starting with /auth/callback (infinite loops)
 * - Rejects javascript: and data: pseudo-protocols
 * - Accepts relative paths beginning with /
 */
function validateRedirectPath(next: string, fallback: string = "/"): string {
  return sanitizeRedirectPath(next, fallback);
}

/**
 * Derives the canonical application origin from request headers and configuration.
 * Respects reverse proxies (e.g. Cloudflare tunnel) while preventing localhost redirection in remote sessions.
 */
function getCanonicalOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) {
    try {
      const parsed = new URL(siteUrl);
      const isSiteUrlLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
      const isRequestLocal = request.nextUrl.hostname === "localhost" || request.nextUrl.hostname === "127.0.0.1";

      // If incoming request is remote, never redirect to localhost siteUrl
      if (!isSiteUrlLocal || isRequestLocal) {
        return parsed.origin;
      }
    } catch {
      // Fall through to request URL
    }
  }

  return request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const errorParam = requestUrl.searchParams.get("error");
  const errorDesc = requestUrl.searchParams.get("error_description");
  const rawNext = requestUrl.searchParams.get("next");
  const oauthRole = requestUrl.searchParams.get("role"); // Hint from signin button (customer or astrologer)
  const oauthMode = requestUrl.searchParams.get("mode"); // Hint from signin button (login or signup)

  const canonicalOrigin = getCanonicalOrigin(request);
  const fallbackLogin = oauthRole === "astrologer" ? "/astrologer/login" : "/customer/login";

  // 1. Handle OAuth provider errors or user cancellation
  if (errorParam) {
    console.warn("[Auth Callback] OAuth provider error:", {
      error: errorParam,
      description: errorDesc,
    });
    const reasonCode = errorParam === "access_denied" ? "oauth_cancelled" : "auth_callback_failed";
    return NextResponse.redirect(new URL(`${fallbackLogin}?error=${reasonCode}`, canonicalOrigin));
  }

  if (!code) {
    return NextResponse.redirect(new URL(`${fallbackLogin}?error=auth_callback_failed`, canonicalOrigin));
  }

  // Temporary redirect response; destination may be updated after role inspection
  const response = NextResponse.redirect(new URL("/", canonicalOrigin));
  const cookiesToSetList: { name: string; value: string; options?: Record<string, unknown> }[] = [];

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
            cookiesToSetList.push({ name, value, options });
            const isDeleting = options?.maxAge === 0;
            const sessionOptions = isDeleting
              ? options
              : {
                  ...(options ?? {}),
                  maxAge: undefined,
                  expires: undefined,
                };
            response.cookies.set(name, value, {
              path: "/",
              sameSite: "lax",
              ...sessionOptions,
            });
          });
        },
      },
    }
  );

  const { data: authData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError || !authData?.user) {
    console.error("[Auth Callback] exchangeCodeForSession failed:", {
      code: (exchangeError as { code?: string })?.code ?? "unknown",
      message: exchangeError?.message,
    });
    return NextResponse.redirect(new URL(`${fallbackLogin}?error=session_exchange_failed`, canonicalOrigin));
  }

  const user = authData.user;

  // Resolve trusted server database client (createAdminClient bypasses client-side RLS and column restrictions)
  let dbClient = supabase;
  let isPrivileged = false;
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    dbClient = await createAdminClient("main");
    isPrivileged = true;
  } catch (adminErr) {
    console.warn("[Auth Callback] Privileged admin client unavailable; using SSR client:", adminErr);
  }

  // 2. Authoritative lookup in public.profiles
  const { data: profile, error: profileError } = await dbClient
    .from("profiles")
    .select("id, role, full_name, created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("[Auth Callback] Failed to query user profile:", profileError);
    return NextResponse.redirect(new URL(`${fallbackLogin}?error=database_error`, canonicalOrigin));
  }

  const metaName = (
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "User"
  ).trim();

  let userRole = profile?.role;

  // 3. Profile provisioning and role resolution
  if (!profile) {
    // Brand new user whose profile row was not created yet by trigger
    const initialRole = oauthRole === "astrologer" ? "astrologer" : "customer";
    if (oauthMode === "signup") {
      console.info("[Auth Callback] New registration via OAuth mode=signup for role:", initialRole);
    }
    if (isPrivileged) {
      const { data: newProfile, error: insertErr } = await dbClient
        .from("profiles")
        .insert({
          id: user.id,
          full_name: metaName,
          role: initialRole,
        })
        .select("id, role, full_name")
        .maybeSingle();

      if (!insertErr && newProfile) {
        userRole = newProfile.role;
      } else {
        userRole = initialRole;
      }
    } else {
      userRole = initialRole;
    }
  } else if (oauthRole === "astrologer" && profile.role === "customer") {
    // User signed in through Astrologer portal, but profile role defaulted to 'customer'
    // Guard against accidental customer promotion if they have actual customer history
    const [bookingsCheck, leadsCheck] = await Promise.all([
      dbClient.from("customer_bookings").select("id", { count: "exact", head: true }).eq("customer_id", user.id),
      dbClient.from("leads").select("id", { count: "exact", head: true }).eq("customer_id", user.id),
    ]);

    const hasCustomerHistory =
      (bookingsCheck.count !== null && bookingsCheck.count > 0) ||
      (leadsCheck.count !== null && leadsCheck.count > 0);

    if (hasCustomerHistory) {
      // Existing customer with history: do NOT silently convert to astrologer
      userRole = "customer";
    } else {
      // New registration or stranded account with 0 customer history:
      // Promote safely to astrologer using privileged client
      if (isPrivileged) {
        const { error: updateErr } = await dbClient
          .from("profiles")
          .update({ role: "astrologer" })
          .eq("id", user.id);

        if (!updateErr) {
          userRole = "astrologer";
        } else {
          console.error("[Auth Callback] Failed to update profile role to astrologer:", updateErr);
        }
      }
    }
  }

  // Backfill full_name from OAuth user metadata if missing or placeholder
  if (metaName && metaName !== "User" && profile && (!profile.full_name || profile.full_name === "User")) {
    await dbClient.from("profiles").update({ full_name: metaName }).eq("id", user.id);
  }

  // 4. Determine authoritative destination based strictly on database role
  let destination = "/customer/astrologers";

  if (userRole === "super_admin" || userRole === "admin") {
    destination = "/super-admin";
  } else if (userRole === "consultant_admin") {
    destination = "/admin";
  } else if (userRole === "astrologer") {
    // Check astrologer approval status using user_id foreign key (NOT id)
    const { data: astroProfile, error: astroErr } = await dbClient
      .from("astrologer_profiles")
      .select("approval_status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (astroErr) {
      console.error("[Auth Callback] Astrologer profile check error:", astroErr);
    }

    if (astroProfile?.approval_status === "suspended") {
      destination = "/astrologer/login?reason=suspended";
    } else if (astroProfile?.approval_status === "rejected") {
      destination = "/astrologer/login?reason=rejected";
    } else {
      destination = "/astrologer/dashboard";
    }
  } else {
    // Customer role
    if (oauthRole === "astrologer") {
      destination = "/astrologer/login?reason=customer_account";
    } else {
      destination = rawNext ? validateRedirectPath(rawNext, "/customer/astrologers") : "/customer/astrologers";
    }
  }

  // Update response destination with 303 See Other and all session cookies attached with root path
  const finalUrl = new URL(destination, canonicalOrigin);
  const redirectResponse = NextResponse.redirect(finalUrl, 303);

  // Transfer captured session cookies with explicit path: "/" to prevent scoping to /auth/callback
  if (cookiesToSetList.length > 0) {
    cookiesToSetList.forEach(({ name, value, options }) => {
      const isDeleting = options?.maxAge === 0;
      const sessionOptions = isDeleting
        ? options
        : {
            ...(options ?? {}),
            maxAge: undefined,
            expires: undefined,
          };
      redirectResponse.cookies.set(name, value, {
        sameSite: "lax",
        ...sessionOptions,
        path: "/",
      });
    });
  }

  // Fallback sync for any additional cookies set on the temporary response
  response.cookies.getAll().forEach((c) => {
    if (!cookiesToSetList.some((item) => item.name === c.name)) {
      redirectResponse.cookies.set(c.name, c.value, {
        path: "/",
        sameSite: "lax",
      });
    }
  });

  return redirectResponse;
}
