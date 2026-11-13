import { NextRequest, NextResponse } from "next/server";
import { createPublicServerClient } from "@/lib/supabase/server";
import { isValidLocale } from "@/lib/i18n/config";

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
      // Upsert preference if table exists or user metadata
      try {
        await supabase.from("user_language_preferences").upsert({
          user_id: user.id,
          locale,
          updated_at: new Date().toISOString(),
        });
      } catch (e) {
        // Table might be in migration, fallback to user metadata update
        await supabase.auth.updateUser({
          data: { preferred_locale: locale },
        });
      }
    }

    const res = NextResponse.json({ success: true, locale });
    res.cookies.set("jyotishsetu_locale", locale, {
      path: "/",
      maxAge: 31536000,
      sameSite: "lax",
    });
    return res;
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

