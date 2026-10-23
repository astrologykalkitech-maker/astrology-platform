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
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <Users2 className="h-6 w-6 text-gold" />
            Applicant Listing Reviews
          </h1>
          <p className="text-xs text-zinc-500">
            Authorized listing review workspace. Review profile completeness and request corrections.
          </p>
        </div>
        <button
          onClick={loadListings}
          type="button"
          disabled={loading}
          className="inline-flex items-center gap-1.5 self-start rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh Applications
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-100 bg-zinc-50/75 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
              <tr>
                <th className="px-4 py-3">Applicant Name</th>
                <th className="px-4 py-3">Experience & Location</th>
                <th className="px-4 py-3">Specializations</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Review Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-400">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Loading applications...
                  </td>
                </tr>
              ) : listings.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-400">
                    No pending listing applications awaiting review.
                  </td>
                </tr>
              ) : (
                listings.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                      {item.display_name}
                      <span className="block text-[11px] font-normal text-zinc-400">
                        slug: /{item.slug ?? "none"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div>{item.experience_years ?? 0} yrs exp</div>
                      <div className="text-[11px] text-zinc-400">
                        {item.city ? `${item.city}, ${item.state ?? ""}` : "Unlisted"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 max-w-xs truncate">
                      {(item.specializations ?? []).join(", ") || "General Astrology"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
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
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
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
