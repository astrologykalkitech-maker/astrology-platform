/**
 * Supported Locales configuration for JyotishSetu
 * Mandatory 10 Indian & International Languages
 */
export const SUPPORTED_LOCALES = [
  { code: "en", name: "English", nativeName: "English", dir: "ltr", fontClass: "font-sans", localeId: "en-IN" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", dir: "ltr", fontClass: "font-devanagari", localeId: "hi-IN" },
  { code: "bn", name: "Bengali", nativeName: "বাংলা", dir: "ltr", fontClass: "font-bengali", localeId: "bn-IN" },
  { code: "mr", name: "Marathi", nativeName: "मराठी", dir: "ltr", fontClass: "font-devanagari", localeId: "mr-IN" },
  { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી", dir: "ltr", fontClass: "font-gujarati", localeId: "gu-IN" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்", dir: "ltr", fontClass: "font-tamil", localeId: "ta-IN" },
  { code: "te", name: "Telugu", nativeName: "తెలుగు", dir: "ltr", fontClass: "font-telugu", localeId: "te-IN" },
  { code: "kn", name: "Kannada", nativeName: "ಕನ್ನಡ", dir: "ltr", fontClass: "font-kannada", localeId: "kn-IN" },
  { code: "ml", name: "Malayalam", nativeName: "മലയാളം", dir: "ltr", fontClass: "font-malayalam", localeId: "ml-IN" },
  { code: "pa", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ", dir: "ltr", fontClass: "font-gurmukhi", localeId: "pa-IN" },
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]["code"];

export const DEFAULT_LOCALE: SupportedLocale = "en";

export function isValidLocale(code: string): code is SupportedLocale {
  return SUPPORTED_LOCALES.some((l) => l.code === code);
}

export function getLocaleMetadata(code: string) {
  return SUPPORTED_LOCALES.find((l) => l.code === code) || SUPPORTED_LOCALES[0];
}

