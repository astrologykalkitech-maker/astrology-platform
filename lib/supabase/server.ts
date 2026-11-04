import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const DEFAULT_SUPABASE_TIMEOUT_MS = 10000;

/**
 * Universal fetch wrapper enforcing a 10s timeout to prevent hanging Server Components.
 */
function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_SUPABASE_TIMEOUT_MS);

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
    global: {
      fetch: fetchWithTimeout,
    },
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
    global: {
      fetch: fetchWithTimeout,
    },
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
            const isDeleting = options?.maxAge === 0;
            // When setting an active session cookie, omit maxAge & expires so the cookie acts as a Session Cookie
            // (cleared automatically by the browser when the user closes the website/browser session).
            const sessionOptions = isDeleting
              ? options
              : {
                  ...options,
                  maxAge: undefined,
                  expires: undefined,
                };
            cookieStore.set(name, value, sessionOptions);
          });
        } catch {
          // Server Components cannot always write cookies.
        }
      },
    },
  });
}
