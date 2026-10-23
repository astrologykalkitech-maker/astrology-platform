"use client";

import { useEffect, useState } from "react";
import { Users2, Search, Filter, ShieldCheck, CheckCircle2, AlertCircle, ShieldAlert, RefreshCw } from "lucide-react";
import { getAdminListings } from "@/app/actions/admin-listings";
import { ListingModerationModal } from "@/components/admin/ListingModerationModal";
import type { ApprovalStatus, AstrologerProfile } from "@/lib/types/database.types";

export default function SuperAdminListingsPage() {
  const [listings, setListings] = useState<AstrologerProfile[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | "all">("all");

  const [selectedListing, setSelectedListing] = useState<AstrologerProfile | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadListings = async () => {
    setLoading(true);
    const res = await getAdminListings({
      status: statusFilter,
      search: search.trim() || undefined,
    });

    if (res.success) {
      setListings(res.data.listings);
      setTotalCount(res.data.totalCount);
    }
    setLoading(false);
  };

  useEffect(() => {
    let ignore = false;
    async function fetchListings() {
      const res = await getAdminListings({
        status: statusFilter,
        search: search.trim() || undefined,
      });

      if (!ignore) {
        if (res.success) {
          setListings(res.data.listings);
          setTotalCount(res.data.totalCount);
        }
        setLoading(false);
      }
    }

    fetchListings();
    return () => {
      ignore = true;
    };
  }, [statusFilter, search]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadListings();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <Users2 className="h-6 w-6 text-gold" />
            Listings Moderation & Lifecycle
          </h1>
          <p className="text-xs text-zinc-500">
            Total {totalCount} astrologer profiles registered on the platform.
          </p>
        </div>
        <button
          onClick={loadListings}
          type="button"
          disabled={loading}
          className="inline-flex items-center gap-1.5 self-start rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search by astrologer name, city, or unique slug..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 py-2 pl-9 pr-3 text-xs outline-none focus:border-zinc-900 focus:bg-white dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-100"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Search
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs">
          <span className="text-[11px] font-semibold uppercase text-zinc-400 flex items-center gap-1">
            <Filter className="h-3 w-3" /> Status:
          </span>
          {(
            [
              "all",
              "pending",
              "changes_requested",
              "approved",
              "rejected",
              "suspended",
              "draft",
            ] as const
          ).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-lg px-2.5 py-1 capitalize transition-colors ${
                statusFilter === st
                  ? "bg-zinc-900 text-white font-medium dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              {st.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Listings Table */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-100 bg-zinc-50/75 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
              <tr>
                <th className="px-4 py-3">Astrologer Profile</th>
                <th className="px-4 py-3">Experience & Location</th>
                <th className="px-4 py-3">Fee / Services</th>
                <th className="px-4 py-3">Approval Status</th>
                <th className="px-4 py-3">Notes / Reviewer</th>
                <th className="px-4 py-3 text-right">Moderation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-400">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Loading astrologer listings...
                  </td>
                </tr>
              ) : listings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-400">
                    No listings found for the selected filter.
                  </td>
                </tr>
              ) : (
                listings.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {item.display_name}
                      </div>
                      <div className="text-[11px] text-zinc-400 font-mono">
                        slug: /{item.slug ?? "none"}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="text-zinc-800 dark:text-zinc-200">
                        {item.experience_years ?? 0} years exp
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        {item.city ? `${item.city}, ${item.state ?? ""}` : "Location unlisted"}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {item.consultation_fee ? `₹${item.consultation_fee}` : "Fee not set"}
                      </div>
                      <div className="text-[11px] text-zinc-400 truncate max-w-[140px]">
                        {(item.specializations ?? []).join(", ") || "General"}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold capitalize ${
                          item.approval_status === "approved"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : item.approval_status === "pending"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            : item.approval_status === "changes_requested"
                            ? "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300"
                            : item.approval_status === "suspended"
                            ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                            : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                        }`}
                      >
                        {item.approval_status === "approved" ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : item.approval_status === "pending" ? (
                          <AlertCircle className="h-3 w-3" />
                        ) : item.approval_status === "changes_requested" ? (
                          <AlertCircle className="h-3 w-3" />
                        ) : (
                          <ShieldAlert className="h-3 w-3" />
                        )}
                        {item.approval_status.replace("_", " ")}
                      </span>
                    </td>

                    <td className="px-4 py-3 max-w-xs">
                      {item.review_notes ? (
                        <div className="text-[11px] text-zinc-600 dark:text-zinc-400 italic truncate">
                          &quot;{item.review_notes}&quot;
                        </div>
                      ) : (
                        <span className="text-[11px] text-zinc-400">None</span>
                      )}
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
                        <ShieldCheck className="h-3 w-3" />
                        Review / Moderate
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
