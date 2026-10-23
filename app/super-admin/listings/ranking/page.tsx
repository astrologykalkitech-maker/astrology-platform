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
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <Award className="h-6 w-6 text-gold" />
            Ranking & Featured Placement Controls
          </h1>
          <p className="text-xs text-zinc-500">
            Platform Owner exclusive control over public directory positioning and promotional pins.
          </p>
        </div>
        <button
          onClick={loadRankings}
          type="button"
          disabled={loading}
          className="inline-flex items-center gap-1.5 self-start rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh Rankings
        </button>
      </div>

      {/* Policy Explanation Banner */}
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1">
          Directory Ranking Hierarchy:
        </h4>
        <ol className="list-decimal pl-4 text-xs text-zinc-600 dark:text-zinc-400 space-y-0.5">
          <li>Unapproved, suspended, or archived listings are strictly excluded from public queries.</li>
          <li>Pinned Featured listings (`is_featured = true`) appear first. Expired promotion dates automatically lapse.</li>
          <li>Owner-assigned manual priority scores (`ranking_priority`, higher first).</li>
          <li>Secondary ordering by registration recency.</li>
        </ol>
      </div>

      {/* Rankings Table */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-100 bg-zinc-50/75 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
              <tr>
                <th className="px-4 py-3">Public Rank Position</th>
                <th className="px-4 py-3">Astrologer Listing</th>
                <th className="px-4 py-3">Featured Badge</th>
                <th className="px-4 py-3">Manual Priority Score</th>
                <th className="px-4 py-3">Promotion Expiry</th>
                <th className="px-4 py-3 text-right">Adjustment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-400">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Calculating current ranking order...
                  </td>
                </tr>
              ) : listings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-400">
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
                      className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                          #{index + 1}
                        </span>
                      </td>

                      <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                        {item.display_name}
                        <span className="block text-[11px] font-normal text-zinc-400">
                          {item.city ?? "Location unlisted"}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        {isFeaturedActive ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-950/70 dark:text-amber-200 border border-amber-300">
                            <Star className="h-3 w-3 fill-current" />
                            FEATURED PIN
                          </span>
                        ) : (
                          <span className="text-[11px] text-zinc-400">Standard</span>
                        )}
                      </td>

                      <td className="px-4 py-3 font-mono font-bold text-zinc-800 dark:text-zinc-200">
                        {item.ranking_priority ?? 0}
                      </td>

                      <td className="px-4 py-3 text-zinc-500 font-mono text-[11px]">
                        {item.featured_until
                          ? new Date(item.featured_until).toLocaleDateString()
                          : "Continuous"}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedListing(item);
                            setIsModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                        >
                          <ArrowUpDown className="h-3 w-3" />
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
