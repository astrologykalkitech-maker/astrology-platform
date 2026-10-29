"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  MapPin,
  Clock,
  ArrowRight,
  Search,
  X,
  ExternalLink,
  Navigation,
  Loader2,
} from "lucide-react";
import type { PublicAstrologerProfile } from "@/lib/types/astrologer.types";
import { Avatar } from "@/components/astrologer/ui/Avatar";
import { buttonStyles } from "@/components/astrologer/ui/Button";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

interface Props {
  astrologers: PublicAstrologerProfile[];
}

export default function AstrologersDirectoryClient({ astrologers }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSpecialization, setSelectedSpecialization] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"experience" | "fee_asc" | "fee_desc">("experience");
  const [currentPage, setCurrentPage] = useState(1);
  const [detectingNearMe, setDetectingNearMe] = useState(false);
  const [nearMeNotice, setNearMeNotice] = useState<string | null>(null);
  const pageSize = 12;

  const handleNearMe = () => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setNearMeNotice("Geolocation is not supported by your browser.");
      return;
    }
    setDetectingNearMe(true);
    setNearMeNotice(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `/api/places/reverse-geocode?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`
          );
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.result?.city) {
              setSearchQuery(data.result.city);
              setNearMeNotice(`Showing astrologers near ${data.result.city}`);
            } else if (data.result?.state) {
              setSearchQuery(data.result.state);
              setNearMeNotice(`Showing astrologers near ${data.result.state}`);
            }
          }
        } catch {
          // Graceful fallback
        } finally {
          setDetectingNearMe(false);
        }
      },
      (err) => {
        setDetectingNearMe(false);
        if (err.code === 1) {
          setNearMeNotice("Location permission denied. Search by city instead.");
        } else {
          setNearMeNotice("Could not detect location.");
        }
      },
      { timeout: 10000, enableHighAccuracy: false }
    );
  };

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedSpecialization, sortBy]);

  // Extract all unique specializations
  const allSpecializations = useMemo(() => {
    const specs = new Set<string>();
    astrologers.forEach((a) => {
      (a.specializations || []).forEach((s) => specs.add(s));
    });
    return Array.from(specs).sort();
  }, [astrologers]);

  // Filter and sort astrologers
  const filteredAstrologers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return astrologers
      .filter((astro) => {
        const matchesQuery =
          !q ||
          astro.display_name.toLowerCase().includes(q) ||
          (astro.city && astro.city.toLowerCase().includes(q)) ||
          (astro.specializations &&
            astro.specializations.some((s) => s.toLowerCase().includes(q)));

        const matchesSpec =
          selectedSpecialization === "all" ||
          (astro.specializations &&
            astro.specializations.includes(selectedSpecialization));

        return matchesQuery && matchesSpec;
      })
      .sort((a, b) => {
        if (sortBy === "experience") {
          return (b.experience_years ?? 0) - (a.experience_years ?? 0);
        }
        if (sortBy === "fee_asc") {
          return (a.consultation_fee ?? 0) - (b.consultation_fee ?? 0);
        }
        if (sortBy === "fee_desc") {
          return (b.consultation_fee ?? 0) - (a.consultation_fee ?? 0);
        }
        return 0;
      });
  }, [astrologers, searchQuery, selectedSpecialization, sortBy]);

  const totalPages = Math.ceil(filteredAstrologers.length / pageSize) || 1;
  const paginatedAstrologers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAstrologers.slice(start, start + pageSize);
  }, [filteredAstrologers, currentPage, pageSize]);

  return (
    <div className="space-y-4">
      {/* Search and Filters Bar */}
      <div className={`${CARD} p-4 sm:p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between`}>
        {/* Search Input & Near Me */}
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by astrologer name, city, or specialty..."
              className="w-full rounded-xl border border-gold/30 bg-parchment/30 pl-10 pr-9 py-2 text-xs text-midnight placeholder:text-muted focus:border-gold focus:bg-white focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setNearMeNotice(null);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-midnight"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleNearMe}
            disabled={detectingNearMe}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gold/40 bg-gold/10 px-3.5 py-2 text-xs font-semibold text-midnight hover:bg-gold/20 transition-colors disabled:opacity-50 shrink-0 cursor-pointer"
            title="Find astrologers near your current location"
          >
            {detectingNearMe ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-gold-deep" />
            ) : (
              <Navigation className="h-3.5 w-3.5 text-gold-deep" />
            )}
            <span>{detectingNearMe ? "Locating..." : "Near Me"}</span>
          </button>
        </div>

        {/* Filter dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Specialization Filter */}
          <select
            value={selectedSpecialization}
            onChange={(e) => setSelectedSpecialization(e.target.value)}
            className="rounded-xl border border-gold/30 bg-parchment/30 px-3 py-2 text-xs text-midnight focus:border-gold focus:bg-white focus:outline-none"
            aria-label="Filter by specialization"
          >
            <option value="all">All Specializations</option>
            {allSpecializations.map((spec) => (
              <option key={spec} value={spec}>
                {spec}
              </option>
            ))}
          </select>

          {/* Sort Option */}
          <select
            value={sortBy}
            onChange={(e) =>
              setSortBy(e.target.value as "experience" | "fee_asc" | "fee_desc")
            }
            className="rounded-xl border border-gold/30 bg-parchment/30 px-3 py-2 text-xs text-midnight focus:border-gold focus:bg-white focus:outline-none"
            aria-label="Sort directory"
          >
            <option value="experience">Sort: Most Experienced</option>
            <option value="fee_asc">Fee: Low to High</option>
            <option value="fee_desc">Fee: High to Low</option>
          </select>
        </div>
      </div>

      {nearMeNotice && (
        <div className="flex items-center justify-between rounded-xl border border-gold/30 bg-amber-50/60 px-3.5 py-2 text-xs text-midnight">
          <span className="flex items-center gap-1.5 font-medium">
            <Navigation className="h-3.5 w-3.5 text-gold-deep" />
            {nearMeNotice}
          </span>
          <button
            type="button"
            onClick={() => setNearMeNotice(null)}
            className="text-muted hover:text-midnight text-[11px] font-semibold underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Results Count */}
      <div className="flex items-center justify-between text-xs text-muted px-1">
        <span>
          Showing <strong>{paginatedAstrologers.length}</strong> of <strong>{filteredAstrologers.length}</strong> verified astrologers
        </span>
        {totalPages > 1 && (
          <span>
            Page {currentPage} of {totalPages}
          </span>
        )}
      </div>

      {/* Directory Grid */}
      {paginatedAstrologers.length === 0 ? (
        <div className={`${CARD} py-14 px-6 text-center`}>
          <p className="text-sm font-semibold text-midnight">No astrologers found</p>
          <p className="text-xs text-muted mt-1 mb-4">
            Try adjusting your search query or removing specialization filters.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setSelectedSpecialization("all");
            }}
            className={buttonStyles({ variant: "outline", size: "sm" })}
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {paginatedAstrologers.map((astro) => {
            const specializations = astro.specializations || [];
            const languages = astro.languages || [];
            const profileHref = astro.slug
              ? `/customer/astrologers/${astro.slug}`
              : `/customer/astrologers/${astro.id}`;

            return (
              <div
                key={astro.id}
                className={`${CARD} flex flex-col justify-between p-5 hover:-translate-y-1 hover:shadow-[0_18px_34px_-20px_rgba(60,35,90,0.6)] transition-all`}
              >
                <div>
                  <div className="flex items-start gap-3.5 mb-3">
                    <Link href={profileHref} className="shrink-0 group focus-visible:outline-2 focus-visible:outline-gold rounded-full">
                      <Avatar
                        name={astro.display_name}
                        src={astro.profile_photo_url}
                        size="md"
                        className="!h-14 !w-14 group-hover:ring-2 group-hover:ring-gold transition-all"
                      />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link href={profileHref} className="block group focus-visible:outline-2 focus-visible:outline-gold rounded-sm">
                        <h3 className="truncate text-base font-semibold text-midnight group-hover:text-gold-deep transition-colors">
                          {astro.display_name}
                        </h3>
                      </Link>
                      <p className="text-xs font-medium text-gold-deep truncate">
                        {specializations[0] || "Vedic Astrologer"}
                      </p>
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-muted">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {astro.experience_years ?? 1} yrs exp
                        </span>
                        {astro.city && (
                          <span className="inline-flex items-center gap-1 truncate">
                            <MapPin className="h-3 w-3" /> {astro.city}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {astro.bio && (
                    <p className="text-xs text-ink/75 line-clamp-2 mb-3 leading-relaxed">
                      {astro.bio}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-1 mb-4">
                    {specializations.slice(0, 3).map((spec) => (
                      <span
                        key={spec}
                        className="rounded-md border border-gold/20 bg-parchment/60 px-2 py-0.5 text-[10px] font-medium text-ink/80"
                      >
                        {spec}
                      </span>
                    ))}
                    {languages.length > 0 && (
                      <span className="rounded-md border border-teal/20 bg-teal/5 px-2 py-0.5 text-[10px] font-medium text-teal">
                        {languages.join(", ")}
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-gold/15 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] text-muted uppercase tracking-wider font-semibold">
                      Consultation
                    </p>
                    <p className="font-display text-base font-bold text-midnight">
                      ₹{astro.consultation_fee ?? 499}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={profileHref}
                      className={buttonStyles({ variant: "outline", size: "sm", className: "hidden sm:inline-flex text-[11px] px-2.5 py-1" })}
                    >
                      Profile <ExternalLink className="h-3 w-3 ml-1" />
                    </Link>
                    <Link
                      href={`/customer/enquiries/new?astrologerId=${astro.id}&astrologerName=${encodeURIComponent(
                        astro.display_name
                      )}`}
                      className={buttonStyles({ variant: "gold", size: "sm", className: "text-[11px] px-3 py-1" })}
                    >
                      Consult <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-gold/30 bg-white px-3 py-1.5 text-xs font-semibold text-midnight hover:bg-parchment disabled:opacity-40 transition-colors"
          >
            Previous
          </button>
          <span className="text-xs text-muted px-2">
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-lg border border-gold/30 bg-white px-3 py-1.5 text-xs font-semibold text-midnight hover:bg-parchment disabled:opacity-40 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
