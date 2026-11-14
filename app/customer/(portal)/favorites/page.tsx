import React from "react";
import Link from "next/link";
import { ArrowLeft, Heart, Sparkles, Compass } from "lucide-react";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import { getCustomerFavoriteAstrologers } from "@/app/actions/favorites";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { CustomerFavoriteListClient } from "@/components/customer/CustomerFavoriteListClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My Favourite Astrologers | JyotishSetu",
  description: "Quick access to your trusted Vedic astrologers, real-time availability, and direct consultations.",
};

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

export default async function CustomerFavoritesPage() {
  await requireCustomerPage();
  const res = await getCustomerFavoriteAstrologers();
  const favorites = res.success && res.data ? res.data : [];

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
          <CardTitle>My Favourite Astrologers</CardTitle>
          <p className="text-xs text-muted">
            Quickly connect with your preferred Vedic guides for chat and consultations.
          </p>
        </div>
      </div>

      {favorites.length === 0 ? (
        <div className={`${CARD} py-16 px-6 text-center`}>
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 mb-4 border border-rose-200">
            <Heart className="h-8 w-8" />
          </span>
          <h2 className="text-lg font-semibold text-midnight">No Favourite Astrologers Yet</h2>
          <p className="text-xs text-muted max-w-md mx-auto mt-1 mb-6">
            When you browse verified astrologers, tap the heart icon on their card to save them here for instant consultations.
          </p>
          <Link
            href="/customer/astrologers"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-5 py-2.5 text-xs font-bold text-midnight shadow hover:opacity-95"
          >
            <Compass className="h-4 w-4" /> Browse Verified Astrologers
          </Link>
        </div>
      ) : (
        <CustomerFavoriteListClient initialFavorites={favorites} />
      )}
    </div>
  );
}

