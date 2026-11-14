"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { MessageSquare, Calendar, Trash2, Star, Sparkles, CheckCircle2 } from "lucide-react";
import { toggleFavoriteAstrologer } from "@/app/actions/favorites";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] p-5 transition hover:shadow-lg";

export function CustomerFavoriteListClient({ initialFavorites }: { initialFavorites: any[] }) {
  const [favorites, setFavorites] = useState(initialFavorites);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleRemove = async (astrologerId: string) => {
    setLoadingId(astrologerId);
    try {
      const res = await toggleFavoriteAstrologer(astrologerId);
      if (res.success) {
        setFavorites((prev) => prev.filter((f) => f.astrologer_id !== astrologerId));
      }
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {favorites.map((fav) => {
        const astro = fav.astrologer;
        if (!astro) return null;

        return (
          <div key={fav.id} className={CARD}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="relative h-14 w-14 rounded-2xl overflow-hidden border border-gold/40 bg-parchment/60 shrink-0">
                  {astro.profile_photo_url ? (
                    <Image
                      src={astro.profile_photo_url}
                      alt={astro.display_name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center font-display font-bold text-gold-deep text-lg">
                      {astro.display_name?.charAt(0) || "A"}
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-bold text-midnight text-sm">{astro.display_name}</h3>
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 fill-emerald-100" />
                  </div>
                  <p className="text-xs text-muted">
                    {Array.isArray(astro.specializations)
                      ? astro.specializations.slice(0, 2).join(", ")
                      : "Vedic Astrology"}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-ink/70">
                    <span className="flex items-center gap-0.5 text-amber-600 font-semibold">
                      <Star className="h-3 w-3 fill-amber-500" /> 4.9
                    </span>
                    <span>•</span>
                    <span>{astro.experience_years || 5}+ yrs exp</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleRemove(astro.id)}
                disabled={loadingId === astro.id}
                title="Remove from favorites"
                className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-50 hover:text-rose-600 transition"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 pt-3 border-t border-gold/15 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-midnight">
                ₹{astro.consultation_fee || 500}{" "}
                <span className="text-[10px] text-muted font-normal">/ session</span>
              </span>

              <div className="flex items-center gap-2">
                <Link
                  href={`/customer/chat?astrologer=${astro.id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-gold/30 bg-gold/10 px-3 py-1.5 text-xs font-semibold text-gold-deep hover:bg-gold/20"
                >
                  <MessageSquare className="h-3.5 w-3.5" /> Chat
                </Link>
                <Link
                  href={`/customer/astrologers/${astro.id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-3.5 py-1.5 text-xs font-bold text-midnight shadow hover:opacity-95"
                >
                  <Calendar className="h-3.5 w-3.5" /> Book
                </Link>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

