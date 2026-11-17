import React from "react";
import type { Metadata } from "next";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import { getCustomerKundlisAction } from "@/app/actions/kundli";
import { getCustomerFullProfile } from "@/app/actions/customer";
import KundliOverview from "@/components/kundli/KundliOverview";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Vedic Kundli & Birth Chart | Karmic Ascension",
  description: "Comprehensive Vedic Kundli, planetary positions, 12 Bhavas, Nakshatra analysis, and Vimshottari Dasha.",
};

export default async function CustomerKundliPage() {
  await requireCustomerPage();

  const [kundlisRes, profileRes] = await Promise.all([
    getCustomerKundlisAction(),
    getCustomerFullProfile(),
  ]);

  const initialKundlis = kundlisRes.success && kundlisRes.data ? kundlisRes.data : [];
  const customerProfile = profileRes.success && profileRes.data ? profileRes.data : null;

  return (
    <KundliOverview
      initialKundlis={initialKundlis}
      customerProfile={customerProfile}
    />
  );
}
