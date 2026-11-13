"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Radio, Users, Sparkles, Video, Play } from "lucide-react";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] p-5 transition hover:shadow-lg";

export function CustomerBroadcastListClient({ initialBroadcasts }: { initialBroadcasts: any[] }) {
  const [activeBroadcast, setActiveBroadcast] = useState<any | null>(null);

  if (initialBroadcasts.length === 0) {
    return (
      <div className={`${CARD} py-16 px-6 text-center`}>
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 mb-4 border border-amber-200">
          <Radio className="h-8 w-8" />
        </span>
        <h2 className="text-lg font-semibold text-midnight">No Astrologers Live Right Now</h2>
        <p className="text-xs text-muted max-w-md mx-auto mt-1 mb-6">
          Verified astrologers regularly host live interactive discussions on daily transits, remedies, and astrological Q&A. Please check back shortly or consult an astrologer directly.
        </p>
        <Link
          href="/customer/astrologers"
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-5 py-2.5 text-xs font-bold text-midnight shadow hover:opacity-95"
        >
          <Sparkles className="h-4 w-4" /> Browse Verified Astrologers
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {activeBroadcast && (
        <div className="relative overflow-hidden rounded-2xl border-2 border-gold bg-midnight p-6 text-ivory shadow-2xl animate-in fade-in duration-300">
          <div className="flex items-center justify-between pb-4 border-b border-gold/20">
            <div className="flex items-center gap-2">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              <span className="text-xs font-black tracking-widest text-red-400 uppercase">
                LIVE NOW
              </span>
              <span className="text-xs text-ivory/60">• {activeBroadcast.topic}</span>
            </div>
            <button
              onClick={() => setActiveBroadcast(null)}
              className="text-xs text-ivory/60 hover:text-ivory px-2 py-1 rounded-lg hover:bg-white/10"
            >
              Close Stream
            </button>
          </div>

          <div className="my-6 aspect-video max-w-3xl mx-auto rounded-xl bg-black/60 border border-gold/30 flex flex-col items-center justify-center text-center p-6">
            <Radio className="h-12 w-12 text-gold animate-pulse mb-3" />
            <h3 className="text-base font-bold text-champagne">{activeBroadcast.title}</h3>
            <p className="text-xs text-ivory/70 mt-1 max-w-md">
              Connecting to secure LiveKit stream room <span className="font-mono text-gold">{activeBroadcast.room_name}</span>.
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs text-gold">
              <Users className="h-4 w-4" /> {activeBroadcast.viewer_count || 12} Seekers Watching
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-gold/20 text-xs">
            <div>
              <p className="font-semibold text-champagne">
                Astrologer: {activeBroadcast.astrologer?.display_name || "Vedic Master"}
              </p>
              <p className="text-ivory/60">{activeBroadcast.description || "Spiritual discourse"}</p>
            </div>
            <Link
              href={`/customer/astrologers/${activeBroadcast.astrologer_id}`}
              className="rounded-xl border border-gold/40 bg-gold/15 px-4 py-2 font-semibold text-champagne hover:bg-gold/25"
            >
              View Full Profile
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {initialBroadcasts.map((b) => (
          <div key={b.id} className={CARD}>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-[10px] font-black text-red-600 uppercase">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" /> LIVE
              </span>
              <span className="text-[11px] font-medium text-muted">{b.topic}</span>
            </div>

            <h3 className="mt-3 font-bold text-midnight text-sm line-clamp-1">{b.title}</h3>
            <p className="text-xs text-muted mt-1 line-clamp-2">
              {b.description || "Interactive Vedic astrology discussion and planetary analysis."}
            </p>

            <div className="mt-4 pt-3 border-t border-gold/15 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="relative h-7 w-7 rounded-full overflow-hidden border border-gold/40 bg-parchment">
                  {b.astrologer?.profile_photo_url ? (
                    <Image
                      src={b.astrologer.profile_photo_url}
                      alt={b.astrologer.display_name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-[10px] font-bold text-gold-deep">
                      {b.astrologer?.display_name?.charAt(0) || "A"}
                    </div>
                  )}
                </div>
                <span className="text-xs font-medium text-ink">
                  {b.astrologer?.display_name || "Astrologer"}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setActiveBroadcast(b)}
                className="inline-flex items-center gap-1 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-3 py-1.5 text-xs font-bold text-midnight shadow hover:opacity-95"
              >
                <Play className="h-3 w-3 fill-current" /> Watch
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

