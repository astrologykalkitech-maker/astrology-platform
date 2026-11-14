import React from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles, Flame, ShieldCheck, HeartHandshake } from "lucide-react";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import { getPujaCatalog, getCustomerPujaBookings, getAvailablePujaPriests } from "@/app/actions/puja";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { CustomerPujaBookingClient } from "@/components/customer/CustomerPujaBookingClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Online Sacred Pujas & Havans | JyotishSetu",
  description: "Book authentic Vedic rituals and havans performed by consecrated temple priests on auspicious muhurats.",
};

export default async function CustomerPujaPage() {
  const ctx = await requireCustomerPage();
  const [catalogRes, bookingsRes, priestsRes] = await Promise.all([
    getPujaCatalog(),
    getCustomerPujaBookings(),
    getAvailablePujaPriests(),
  ]);

  const pujas = catalogRes.success && catalogRes.data ? catalogRes.data : [];
  const myBookings = bookingsRes.success && bookingsRes.data ? bookingsRes.data : [];
  const priests = priestsRes.success && priestsRes.data ? priestsRes.data : [];
  const catalogError = !catalogRes.success ? catalogRes.error : undefined;

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Link
          href="/customer/astrologers"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gold/30 bg-white text-gold-deep hover:bg-parchment transition-colors"
          aria-label="Back to astrologers"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <CardTitle>Online Vedic Pujas & Sacred Ceremonies</CardTitle>
          <p className="text-xs text-muted">
            Request sacred havans and pujas performed with personalized Gotra Sankalpa by verified priests.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5 p-3.5 rounded-xl border border-gold/20 bg-parchment/50 text-xs text-ink/80">
        <Flame className="h-4 w-4 text-amber-600 shrink-0" />
        <span>
          Every ritual is conducted in accordance with authentic Shastric vidhi on verified Shubh Muhurats. Live video darshan and sacred consecration photos are accessible directly within your booking portal.
        </span>
      </div>

      <CustomerPujaBookingClient
        pujas={pujas}
        myBookings={myBookings}
        priests={priests}
        customerName={ctx.user.user_metadata?.full_name || ""}
        initialError={catalogError}
      />
    </div>
  );
}
