"use client";

import React, { useState } from "react";
import { Star, Send, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import type { ConsultationReview } from "@/lib/types/database.types";
import { submitConsultationReviewAction } from "@/app/actions/customer";
import { buttonStyles } from "@/components/astrologer/ui/Button";

interface Props {
  leadId: string;
  initialReview: ConsultationReview | null;
  astrologerName: string;
}

export function CustomerReviewForm({ leadId, initialReview, astrologerName }: Props) {
  const [review, setReview] = useState<ConsultationReview | null>(initialReview);
  const [rating, setRating] = useState<number>(initialReview?.rating || 5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string>(initialReview?.review_text || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (review) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <h4 className="text-sm font-bold text-midnight">Consultation Rating & Blessing</h4>
          </div>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`h-4 w-4 ${
                  star <= review.rating
                    ? "fill-amber-400 text-amber-500"
                    : "fill-gray-100 text-gray-300"
                }`}
              />
            ))}
          </div>
        </div>
        <p className="text-xs text-ink/80 italic bg-white/70 p-3 rounded-lg border border-emerald-100">
          &ldquo;{review.review_text || "Thank you for the guidance and astrological blessings."}&rdquo;
        </p>
        <p className="text-[11px] text-muted">
          Your feedback is published on {astrologerName}&rsquo;s verified profile.
        </p>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const res = await submitConsultationReviewAction({
      lead_id: leadId,
      rating,
      review_text: feedback,
    });

    setLoading(false);

    if (res.success && res.data) {
      setReview(res.data);
      setSuccess("Thank you! Your rating and testimonial have been recorded.");
    } else {
      setError(res.error || "Failed to submit review.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-gold/30 bg-parchment/30 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-midnight flex items-center gap-2">
            <Star className="h-4 w-4 text-gold-deep fill-gold-deep" /> Rate Your Consultation Experience
          </h4>
          <p className="text-xs text-muted mt-0.5">
            Share authentic feedback to bless {astrologerName}&rsquo;s guidance on JyotishSetu.
          </p>
        </div>

        {/* 5-Star Interactive Selector */}
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => {
            const active = (hoverRating ?? rating) >= star;
            return (
              <button
                key={star}
                type="button"
                aria-label={`Rate ${star} star`}
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(null)}
                className="p-1 focus:outline-none transition-transform hover:scale-110"
              >
                <Star
                  className={`h-5 w-5 ${
                    active ? "fill-amber-400 text-amber-500" : "fill-gray-100 text-gray-300"
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div>
        <label htmlFor="review_feedback" className="block text-xs font-semibold text-midnight mb-1">
          Written Blessing / Testimonial (Optional)
        </label>
        <textarea
          id="review_feedback"
          rows={3}
          maxLength={1000}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder={`Describe how ${astrologerName}'s prediction or remedy guided you...`}
          className="w-full rounded-xl border border-gold/30 bg-white px-3.5 py-2.5 text-xs text-midnight placeholder:text-muted/60 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className={buttonStyles({
            variant: "gold",
            size: "sm",
            className: "min-w-[120px] justify-center",
          })}
        >
          {loading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Submitting...
            </>
          ) : (
            <>
              <Send className="h-3.5 w-3.5" /> Submit Review
            </>
          )}
        </button>
      </div>
    </form>
  );
}
