"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { DEFAULT_LOCALE, isValidLocale, type SupportedLocale } from "./config";
import { getDictionary } from "./dictionary";
import type { TranslationSchema } from "./locales/en";
import { createClient } from "@/lib/supabase/client";

interface LanguageContextType {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => Promise<void>;
  t: TranslationSchema;
  loading: boolean;
}

const LanguageContext = createContext<LanguageContextType>({
  locale: DEFAULT_LOCALE,
  setLocale: async () => {},
  t: getDictionary(DEFAULT_LOCALE),
  loading: false,
});

const STORAGE_KEY = "karmicascension_locale";

export function LanguageProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
}: {
  children: React.ReactNode;
  initialLocale?: string;
}) {
  const [locale, setLocaleState] = useState<SupportedLocale>(
    isValidLocale(initialLocale) ? initialLocale : DEFAULT_LOCALE
  );
  const [loading, setLoading] = useState(false);
  const hasInitializedServerSync = useRef(false);

  // Synchronize authenticated preference from Database on mount and auth state change
  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    async function syncAuthoritativePreference() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user) {
          // Fetch authenticated user's authoritative preference from database
          const res = await fetch("/api/user/locale");
          const json = await res.json().catch(() => null);

          if (isMounted && json?.success && json.locale && isValidLocale(json.locale)) {
            setLocaleState(json.locale);
            try {
              localStorage.setItem(STORAGE_KEY, json.locale);
              document.cookie = `karmicascension_locale=${json.locale}; path=/; max-age=31536000; SameSite=Lax`;
            } catch {}
            return;
          }
        }

        // For anonymous or unpersisted users: fall back to local storage
        if (isMounted) {
          try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved && isValidLocale(saved)) {
              setLocaleState(saved as SupportedLocale);
            }
          } catch {}
        }
      } catch {
        // Fallback safely to initial locale
      }
    }

    if (!hasInitializedServerSync.current) {
      hasInitializedServerSync.current = true;
      void syncAuthoritativePreference();
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        void syncAuthoritativePreference();
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const setLocale = useCallback(async (newLocale: SupportedLocale) => {
    if (!isValidLocale(newLocale)) return;
    setLocaleState(newLocale);

    try {
      localStorage.setItem(STORAGE_KEY, newLocale);
      document.cookie = `karmicascension_locale=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;

      // Persist to server (authoritative for authenticated user)
      await fetch("/api/user/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: newLocale }),
      });
    } catch {}
  }, []);

  const t = getDictionary(locale);

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t, loading }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
