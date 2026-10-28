import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createPublicServerClient(target: "main" | "admin" = "main") {
  const isMain = target === "main";
  const url = isMain
    ? process.env.NEXT_PUBLIC_SUPABASE_URL!
    : (process.env.ADMIN_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!);
  const key = isMain
    ? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    : (process.env.ADMIN_SUPABASE_PUBLISHABLE_KEY ||
       process.env.ADMIN_SUPABASE_ANON_KEY ||
       process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {},
    },
  });
}

export async function createClient(target: "main" | "admin" = "main") {
  const cookieStore = await cookies();

  const isMain = target === "main";
  const url = isMain
    ? process.env.NEXT_PUBLIC_SUPABASE_URL!
    : (process.env.ADMIN_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!);
  const key = isMain
    ? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    : (process.env.ADMIN_SUPABASE_PUBLISHABLE_KEY ||
       process.env.ADMIN_SUPABASE_ANON_KEY ||
       process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);

  return createServerClient(url, key, {
    cookieOptions: {
      name: isMain ? "sb-main-auth-token" : "sb-admin-auth-token",
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always write cookies.
        }
      },
    },
  });
}
