import React from "react";
import type { Metadata } from "next";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import { getCustomerPanchangPreferenceAction } from "@/app/actions/panchang";
import { calculatePanchang } from "@/lib/astrology/panchang";
import { PanchangClient } from "@/components/panchang/PanchangClient";
import type { PanchangLocation } from "@/lib/astrology/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Daily Vedic Panchang & Shubh Muhurat | JyotishSetu Seeker Portal",
  description:
    "Location-specific real-time daily Vedic Panchang: Tithi, Nakshatra, Yoga, Karana, Vara, Shubh Muhurats, and Choghadiya.",
};

export default async function CustomerPanchangPage() {
  await requireCustomerPage();

  // Try to load customer's saved location preference from database
  const prefResult = await getCustomerPanchangPreferenceAction();
  const savedPref = prefResult.success && prefResult.data ? prefResult.data : null;

  // Default to saved location, or Meerut / New Delhi default coordinates if no preference yet
  const defaultLocation: PanchangLocation = {
    city: savedPref?.city_name || "New Delhi",
    state: savedPref?.state_name || "Delhi",
    country: savedPref?.country_name || "India",
    latitude: savedPref ? Number(savedPref.latitude) : 28.6139,
    longitude: savedPref ? Number(savedPref.longitude) : 77.209,
    timezoneId: savedPref?.timezone_id || "Asia/Kolkata",
    timezoneOffsetHours: savedPref ? Number(savedPref.timezone_offset) : 5.5,
  };

  const now = new Date();
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, "0");
  const d = now.getDate().toString().padStart(2, "0");
  const todayStr = `${y}-${m}-${d}`;

  // Initial calculation for default location
  const initialPanchang = calculatePanchang(now, defaultLocation);

  return (
    <PanchangClient
      initialPanchang={initialPanchang}
      initialDate={todayStr}
      initialLocation={defaultLocation}
    />
  );
}
