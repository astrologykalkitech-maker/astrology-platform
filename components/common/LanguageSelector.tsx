"use client";

import React from "react";
import { Globe } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/i18n/config";

export function LanguageSelector({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useLanguage();

  return (
    <div className={`relative inline-flex items-center gap-2 ${className}`}>
      <Globe className="h-4 w-4 text-gold-deep shrink-0" />
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as SupportedLocale)}
        className="rounded-xl border border-gold/30 bg-white/90 px-2.5 py-1.5 text-xs font-semibold text-midnight focus:border-gold focus:outline-none shadow-sm cursor-pointer"
        aria-label="Select language"
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.nativeName} ({l.name})
          </option>
        ))}
      </select>
    </div>
  );
}

