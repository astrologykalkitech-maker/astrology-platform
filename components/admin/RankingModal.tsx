"use client";

import { useState, useEffect } from "react";
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

  useEffect(() => {
    if (listing) {
      setPriority(listing.ranking_priority ?? 0);
      setIsFeatured(listing.is_featured ?? false);
      setFeaturedUntil(listing.featured_until ? listing.featured_until.slice(0, 10) : "");
      setReason("");
      setError(null);
    }
  }, [listing, isOpen]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/80 backdrop-blur-md p-4 rise-in">
      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-gold/40 bg-white p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-gold/15 pb-4">
          <div>
            <h3 className="font-serif text-lg font-bold text-midnight flex items-center gap-2">
              <Award className="h-5 w-5 text-gold" />
              Ranking &amp; Placement
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Listing: <span className="font-semibold text-midnight">{listing.display_name}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            type="button"
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-muted hover:bg-gold/10 hover:text-midnight transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-midnight mb-1">
              Manual Ranking Priority (-100 to 1000)
            </label>
            <input
              type="number"
              min={-100}
              max={1000}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="w-full rounded-xl border border-gold/30 bg-parchment/30 p-2.5 text-xs text-midnight outline-none focus:border-gold focus:ring-1 focus:ring-gold"
            />
            <p className="text-[11px] text-muted mt-1">
              Higher values appear earlier in search and directory placement. Default is 0.
            </p>
          </div>

          <div className="rounded-xl border border-gold/25 bg-parchment/30 p-3.5">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isFeatured}
                onChange={(e) => setIsFeatured(e.target.checked)}
                className="h-4 w-4 rounded border-gold/40 text-gold focus:ring-gold"
              />
              <span className="text-xs font-semibold text-midnight">
                Pin as Featured Listing
              </span>
            </label>
            <p className="text-[11px] text-muted mt-1 pl-6.5">
              Featured listings are pinned prominently at the top of the directory with a gold badge.
            </p>
          </div>

          {isFeatured && (
            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">
                Featured Expiry Date (Optional)
              </label>
              <input
                type="date"
                value={featuredUntil}
                onChange={(e) => setFeaturedUntil(e.target.value)}
                className="w-full rounded-xl border border-gold/30 bg-parchment/30 p-2.5 text-xs text-midnight outline-none focus:border-gold focus:ring-1 focus:ring-gold"
              />
              <p className="text-[11px] text-muted mt-1">
                Leave blank for continuous featured placement until manually removed.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-midnight mb-1">
              Reason / Justification
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Featured partner promotion for Q4"
              className="w-full rounded-xl border border-gold/30 bg-parchment/30 p-2.5 text-xs text-midnight outline-none focus:border-gold focus:ring-1 focus:ring-gold"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gold/15">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-gold/30 bg-white px-4 py-2 text-xs font-semibold text-midnight hover:bg-gold/10 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-gradient-to-r from-gold to-gold-deep px-5 py-2 text-xs font-semibold text-midnight shadow-md hover:brightness-110 disabled:opacity-40 transition-all cursor-pointer"
            >
              {loading ? "Saving..." : "Save Ranking"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
