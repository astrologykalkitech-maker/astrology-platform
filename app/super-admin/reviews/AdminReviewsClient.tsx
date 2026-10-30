"use client";

import React, { useState, useTransition } from "react";
import {
  Star,
  Eye,
  EyeOff,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
  ShieldAlert,
} from "lucide-react";
import {
  type AdminReviewItem,
  type AdminReviewsResult,
  toggleReviewPublishedAction,
  deleteReviewAction,
} from "@/app/actions/admin-reviews";

interface AdminReviewsClientProps {
  initialData: AdminReviewsResult;
}

export function AdminReviewsClient({ initialData }: AdminReviewsClientProps) {
  const [reviews, setReviews] = useState<AdminReviewItem[]>(initialData.reviews);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "hidden">("all");
  const [ratingFilter, setRatingFilter] = useState<number | 0>(0);
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleTogglePublish = (review: AdminReviewItem) => {
    setActiveReviewId(review.id);
    setActionMsg(null);
    startTransition(async () => {
      const nextState = !review.is_published;
      const res = await toggleReviewPublishedAction(review.id, nextState);
      setActiveReviewId(null);

      if (res.success) {
        setReviews((prev) =>
          prev.map((r) => (r.id === review.id ? { ...r, is_published: nextState } : r))
        );
        setActionMsg({
          type: "success",
          text: `Review from ${review.customer_name} marked as ${
            nextState ? "Published (Visible)" : "Hidden (Unpublished)"
          }.`,
        });
      } else {
        setActionMsg({ type: "error", text: res.error || "Failed to update review visibility." });
      }
    });
  };

  const handleDelete = (review: AdminReviewItem) => {
    if (!confirm(`Are you sure you want to delete the review by ${review.customer_name}?`)) {
      return;
    }

    setActiveReviewId(review.id);
    setActionMsg(null);
    startTransition(async () => {
      const res = await deleteReviewAction(review.id);
      setActiveReviewId(null);

      if (res.success) {
        setReviews((prev) => prev.filter((r) => r.id !== review.id));
        setActionMsg({
          type: "success",
          text: `Review by ${review.customer_name} permanently removed.`,
        });
      } else {
        setActionMsg({ type: "error", text: res.error || "Failed to delete review." });
      }
    });
  };

  const filteredReviews = reviews.filter((r) => {
    const matchesSearch =
      r.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.astrologer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.review_text && r.review_text.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "published" && r.is_published) ||
      (statusFilter === "hidden" && !r.is_published);

    const matchesRating = ratingFilter === 0 || r.rating === ratingFilter;

    return matchesSearch && matchesStatus && matchesRating;
  });

  return (
    <div className="space-y-6">
      {/* Top Notification Toast */}
      {actionMsg && (
        <div
          className={`flex items-center gap-2.5 p-4 rounded-xl border text-xs font-semibold ${
            actionMsg.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {actionMsg.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          )}
          <span>{actionMsg.text}</span>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-gold/25 bg-white p-5 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
            Total Reviews
          </span>
          <p className="mt-1 font-display text-2xl font-bold text-midnight">
            {reviews.length}
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
            Published Live
          </span>
          <p className="mt-1 font-display text-2xl font-bold text-emerald-900">
            {reviews.filter((r) => r.is_published).length}
          </p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
            Hidden / Moderated
          </span>
          <p className="mt-1 font-display text-2xl font-bold text-amber-900">
            {reviews.filter((r) => !r.is_published).length}
          </p>
        </div>

        <div className="rounded-2xl border border-gold/30 bg-gradient-to-br from-champagne/30 to-gold/10 p-5 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-midnight">
            Avg Rating Score
          </span>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-display text-2xl font-bold text-midnight">
              {initialData.averageRating}
            </span>
            <div className="flex text-amber-400">
              <Star className="h-4 w-4 fill-amber-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-2xl border border-gold/20 bg-white shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
          <input
            type="text"
            placeholder="Search by seeker, astrologer, or comment…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs rounded-xl border border-gold/30 bg-white pl-9 pr-3 py-2 text-midnight placeholder:text-muted focus:outline-none focus:border-gold"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-gold/10 p-1 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                statusFilter === "all"
                  ? "bg-white text-midnight shadow-xs font-bold"
                  : "text-muted hover:text-midnight"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("published")}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                statusFilter === "published"
                  ? "bg-white text-midnight shadow-xs font-bold"
                  : "text-muted hover:text-midnight"
              }`}
            >
              Published
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("hidden")}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                statusFilter === "hidden"
                  ? "bg-white text-midnight shadow-xs font-bold"
                  : "text-muted hover:text-midnight"
              }`}
            >
              Hidden
            </button>
          </div>

          {/* Rating Dropdown */}
          <select
            value={ratingFilter}
            onChange={(e) => setRatingFilter(Number(e.target.value))}
            className="text-xs rounded-xl border border-gold/30 bg-white px-3 py-2 text-midnight focus:outline-none focus:border-gold"
          >
            <option value={0}>All Star Ratings</option>
            <option value={5}>5 Stars ★★★★★</option>
            <option value={4}>4 Stars ★★★★☆</option>
            <option value={3}>3 Stars ★★★☆☆</option>
            <option value={2}>2 Stars ★★☆☆☆</option>
            <option value={1}>1 Star ★☆☆☆☆</option>
          </select>
        </div>
      </div>

      {/* Reviews Table / Feed */}
      <div className="rounded-2xl border border-gold/25 bg-white shadow-sm overflow-hidden">
        {filteredReviews.length === 0 ? (
          <div className="p-12 text-center text-xs text-muted">
            <ShieldAlert className="h-8 w-8 mx-auto text-gold-deep mb-2 opacity-60" />
            <p className="font-semibold text-midnight text-sm">No reviews found</p>
            <p className="mt-1">
              {searchQuery || statusFilter !== "all" || ratingFilter !== 0
                ? "Try adjusting your search criteria or rating filters."
                : "No customer consultation reviews have been submitted yet."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gold/10">
            {filteredReviews.map((r) => {
              const isBusy = isPending && activeReviewId === r.id;
              return (
                <div
                  key={r.id}
                  className={`p-5 transition-colors ${
                    !r.is_published ? "bg-amber-50/30" : "hover:bg-parchment/20"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    {/* Left: Review Content */}
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        {/* Rating Stars */}
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`h-4 w-4 ${
                                star <= r.rating
                                  ? "fill-amber-400 text-amber-400"
                                  : "fill-slate-200 text-slate-200"
                              }`}
                            />
                          ))}
                        </div>

                        {/* Status Badge */}
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            r.is_published
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {r.is_published ? "Live on Platform" : "Hidden from Public"}
                        </span>

                        <span className="text-[11px] text-muted">
                          {new Date(r.created_at).toLocaleDateString([], {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>

                      {/* Comment */}
                      <p className="text-xs text-ink/90 leading-relaxed font-serif italic">
                        {r.review_text ? `"${r.review_text}"` : "(No written commentary submitted)"}
                      </p>

                      {/* Participant Details */}
                      <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted pt-1">
                        <div>
                          <span className="font-semibold text-midnight">Seeker:</span>{" "}
                          <span>{r.customer_name}</span>
                        </div>
                        <span className="text-gold/40">•</span>
                        <div>
                          <span className="font-semibold text-midnight">Astrologer:</span>{" "}
                          <span className="text-gold-deep font-medium">{r.astrologer_name}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 self-start sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleTogglePublish(r)}
                        disabled={isBusy}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs ${
                          r.is_published
                            ? "border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                            : "border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                        } disabled:opacity-50`}
                      >
                        {isBusy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : r.is_published ? (
                          <>
                            <EyeOff className="h-3.5 w-3.5" />
                            <span>Hide Review</span>
                          </>
                        ) : (
                          <>
                            <Eye className="h-3.5 w-3.5" />
                            <span>Publish Live</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(r)}
                        disabled={isBusy}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50 cursor-pointer"
                        title="Delete Review Permanently"
                        aria-label="Delete review"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
