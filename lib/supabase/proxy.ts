import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { decodeJwt } from "jose";

const PROXY_TIMEOUT_MS = 4000;

function fetchWithProxyTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  if (init?.signal) {
    init.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  return fetch(input, {
    ...init,
    signal: controller.signal,
  }).finally(() => {
    clearTimeout(timeoutId);
  });
}

/**
 * Extracts and decodes JWT session claims directly from Supabase chunked cookies.
 * Allows microsecond-level local session verification, eliminating blocking 400ms+
 * external network calls during internal route transitions and RSC prefetching.
 */
function extractJwtSession(
  cookies: { name: string; value: string }[],
  prefix: string
): { userId: string; exp: number; role?: string } | null {
  try {
    const parts = cookies
      .filter((c) => c.name === prefix || c.name.startsWith(`${prefix}.`))
      .sort((a, b) => {
        const numA = parseInt(a.name.split(".")[1] || "0", 10);
        const numB = parseInt(b.name.split(".")[1] || "0", 10);
        return numA - numB;
      });

    if (parts.length === 0) return null;

    let combined = parts.map((p) => p.value).join("");
    if (combined.startsWith("base64-")) {
      combined = Buffer.from(combined.slice(7), "base64").toString("utf-8");
    }

    const parsed = JSON.parse(combined);
    const token = Array.isArray(parsed) ? parsed[0] : parsed?.access_token || parsed;

    if (typeof token === "string") {
      const claims = decodeJwt(token);
      if (claims?.sub && typeof claims.exp === "number") {
        return {
          userId: claims.sub,
          exp: claims.exp,
          role: claims.role as string | undefined,
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Refreshes Supabase session tokens by synchronizing cookies
 * between the incoming NextRequest and outgoing NextResponse,
 * and enforces centralized route protection across all route tiers.
 */
export async function updateSession(
  request: NextRequest
): Promise<NextResponse> {
  const supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  let user: { id: string; role?: string } | null = null;
  const nowSec = Math.floor(Date.now() / 1000);
  const allCookies = request.cookies.getAll();

  if (supabaseUrl && supabaseKey) {
    const mainSession = extractJwtSession(allCookies, "sb-main-auth-token");

    // Fast path: if token is present and valid for > 120s, trust token locally without external network lag
    if (mainSession && mainSession.exp - nowSec > 120) {
      user = { id: mainSession.userId, role: mainSession.role };
    } else {
      // Slow/refresh path: token is expiring or missing, query Supabase auth to refresh session cookies
      const hasMainCookie = allCookies.some(
        (c) => c.name.startsWith("sb-main-auth-token") || (c.name.startsWith("sb-") && !c.name.includes("admin"))
      );

      if (hasMainCookie) {
        const supabase = createServerClient(
          supabaseUrl,
          supabaseKey,
          {
            global: {
              fetch: fetchWithProxyTimeout,
            },
            cookieOptions: {
              name: "sb-main-auth-token",
            },
            cookies: {
              getAll() {
                return request.cookies.getAll();
              },
              setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value }) =>
                  request.cookies.set(name, value)
                );
                cookiesToSet.forEach(({ name, value, options }) =>
                  supabaseResponse.cookies.set(name, value, options)
                );
              },
            },
          }
        );

        try {
          const { data } = await supabase.auth.getUser();
          user = data.user;
        } catch {
          // Ignore refresh errors
        }
      }
    }
  }

  // Check for DB2 (admin) auth cookie and refresh admin session if present
  const adminUrl = process.env.ADMIN_SUPABASE_URL;
  const adminKey =
    process.env.ADMIN_SUPABASE_PUBLISHABLE_KEY ||
    process.env.ADMIN_SUPABASE_ANON_KEY;

  let adminUser: { id: string; role?: string } | null = null;
  if (adminUrl && adminKey) {
    const adminSession = extractJwtSession(allCookies, "sb-admin-auth-token");

    if (adminSession && adminSession.exp - nowSec > 120) {
      adminUser = { id: adminSession.userId, role: adminSession.role };
    } else {
      const hasAdminCookie = allCookies.some(
        (c) => c.name.startsWith("sb-admin-auth-token") || (c.name.startsWith("sb-") && c.name.includes("admin"))
      );

      if (hasAdminCookie) {
        try {
          const adminSupabase = createServerClient(adminUrl, adminKey, {
            global: {
              fetch: fetchWithProxyTimeout,
            },
            cookieOptions: {
              name: "sb-admin-auth-token",
            },
            cookies: {
              getAll() {
                return request.cookies.getAll();
              },
              setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value }) =>
                  request.cookies.set(name, value)
                );
                cookiesToSet.forEach(({ name, value, options }) =>
                  supabaseResponse.cookies.set(name, value, options)
                );
              },
            },
          });

          const { data } = await adminSupabase.auth.getUser();
          adminUser = data.user;
        } catch {
          // Ignore refresh errors
        }
      }
    }
  }

  // Centralized Route Protection Strategy
  const pathname = request.nextUrl.pathname;

  // 1. Customer Protected Routes
  const isCustomerAuthPage =
    pathname === "/customer/login" ||
    pathname === "/customer/signup" ||
    pathname === "/customer/forgot-password";

  if (pathname.startsWith("/customer") && !isCustomerAuthPage) {
    if (!user) {
      const redirectUrl = new URL("/customer/login", request.url);
      const returnPath = pathname + request.nextUrl.search;
      redirectUrl.searchParams.set("redirectTo", returnPath);
      return NextResponse.redirect(redirectUrl);
    }
  }

  // 2. Astrologer Protected Routes
  const isAstrologerAuthPage =
    pathname === "/astrologer/login" ||
    pathname === "/astrologer/signup" ||
    pathname === "/astrologer/forgot-password";

  if (pathname.startsWith("/astrologer") && !isAstrologerAuthPage) {
    if (!user) {
      const redirectUrl = new URL("/astrologer/login", request.url);
      const returnPath = pathname + request.nextUrl.search;
      redirectUrl.searchParams.set("redirectTo", returnPath);
      return NextResponse.redirect(redirectUrl);
    }
  }

  // 3. Super Admin & Admin Protected Routes
  if (pathname.startsWith("/super-admin") || pathname.startsWith("/admin")) {
    if (!user && !adminUser) {
      const redirectUrl = new URL("/customer/login", request.url);
      redirectUrl.searchParams.set("reason", "admin_required");
      const returnPath = pathname + request.nextUrl.search;
      redirectUrl.searchParams.set("redirectTo", returnPath);
      return NextResponse.redirect(redirectUrl);
    }
  }

  return supabaseResponse;
}
