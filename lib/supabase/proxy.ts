import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Refreshes Supabase session tokens by synchronizing cookies
 * between the incoming NextRequest and outgoing NextResponse.
 */
export async function updateSession(
  request: NextRequest
): Promise<NextResponse> {
  const supabaseResponse = NextResponse.next({
    request,
  });

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
  // Avoid calling getUser() on static assets or when no auth cookies exist to prevent clearing headers
  // Check for DB1 auth cookie
  const hasMainCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-main-auth-token") || c.name.startsWith("sb-"));

  if (hasMainCookie) {
    try {
      await supabase.auth.getUser();
    } catch {
      // Ignore refresh errors
    }
  }

  // Check for DB2 (admin) auth cookie and refresh admin session if present
  const adminUrl = process.env.ADMIN_SUPABASE_URL;
  const adminKey =
    process.env.ADMIN_SUPABASE_PUBLISHABLE_KEY ||
    process.env.ADMIN_SUPABASE_ANON_KEY;

  const hasAdminCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-admin-auth-token"));

  if (adminUrl && adminKey && hasAdminCookie) {
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

    try {
      await adminSupabase.auth.getUser();
    } catch {
      // Ignore refresh errors
    }
  }

  return supabaseResponse;
}
