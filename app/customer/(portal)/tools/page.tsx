import React from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles, Compass } from "lucide-react";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { CustomerAstrologyToolsClient } from "@/components/customer/CustomerAstrologyToolsClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Astrology Tools & Advanced Vedic Calculators | Karmic Ascension",
  description: "Comprehensive Vedic astrology tools: KP Astrology, 16 Divisional Charts, Shadbala, Ashtakavarga, Sacred Tarot, and Numerology.",
};

export default async function CustomerAstrologyToolsPage() {
  await requireCustomerPage();

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Link
          href="/customer/astrologers"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gold/30 bg-white text-gold-deep hover:bg-parchment transition-colors"
          aria-label="Back to astrologers"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <CardTitle>Astrology Tools & Advanced Calculators</CardTitle>
          <p className="text-xs text-muted">
            High-precision KP Sub-Lords, Shodashvarga (D1–D60), Shadbala strengths, Ashtakavarga bindus, Sacred Tarot, and Numerology.
          </p>
        </div>
      </div>

      <CustomerAstrologyToolsClient />
    </div>
  );
}

