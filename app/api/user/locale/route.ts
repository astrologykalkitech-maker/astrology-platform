import { NextRequest, NextResponse } from "next/server";
import { createPublicServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidLocale, SupportedLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

/**
 * Persists and retrieves authenticated user language preferences.
 * For authenticated users: Database = authoritative persisted preference.
 * For anonymous users: Cookies and local storage manage session locale.
 */
export async function GET() {
  try {
    const supabase = await createPublicServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: true, locale: null, authenticated: false });
    }

    const admin = await createAdminClient("main");
    const { data, error } = await admin
      .from("user_language_preferences")
      .select("locale")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const resolvedLocale = data?.locale && isValidLocale(data.locale) ? data.locale : null;
    return NextResponse.json({ success: true, locale: resolvedLocale, authenticated: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { locale } = body;

    if (!locale || !isValidLocale(locale)) {
      return NextResponse.json({ success: false, error: "Invalid locale code" }, { status: 400 });
    }

    const supabase = await createPublicServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const admin = await createAdminClient("main");
      const { error: upsertErr } = await admin
        .from("user_language_preferences")
        .upsert({
          user_id: user.id,
          locale: locale as SupportedLocale,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (upsertErr) {
        return NextResponse.json(
          { success: false, error: "Database error persisting locale preference" },
          { status: 500 }
        );
      }
    }

    const res = NextResponse.json({ success: true, locale, authenticated: Boolean(user) });
    res.cookies.set("karmicascension_locale", locale, {
      path: "/",
      maxAge: 31536000,
      sameSite: "lax",
    });

    return res;
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || "Failed to update locale" }, { status: 500 });
  }
}
