import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/";

  if (code) {
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
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";
      
      let redirectUrl = requestUrl.origin + next;
      if (!isLocalEnv && forwardedHost) {
        redirectUrl = `https://${forwardedHost}${next}`;
      }
      
      const response = NextResponse.redirect(redirectUrl);
      // Synchronize cookies to response
      request.cookies.getAll().forEach((c) => {
        response.cookies.set(c.name, c.value);
      });
      return response;
    }
  }

  // Return the user to an error page or login with an instruction
  return NextResponse.redirect(`${requestUrl.origin}/astrologer/login?error=Invalid+or+expired+reset+code`);
}
