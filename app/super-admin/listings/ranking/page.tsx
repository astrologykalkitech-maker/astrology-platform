"use client";

import { useEffect, useState } from "react";
import { Award, Star, ArrowUpDown, RefreshCw } from "lucide-react";
import { getAdminListings } from "@/app/actions/admin-listings";
import { RankingModal } from "@/components/admin/RankingModal";
import type { AstrologerProfile } from "@/lib/types/database.types";

export default function RankingAndFeaturedPage() {
  const [listings, setListings] = useState<AstrologerProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedListing, setSelectedListing] = useState<AstrologerProfile | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadRankings = async () => {
    setLoading(true);
    const res = await getAdminListings({ status: "approved", limit: 50 });
    if (res.success) {
      setListings(res.data.listings);
    }
    setLoading(false);
  };

  useEffect(() => {
    let ignore = false;
    async function fetchRankings() {
      const res = await getAdminListings({ status: "approved", limit: 50 });
      if (!ignore) {
        if (res.success) {
          setListings(res.data.listings);
        }
        setLoading(false);
      }
    }

    fetchRankings();
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <div className="space-y-6 rise-in">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-r from-midnight via-plum to-midnight p-6 text-white shadow-xl">
        <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-gold/10 blur-2xl pointer-events-none" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/15 px-3 py-0.5 text-[11px] font-semibold text-champagne backdrop-blur-sm mb-2">
              <Award className="h-3.5 w-3.5 text-gold" />
              <span>Directory Positioning</span>
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-ivory">
              Ranking &amp; Featured Placement Controls
            </h1>
            <p className="text-xs text-parchment/80 mt-1 max-w-xl">
              Platform Owner exclusive control over public directory positioning, premium visibility tiers, and promotional pins.
            </p>
          </div>
          <button
            onClick={loadRankings}
            type="button"
            disabled={loading}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-gold/30 bg-midnight/80 px-4 py-2 text-xs font-semibold text-champagne shadow-sm hover:bg-gold/20 hover:border-gold transition-all cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-gold" : "text-gold"}`} />
            Refresh Rankings
          </button>
        </div>
      </div>

      {/* Policy Explanation Banner */}
      <div className="rounded-2xl border border-gold/25 bg-white/95 p-5 shadow-xs backdrop-blur-sm">
        <h4 className="text-xs font-serif font-bold uppercase tracking-wider text-gold-deep mb-2">
          Directory Ranking Algorithm Hierarchy:
        </h4>
        <ol className="list-decimal pl-5 text-xs text-muted space-y-1">
          <li>Unapproved, suspended, or archived listings are strictly excluded from all public queries.</li>
          <li>
            Pinned Featured listings (
            <code className="rounded bg-parchment px-1.5 py-0.5 text-gold-deep border border-gold/25 font-mono text-[11px]">
              is_featured = true
            </code>
            ) appear first. Expired promotion dates automatically lapse.
          </li>
          <li>
            Owner-assigned manual priority scores (
            <code className="rounded bg-parchment px-1.5 py-0.5 text-gold-deep border border-gold/25 font-mono text-[11px]">
              ranking_priority
            </code>
            , higher first).
          </li>
          <li>Secondary ordering by registration recency.</li>
        </ol>
      </div>

      {/* Rankings Table */}
      <div className="overflow-hidden rounded-2xl border border-gold/25 bg-white/95 shadow-xs backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-gold/20 bg-parchment/60 text-[11px] font-semibold uppercase tracking-wider text-gold-deep">
              <tr>
                <th className="px-5 py-3">Public Rank</th>
                <th className="px-5 py-3">Astrologer Listing</th>
                <th className="px-5 py-3">Featured Badge</th>
                <th className="px-5 py-3">Manual Priority</th>
                <th className="px-5 py-3">Promotion Expiry</th>
                <th className="px-5 py-3 text-right">Adjustment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gold/10">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-gold" />
                    Calculating current ranking order...
                  </td>
                </tr>
              ) : listings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted font-medium">
                    No approved listings available to rank.
                  </td>
                </tr>
              ) : (
                listings.map((item, index) => {
                  const isFeaturedActive =
                    item.is_featured &&
                    (!item.featured_until || new Date(item.featured_until) > new Date());

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-gold/5 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-gold/40 bg-gold/15 text-xs font-bold text-gold-deep">
                          #{index + 1}
                        </span>
                      </td>

                      <td className="px-5 py-3.5 font-semibold text-midnight">
                        {item.display_name}
                        <span className="block text-[11px] font-normal text-muted">
                          {item.city ?? "Location unlisted"}
                        </span>
                      </td>

                      <td className="px-5 py-3.5">
                        {isFeaturedActive ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-gold/50 bg-gradient-to-r from-gold/15 to-gold/25 px-2.5 py-0.5 text-[10px] font-bold text-gold-deep">
                            <Star className="h-3 w-3 fill-current text-gold" />
                            FEATURED PIN
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted">Standard</span>
                        )}
                      </td>

                      <td className="px-5 py-3.5 font-mono font-bold text-midnight text-sm">
                        {item.ranking_priority ?? 0}
                      </td>

                      <td className="px-5 py-3.5 text-muted font-mono text-[11px]">
                        {item.featured_until
                          ? new Date(item.featured_until).toLocaleDateString()
                          : "Continuous"}
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedListing(item);
                            setIsModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-gold/30 bg-white px-3 py-1.5 text-xs font-semibold text-midnight shadow-2xs hover:bg-gold/15 transition-all cursor-pointer"
                        >
                          <ArrowUpDown className="h-3.5 w-3.5 text-gold-deep" />
                          Adjust Priority
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <RankingModal
        listing={selectedListing}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedListing(null);
        }}
        onSuccess={loadRankings}
      />
    </div>
  );
}
