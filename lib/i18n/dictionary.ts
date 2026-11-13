import { en } from "./locales/en";
import { hi } from "./locales/hi";
import { bn } from "./locales/bn";
import { mr } from "./locales/mr";
import { gu } from "./locales/gu";
import { ta } from "./locales/ta";
import { te } from "./locales/te";
import { kn } from "./locales/kn";
import { ml } from "./locales/ml";
import { pa } from "./locales/pa";
import type { TranslationSchema } from "./locales/en";
import type { SupportedLocale } from "./config";

export const DICTIONARIES: Record<SupportedLocale, TranslationSchema> = {
  en,
  hi,
  bn,
  mr,
  gu,
  ta,
  te,
  kn,
  ml,
  pa,
};

export function getDictionary(locale: string = "en"): TranslationSchema {
  return DICTIONARIES[locale as SupportedLocale] || en;
}

