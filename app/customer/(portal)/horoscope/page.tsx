import React from "react";
import type { Metadata } from "next";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import { generateVedicHoroscope } from "@/lib/astrology/horoscope";
import { getCustomerKundlisAction } from "@/app/actions/kundli";
import { getCustomerSavedHoroscopesAction } from "@/app/actions/horoscope";
import { HoroscopeClient } from "@/components/horoscope/HoroscopeClient";
import type { SavedKundliRecord, SavedHoroscopeRecord } from "@/lib/types/database.types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vedic Horoscope & Planetary Transit Forecast | Karmic Ascension",
  description:
    "Daily, weekly, monthly, and yearly Vedic horoscope predictions and real-time Gochara planetary transit movements across all 12 Rashis.",
};

export default async function CustomerHoroscopePage() {
  await requireCustomerPage();

  // Initial calculation: Aries (Mesha) for Today
  const initialForecast = generateVedicHoroscope("aries", "today");

  // Load customer's saved Kundlis for personalized forecast integration
  const [kundlisRes, historyRes] = await Promise.all([
    getCustomerKundlisAction(),
    getCustomerSavedHoroscopesAction(),
  ]);

  const customerKundlis: SavedKundliRecord[] =
    kundlisRes.success && kundlisRes.data ? kundlisRes.data : [];

  const initialHistory: SavedHoroscopeRecord[] =
    historyRes.success && historyRes.data ? historyRes.data : [];

  return (
    <HoroscopeClient
      initialForecast={initialForecast}
      customerKundlis={customerKundlis}
      initialHistory={initialHistory}
    />
  );
}
