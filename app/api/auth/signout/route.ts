import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { expireAuthCookies } from "@/lib/auth/session";
import { checkRateLimitAsync, extractClientIp } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Rate limit signout to prevent excessive server-side auth cluster load (30 requests/min per IP)
  const clientIp = extractClientIp(req);
  const rl = await checkRateLimitAsync(`auth:signout:${clientIp}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many sign out attempts. Please wait." },
      { status: 429, headers: { "Retry-After": rl.retryAfterSeconds.toString() } }
    );
  }

  let mainSignOutError: string | null = null;
  let adminSignOutError: string | null = null;

  try {
    // 1. Sign out from main client
    try {
      const supabase = await createClient("main");
      const { error: mainErr } = await supabase.auth.signOut();
      if (mainErr) {
        const msg = mainErr.message || "";
        if (!msg.toLowerCase().includes("session_not_found") && !msg.toLowerCase().includes("user not found")) {
          console.warn("[SignOut Warning] main client signOut error:", msg);
          mainSignOutError = msg;
        }
      }
    } catch (e: unknown) {
      mainSignOutError = e instanceof Error ? e.message : "Failed to sign out from main database.";
    }

    // 2. Sign out from admin client (capturing errors if configured)
    try {
      const adminClient = await createClient("admin");
      const { error: adminErr } = await adminClient.auth.signOut();
      if (adminErr) {
        const msg = adminErr.message || "";
        if (!msg.toLowerCase().includes("session_not_found") && !msg.toLowerCase().includes("user not found")) {
          console.warn("[SignOut Warning] admin client signOut error:", msg);
          adminSignOutError = msg;
        }
      }
    } catch (e: unknown) {
      if (process.env.ADMIN_SUPABASE_URL) {
        adminSignOutError = e instanceof Error ? e.message : "Failed to sign out from admin database.";
      }
    }

    // 3. Determine if any signout operation failed
    const hasError = Boolean(mainSignOutError || adminSignOutError);
    const combinedError = [
      mainSignOutError ? `Main auth: ${mainSignOutError}` : null,
      adminSignOutError ? `Admin auth: ${adminSignOutError}` : null,
    ]
      .filter(Boolean)
      .join("; ");

    const response = NextResponse.json(
      hasError
        ? { success: false, error: combinedError }
        : { success: true },
      { status: hasError ? 500 : 200 }
    );

    // 4. Invalidate all existing auth cookies across request and server cookie stores
    const cookieStore = await cookies().catch(() => null);
    const existingCookies = cookieStore ? cookieStore.getAll() : req.cookies.getAll();
    expireAuthCookies(response.cookies, existingCookies);

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fatal sign out exception.";
    console.error("[SignOut Exception]", message);
    const response = NextResponse.json({ success: false, error: message }, { status: 500 });

    // Invalidate cookies even on unexpected exception to ensure client is not trapped
    try {
      const cookieStore = await cookies().catch(() => null);
      const existingCookies = cookieStore ? cookieStore.getAll() : req.cookies.getAll();
      expireAuthCookies(response.cookies, existingCookies);
    } catch {
      expireAuthCookies(response.cookies, []);
    }

    return response;
  }
}
