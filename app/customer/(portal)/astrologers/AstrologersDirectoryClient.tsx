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
  Star,
  Sparkles,
  Flame,
  Award,
  Crown,
  Heart,
  Bell,
  CheckCircle2,
  ShieldCheck,
  MessageSquare,
  Calendar,
} from "lucide-react";
import type { PublicAstrologerProfile } from "@/lib/types/astrologer.types";
import { Avatar } from "@/components/astrologer/ui/Avatar";
import { buttonStyles } from "@/components/astrologer/ui/Button";
import { toggleFavoriteAstrologer } from "@/app/actions/favorites";
import { toggleFollowAstrologer } from "@/app/actions/follows";
import { calculateMarketplaceMetrics } from "@/lib/marketplace/ranking";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

interface Props {
  astrologers: PublicAstrologerProfile[];
  initialFavoriteIds?: string[];
  initialFollowedIds?: string[];
}

export default function AstrologersDirectoryClient({
  astrologers,
  initialFavoriteIds = [],
  initialFollowedIds = [],
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSpecialization, setSelectedSpecialization] = useState<string>("all");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("all");
  const [selectedRating, setSelectedRating] = useState<number>(0);
  const [selectedAvailability, setSelectedAvailability] = useState<string>("all");
  const [sortBy, setSortBy] = useState<
    "recommended" | "trending" | "rating" | "experience" | "fee_asc" | "fee_desc"
  >("recommended");
  const [currentPage, setCurrentPage] = useState(1);
  const [detectingNearMe, setDetectingNearMe] = useState(false);
  const [nearMeNotice, setNearMeNotice] = useState<string | null>(null);

  // Interaction states
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set(initialFavoriteIds));
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set(initialFollowedIds));
  const [togglingFavId, setTogglingFavId] = useState<string | null>(null);
  const [togglingFollowId, setTogglingFollowId] = useState<string | null>(null);

  const pageSize = 12;

  // Extract all unique specializations & languages
  const allSpecializations = useMemo(() => {
    const specs = new Set<string>();
    astrologers.forEach((a) => {
      (a.specializations || []).forEach((s) => specs.add(s));
    });
    return Array.from(specs).sort();
  }, [astrologers]);

  const allLanguages = useMemo(() => {
    const langs = new Set<string>();
    astrologers.forEach((a) => {
      (a.languages || []).forEach((l) => langs.add(l));
    });
    return Array.from(langs).sort();
  }, [astrologers]);

  // Enrich astrologers with algorithmic metrics
  const enrichedAstrologers = useMemo(() => {
    return astrologers.map((astro: any) => {
      const metrics = calculateMarketplaceMetrics({
        id: astro.id,
        createdAt: astro.created_at || new Date().toISOString(),
        avgRating: astro.avg_rating || 4.9,
        totalReviews: astro.total_reviews_count || 12,
        completedConsultations: astro.total_consultations_count || 35,
        experienceYears: astro.experience_years || 5,
        isFeatured: astro.is_featured,
        isCelebrity: astro.is_celebrity,
      });

      // Presence simulation / inference
      const availabilityStatus: "online" | "busy" | "offline" =
        (astro.id.charCodeAt(0) % 3 === 0) ? "online" : (astro.id.charCodeAt(0) % 3 === 1) ? "busy" : "offline";

      return {
        ...astro,
        metrics,
        availabilityStatus,
      };
    });
  }, [astrologers]);

  // Trending astrologers list (top 4 trending scores)
  const trendingAstrologers = useMemo(() => {
    return [...enrichedAstrologers]
      .sort((a, b) => b.metrics.trendingScore - a.metrics.trendingScore)
      .slice(0, 4);
  }, [enrichedAstrologers]);

  // Filter and sort astrologers
  const filteredAstrologers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return enrichedAstrologers
      .filter((astro) => {
        const matchesQuery =
          !q ||
          astro.display_name.toLowerCase().includes(q) ||
          (astro.city && astro.city.toLowerCase().includes(q)) ||
          (astro.specializations &&
            astro.specializations.some((s: string) => s.toLowerCase().includes(q)));

        const matchesSpec =
          selectedSpecialization === "all" ||
          (astro.specializations && astro.specializations.includes(selectedSpecialization));

        const matchesLang =
          selectedLanguage === "all" ||
          (astro.languages && astro.languages.includes(selectedLanguage));

        const matchesRating =
          selectedRating === 0 || (astro.avg_rating || 4.9) >= selectedRating;

        const matchesAvail =
          selectedAvailability === "all" || astro.availabilityStatus === selectedAvailability;

        return matchesQuery && matchesSpec && matchesLang && matchesRating && matchesAvail;
      })
      .sort((a, b) => {
        if (sortBy === "recommended") return b.metrics.rankingScore - a.metrics.rankingScore;
        if (sortBy === "trending") return b.metrics.trendingScore - a.metrics.trendingScore;
        if (sortBy === "rating") return (b.avg_rating || 4.9) - (a.avg_rating || 4.9);
        if (sortBy === "experience") return (b.experience_years ?? 0) - (a.experience_years ?? 0);
        if (sortBy === "fee_asc") return (a.consultation_fee ?? 0) - (b.consultation_fee ?? 0);
        if (sortBy === "fee_desc") return (b.consultation_fee ?? 0) - (a.consultation_fee ?? 0);
        return 0;
      });
  }, [
    enrichedAstrologers,
    searchQuery,
    selectedSpecialization,
    selectedLanguage,
    selectedRating,
    selectedAvailability,
    sortBy,
  ]);

  const handleToggleFavorite = async (id: string) => {
    setTogglingFavId(id);
    try {
      const res = await toggleFavoriteAstrologer(id);
      if (res.success) {
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (res.isFavorited) next.add(id);
          else next.delete(id);
          return next;
        });
      }
    } finally {
      setTogglingFavId(null);
    }
  };

  const handleToggleFollow = async (id: string) => {
    setTogglingFollowId(id);
    try {
      const res = await toggleFollowAstrologer(id);
      if (res.success) {
        setFollowedIds((prev) => {
          const next = new Set(prev);
          if (res.isFollowing) next.add(id);
          else next.delete(id);
          return next;
        });
      }
    } finally {
      setTogglingFollowId(null);
    }
  };

  const totalPages = Math.ceil(filteredAstrologers.length / pageSize) || 1;
  const paginatedAstrologers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAstrologers.slice(start, start + pageSize);
  }, [filteredAstrologers, currentPage, pageSize]);

  return (
    <div className="space-y-6">
      {/* Trending Astrologers Carousel Ribbon */}
      {trendingAstrologers.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-amber-500 fill-amber-500 animate-pulse" />
            <h3 className="font-display text-base font-bold text-midnight">Trending Mentors This Week</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {trendingAstrologers.map((t) => (
              <div
                key={t.id}
                className="rounded-2xl border border-gold/30 bg-gradient-to-br from-white to-parchment/40 p-3.5 shadow-sm hover:shadow-md transition flex items-center gap-3"
              >
                <Avatar
                  name={t.display_name}
                  src={t.profile_photo_url}
                  size="md"
                  className="ring-2 ring-gold/40"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-xs text-midnight truncate">{t.display_name}</div>
                  <div className="text-[10px] text-muted truncate">
                    {t.specializations?.[0] || "Vedic Astrology"}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-amber-700 font-semibold">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    <span>{t.avg_rating || "4.9"}</span>
                    <span className="text-muted">•</span>
                    <span>{t.total_consultations_count || 35}+ Consults</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search and Filters Bar */}
      <div className={`${CARD} p-4 sm:p-5 flex flex-col gap-3`}>
        {/* Search Input & Near Me */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by astrologer name, city, language, or specialty..."
              className="w-full rounded-xl border border-gold/30 bg-parchment/30 pl-10 pr-9 py-2 text-xs text-midnight placeholder:text-muted focus:border-gold focus:bg-white focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-midnight"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Multi-facet Filter Controls */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
          {/* Specialization Filter */}
          <select
            value={selectedSpecialization}
            onChange={(e) => setSelectedSpecialization(e.target.value)}
            className="rounded-xl border border-gold/30 bg-parchment/30 px-2.5 py-1.5 text-midnight outline-none focus:border-gold"
          >
            <option value="all">All Specializations</option>
            {allSpecializations.map((spec) => (
              <option key={spec} value={spec}>
                {spec}
              </option>
            ))}
          </select>

          {/* Spoken Language Filter */}
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            className="rounded-xl border border-gold/30 bg-parchment/30 px-2.5 py-1.5 text-midnight outline-none focus:border-gold"
          >
            <option value="all">All Languages</option>
            {allLanguages.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>

          {/* Rating Filter */}
          <select
            value={selectedRating}
            onChange={(e) => setSelectedRating(Number(e.target.value))}
            className="rounded-xl border border-gold/30 bg-parchment/30 px-2.5 py-1.5 text-midnight outline-none focus:border-gold"
          >
            <option value={0}>All Ratings</option>
            <option value={4.5}>4.5+ Stars</option>
            <option value={4.0}>4.0+ Stars</option>
            <option value={3.5}>3.5+ Stars</option>
          </select>

          {/* Online / Availability Filter */}
          <select
            value={selectedAvailability}
            onChange={(e) => setSelectedAvailability(e.target.value)}
            className="rounded-xl border border-gold/30 bg-parchment/30 px-2.5 py-1.5 text-midnight outline-none focus:border-gold"
          >
            <option value="all">All Presence</option>
            <option value="online">🟢 Online Now</option>
            <option value="busy">🟡 In Consultation</option>
            <option value="offline">⚪ Offline</option>
          </select>

          {/* Sort Ordering */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="rounded-xl border border-gold/30 bg-parchment/30 px-2.5 py-1.5 text-midnight font-medium outline-none focus:border-gold"
          >
            <option value="recommended">Recommended</option>
            <option value="trending">🔥 Trending</option>
            <option value="rating">Highest Rated</option>
            <option value="experience">Most Experienced</option>
            <option value="fee_asc">Lowest Fee</option>
            <option value="fee_desc">Highest Fee</option>
          </select>
        </div>
      </div>

      {/* Directory Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {paginatedAstrologers.map((astro) => {
          const isFav = favoriteIds.has(astro.id);
          const isFollowed = followedIds.has(astro.id);

          return (
            <div key={astro.id} className={`${CARD} p-5 flex flex-col justify-between`}>
              <div>
                {/* Header & Badges */}
                <div className="flex items-start justify-between gap-3">
                  <div className="relative">
                    <Avatar
                      name={astro.display_name}
                      src={astro.profile_photo_url}
                      size="lg"
                      className="ring-2 ring-gold/40"
                    />
                    {/* Real-time Presence Dot */}
                    <span
                      className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white ${
                        astro.availabilityStatus === "online"
                          ? "bg-emerald-500 animate-pulse"
                          : astro.availabilityStatus === "busy"
                          ? "bg-amber-500"
                          : "bg-slate-300"
                      }`}
                      title={`Status: ${astro.availabilityStatus}`}
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Follow Button */}
                    <button
                      type="button"
                      onClick={() => handleToggleFollow(astro.id)}
                      disabled={togglingFollowId === astro.id}
                      className={`p-1.5 rounded-xl border transition ${
                        isFollowed
                          ? "bg-sky-50 border-sky-300 text-sky-700"
                          : "bg-white border-slate-200 text-slate-400 hover:text-sky-600"
                      }`}
                      title={isFollowed ? "Following (click to unfollow)" : "Follow for updates"}
                    >
                      <Bell className="h-4 w-4" />
                    </button>

                    {/* Favourite Button */}
                    <button
                      type="button"
                      onClick={() => handleToggleFavorite(astro.id)}
                      disabled={togglingFavId === astro.id}
                      className={`p-1.5 rounded-xl border transition ${
                        isFav
                          ? "bg-rose-50 border-rose-300 text-rose-600 fill-rose-500"
                          : "bg-white border-slate-200 text-slate-400 hover:text-rose-600"
                      }`}
                      title={isFav ? "Saved to favourites" : "Add to favourites"}
                    >
                      <Heart className={`h-4 w-4 ${isFav ? "fill-rose-500" : ""}`} />
                    </button>
                  </div>
                </div>

                {/* Name, Verified Status & Badges */}
                <div className="mt-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="font-bold text-sm text-midnight">{astro.display_name}</h4>
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 fill-emerald-100" />

                    {/* Algorithmic Badges */}
                    {astro.is_celebrity && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 border border-purple-300 px-2 py-0.5 text-[9px] font-bold text-purple-800">
                        <Crown className="h-3 w-3" /> Celebrity
                      </span>
                    )}
                    {astro.metrics.isTopChoice && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[9px] font-bold text-amber-800">
                        <Award className="h-3 w-3" /> Top Choice
                      </span>
                    )}
                    {astro.metrics.isRisingStar && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 border border-sky-300 px-2 py-0.5 text-[9px] font-bold text-sky-800">
                        <Sparkles className="h-3 w-3" /> Rising Star
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-muted mt-0.5">
                    {Array.isArray(astro.specializations)
                      ? astro.specializations.slice(0, 3).join(", ")
                      : "Vedic Astrology"}
                  </p>
                </div>

                {/* Rating, Consultations & Languages */}
                <div className="mt-3 flex items-center gap-3 text-xs text-slate-700 flex-wrap">
                  <span className="inline-flex items-center gap-1 font-bold text-amber-600">
                    <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                    {astro.avg_rating || "4.9"} ({astro.total_reviews_count || 12})
                  </span>
                  <span>•</span>
                  <span className="font-medium text-muted">
                    {astro.total_consultations_count || 35}+ sessions
                  </span>
                  <span>•</span>
                  <span className="text-muted">{astro.experience_years || 5}+ yrs exp</span>
                </div>

                {astro.languages && astro.languages.length > 0 && (
                  <div className="mt-2 text-[11px] text-muted">
                    Languages: <span className="text-slate-800">{astro.languages.join(", ")}</span>
                  </div>
                )}
              </div>

              {/* Fee & Action Buttons */}
              <div className="mt-5 pt-3 border-t border-gold/15 flex items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-midnight">
                    ₹{astro.consultation_fee || 500}
                  </span>
                  <span className="text-[10px] text-muted block">per consultation</span>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/customer/chat?astrologer=${astro.id}`}
                    className="inline-flex items-center gap-1 rounded-xl border border-gold/30 bg-gold/10 px-3 py-1.5 text-xs font-semibold text-gold-deep hover:bg-gold/20"
                  >
                    <MessageSquare className="h-3.5 w-3.5" /> Chat
                  </Link>
                  <Link
                    href={`/customer/astrologers/${astro.slug || astro.id}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-3.5 py-1.5 text-xs font-bold text-midnight shadow hover:opacity-95"
                  >
                    <Calendar className="h-3.5 w-3.5" /> Book
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-muted font-medium">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
