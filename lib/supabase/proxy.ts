import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

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

  let user = null;

  if (supabaseUrl && supabaseKey) {
    const supabase = createServerClient(
      supabaseUrl,
      supabaseKey,
      {
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

    // Calling getUser() refreshes the access token if expired and sets new cookies
    const hasMainCookie = request.cookies
      .getAll()
      .some((c) => c.name.startsWith("sb-main-auth-token") || (c.name.startsWith("sb-") && !c.name.includes("admin")));

    if (hasMainCookie) {
      try {
        const { data } = await supabase.auth.getUser();
        user = data.user;
      } catch {
        // Ignore refresh errors
      }
    }
  }

  // Check for DB2 (admin) auth cookie and refresh admin session if present
  const adminUrl = process.env.ADMIN_SUPABASE_URL;
  const adminKey =
    process.env.ADMIN_SUPABASE_PUBLISHABLE_KEY ||
    process.env.ADMIN_SUPABASE_ANON_KEY;

  const hasAdminCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-admin-auth-token") || (c.name.startsWith("sb-") && c.name.includes("admin")));

  let adminUser = null;
  if (adminUrl && adminKey && hasAdminCookie) {
    try {
      const adminSupabase = createServerClient(adminUrl, adminKey, {
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
