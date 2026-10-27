"use client";

import { useEffect, useState } from "react";
import { Users2, RefreshCw } from "lucide-react";
import { getAdminListings } from "@/app/actions/admin-listings";
import { ListingModerationModal } from "@/components/admin/ListingModerationModal";
import type { AstrologerProfile } from "@/lib/types/database.types";

export default function ConsultantListingsReviewPage() {
  const [listings, setListings] = useState<AstrologerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedListing, setSelectedListing] = useState<AstrologerProfile | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadListings = async () => {
    setLoading(true);
    const res = await getAdminListings({ status: "pending" });
    if (res.success) {
      setListings(res.data.listings);
    }
    setLoading(false);
  };

  useEffect(() => {
    let ignore = false;
    async function fetchPendingListings() {
      const res = await getAdminListings({ status: "pending" });
      if (!ignore) {
        if (res.success) {
          setListings(res.data.listings);
        }
        setLoading(false);
      }
    }

    fetchPendingListings();
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
              <Users2 className="h-3.5 w-3.5 text-gold" />
              <span>Listing Verification Queue</span>
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-ivory">
              Applicant Listing Reviews
            </h1>
            <p className="text-xs text-parchment/80 mt-1 max-w-xl">
              Authorized listing review workspace. Review profile completeness, credentials, and request applicant revisions.
            </p>
          </div>
          <button
            onClick={loadListings}
            type="button"
            disabled={loading}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-gold/30 bg-midnight/80 px-4 py-2 text-xs font-semibold text-champagne shadow-sm hover:bg-gold/20 hover:border-gold transition-all"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-gold" : "text-gold"}`} />
            Refresh Applications
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gold/25 bg-white/95 shadow-sm backdrop-blur-sm dark:bg-midnight/70">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-gold/20 bg-parchment/50 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground dark:bg-midnight/90">
              <tr>
                <th className="px-4 py-3">Applicant Name</th>
                <th className="px-4 py-3">Experience & Location</th>
                <th className="px-4 py-3">Specializations</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Review Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gold/10">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-gold" />
                    Loading applications...
                  </td>
                </tr>
              ) : listings.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground font-medium">
                    No pending listing applications awaiting review.
                  </td>
                </tr>
              ) : (
                listings.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-gold/5 dark:hover:bg-plum/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-semibold text-midnight dark:text-ivory">
                      {item.display_name}
                      <span className="block text-[11px] font-normal text-muted-foreground font-mono">
                        slug: /{item.slug ?? "none"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-midnight dark:text-ivory">{item.experience_years ?? 0} yrs exp</div>
                      <div className="text-[11px] text-muted-foreground">
                        {item.city ? `${item.city}, ${item.state ?? ""}` : "Unlisted"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                      {(item.specializations ?? []).join(", ") || "General Astrology"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase">
                        {item.approval_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedListing(item);
                          setIsModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 rounded-xl border border-gold/30 bg-parchment/40 px-3 py-1 text-[11px] font-semibold text-midnight hover:bg-gold/15 dark:bg-plum/40 dark:text-champagne transition-all"
                      >
                        Review Application
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ListingModerationModal
        listing={selectedListing}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedListing(null);
        }}
        onSuccess={loadListings}
      />
    </div>
  );
}
