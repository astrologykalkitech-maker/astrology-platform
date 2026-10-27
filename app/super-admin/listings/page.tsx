"use client";

import { useEffect, useState } from "react";
import {
  Users2,
  Search,
  Filter,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  RefreshCw,
  MapPin,
  IndianRupee,
} from "lucide-react";
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
      {/* Page Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-midnight flex items-center gap-2">
            <Users2 className="h-6 w-6 text-gold" />
            Listings Moderation & Verification
          </h1>
          <p className="text-xs text-muted">
            Total {totalCount} registered astrologers across verified, pending, and suspended states.
          </p>
        </div>
        <button
          onClick={loadListings}
          type="button"
          disabled={loading}
          className="inline-flex items-center gap-1.5 self-start rounded-xl border border-gold/30 bg-white/80 px-3.5 py-1.5 text-xs font-medium text-midnight shadow-xs hover:bg-gold/10 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-gold" : "text-muted"}`} />
          Refresh
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-gold/25 bg-white/90 p-4 shadow-sm backdrop-blur-xs space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-muted" />
            <input
              type="text"
              placeholder="Search by astrologer name, city, or unique slug..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
              suppressHydrationWarning
              className="w-full rounded-xl border border-gold/20 bg-parchment/30 py-2 pl-9 pr-3 text-xs text-midnight outline-none focus:border-gold focus:bg-white transition-colors"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-gradient-to-r from-gold to-gold-deep px-5 py-2 text-xs font-semibold text-midnight shadow-sm hover:brightness-110 transition-all cursor-pointer"
          >
            Search
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gold/15 text-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted flex items-center gap-1">
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
              className={`rounded-lg px-2.5 py-1 capitalize transition-colors font-medium text-xs cursor-pointer ${
                statusFilter === st
                  ? "bg-midnight text-champagne font-semibold shadow-xs"
                  : "bg-parchment/60 text-muted hover:bg-gold/15 hover:text-midnight"
              }`}
            >
              {st.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Listings Table */}
      <div className="overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-gold/20 bg-parchment/60 text-[11px] font-semibold uppercase tracking-wider text-gold-deep">
              <tr>
                <th className="px-5 py-3">Astrologer Profile</th>
                <th className="px-5 py-3">Experience & Location</th>
                <th className="px-5 py-3">Fee / Services</th>
                <th className="px-5 py-3">Approval Status</th>
                <th className="px-5 py-3">Reviewer Notes</th>
                <th className="px-5 py-3 text-right">Moderation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gold/15">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-gold" />
                    Loading astrologer listings...
                  </td>
                </tr>
              ) : listings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted text-xs">
                    No astrologer listings found for the selected filter.
                  </td>
                </tr>
              ) : (
                listings.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-parchment/30 transition-colors"
                  >
                    <td className="px-5 py-3.5 font-medium text-midnight">
                      <div className="font-semibold text-midnight text-sm">
                        {item.display_name}
                      </div>
                      <div className="text-[11px] text-muted font-mono mt-0.5">
                        slug: /{item.slug ?? "none"}
                      </div>
                    </td>

                    <td className="px-5 py-3.5">
                      <div className="font-medium text-ink">
                        {item.experience_years ?? 0} {item.experience_years === 1 ? "year" : "years"} experience
                      </div>
                      <div className="text-[11px] text-muted flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3 text-teal" />
                        <span>{item.city ? `${item.city}, ${item.state ?? ""}` : "Location unlisted"}</span>
                      </div>
                    </td>

                    <td className="px-5 py-3.5">
                      <div className="font-bold text-midnight flex items-center gap-0.5">
                        {item.consultation_fee ? (
                          <>
                            <IndianRupee className="h-3 w-3 text-gold-deep" />
                            <span>{item.consultation_fee}</span>
                          </>
                        ) : (
                          <span className="text-xs font-normal text-muted">Fee not set</span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted truncate max-w-[160px] mt-0.5">
                        {(item.specializations ?? []).join(", ") || "Vedic General"}
                      </div>
                    </td>

                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${
                          item.approval_status === "approved"
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                            : item.approval_status === "pending"
                            ? "bg-amber-100 text-amber-800 border border-amber-300"
                            : item.approval_status === "changes_requested"
                            ? "bg-orange-100 text-orange-800 border border-orange-300"
                            : item.approval_status === "suspended"
                            ? "bg-rose-100 text-rose-800 border border-rose-300"
                            : "bg-red-100 text-red-800 border border-red-300"
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

                    <td className="px-5 py-3.5 max-w-xs">
                      {item.review_notes ? (
                        <div className="text-[11px] text-ink/80 italic truncate">
                          &ldquo;{item.review_notes}&rdquo;
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted/60">No notes</span>
                      )}
                    </td>

                    <td className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedListing(item);
                          setIsModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-gold/30 bg-white px-2.5 py-1 text-xs font-semibold text-midnight shadow-2xs hover:bg-gold/15 transition-colors"
                      >
                        <ShieldCheck className="h-3.5 w-3.5 text-gold" />
                        Moderate
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
