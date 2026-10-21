"use client";

import { useState } from "react";
import { X, Award, AlertCircle } from "lucide-react";
import { updateListingRankingAndFeatured } from "@/app/actions/admin-listings";
import type { AstrologerProfile } from "@/lib/types/database.types";

interface RankingModalProps {
  listing: AstrologerProfile | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function RankingModal({
  listing,
  isOpen,
  onClose,
  onSuccess,
}: RankingModalProps) {
  const [priority, setPriority] = useState<number>(listing?.ranking_priority ?? 0);
  const [isFeatured, setIsFeatured] = useState<boolean>(listing?.is_featured ?? false);
  const [featuredUntil, setFeaturedUntil] = useState<string>(
    listing?.featured_until ? listing.featured_until.slice(0, 10) : ""
  );
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !listing) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await updateListingRankingAndFeatured({
      listingId: listing.id,
      rankingPriority: Number(priority),
      isFeatured,
      featuredUntil: featuredUntil ? new Date(featuredUntil).toISOString() : null,
      reason: reason.trim() || undefined,
    });

    setLoading(false);

    if (!res.success) {
      setError(res.error);
      return;
    }

    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-4 dark:border-zinc-800">
          <div>
            <h3 className="font-display text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Award className="h-5 w-5 text-gold" />
              Ranking & Placement
            </h3>
            <p className="text-xs text-zinc-500">
              Listing: <span className="font-semibold text-zinc-800 dark:text-zinc-200">{listing.display_name}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Manual Ranking Priority (-100 to 1000)
            </label>
            <input
              type="number"
              min={-100}
              max={1000}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
            />
            <p className="text-[11px] text-zinc-400 mt-1">
              Higher values appear earlier in search and directory placement. Default is 0.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isFeatured}
                onChange={(e) => setIsFeatured(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 dark:border-zinc-700"
              />
              <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                Pin as Featured Listing
              </span>
            </label>
            <p className="text-[11px] text-zinc-500 mt-1 pl-6">
              Featured listings are pinned prominently at the top of the directory with a gold badge.
            </p>
          </div>

          {isFeatured && (
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Featured Expiry Date (Optional)
              </label>
              <input
                type="date"
                value={featuredUntil}
                onChange={(e) => setFeaturedUntil(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              />
              <p className="text-[11px] text-zinc-400 mt-1">
                Leave blank for continuous featured placement until manually removed.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Reason / Justification
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Featured partner promotion for Q4"
              className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {loading ? "Saving..." : "Save Ranking"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
