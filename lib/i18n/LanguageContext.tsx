"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { DEFAULT_LOCALE, isValidLocale, type SupportedLocale } from "./config";
import { getDictionary } from "./dictionary";
import type { TranslationSchema } from "./locales/en";

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

const STORAGE_KEY = "jyotishsetu_locale";

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

  useEffect(() => {
    // Check localStorage on mount
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && isValidLocale(saved) && saved !== locale) {
        setLocaleState(saved);
      }
    } catch (e) {}
  }, []);

  const setLocale = async (newLocale: SupportedLocale) => {
    if (!isValidLocale(newLocale)) return;
    setLocaleState(newLocale);
    try {
      localStorage.setItem(STORAGE_KEY, newLocale);
      document.cookie = `jyotishsetu_locale=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
      
      // Optionally persist to server for authenticated user
      fetch("/api/user/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: newLocale }),
      }).catch(() => {});
    } catch (e) {}
  };

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

