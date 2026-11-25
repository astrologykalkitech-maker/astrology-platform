import React from "react";
import Link from "next/link";
import { ArrowLeft, Star, MessageSquareQuote, CheckCircle2 } from "lucide-react";
import { requireAstrologerPage } from "@/lib/astrologer/guard";
import { getAstrologerReviewsAction } from "@/app/actions/astrologer-portal";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { formatExactDateTime } from "@/lib/astrologer/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Client Reviews & Ratings | Karmic Ascension",
  description: "View verified client feedback, ratings, and testimonials.",
};

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

export default async function AstrologerReviewsPage() {
  const [, res] = await Promise.all([
    requireAstrologerPage(),
    getAstrologerReviewsAction(),
  ]);
  const data = res.success && res.data ? res.data : { reviews: [], averageRating: 0.0, totalReviews: 0 };

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Link
          href="/astrologer/dashboard"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gold/30 bg-white text-gold-deep hover:bg-parchment transition-colors"
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <CardTitle>Client Reviews & Feedback</CardTitle>
          <p className="text-xs text-muted">
            Ratings and reviews submitted by customers following completed consultations.
          </p>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={`${CARD} p-5 flex items-center gap-4`}>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
            <Star className="h-6 w-6 fill-amber-500" />
          </span>
          <div>
            <p className="text-xs text-muted">Average Rating</p>
            <p className="text-2xl font-bold text-midnight">
              {data.averageRating} <span className="text-xs font-normal text-muted">/ 5.0</span>
            </p>
          </div>
        </div>

        <div className={`${CARD} p-5 flex items-center gap-4`}>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep">
            <MessageSquareQuote className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs text-muted">Total Verified Reviews</p>
            <p className="text-2xl font-bold text-midnight">{data.totalReviews}</p>
          </div>
        </div>
      </div>

      {data.reviews.length === 0 ? (
        <div className={`${CARD} py-16 px-6 text-center`}>
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep mb-4">
            <Star className="h-8 w-8" />
          </span>
          <h2 className="text-lg font-semibold text-midnight">No Reviews Received Yet</h2>
          <p className="text-xs text-muted max-w-md mx-auto mt-1 mb-6">
            When you complete consultation enquiries or scheduled Muhurat sessions, customers are invited to share their ratings and reviews here.
          </p>
          <Link
            href="/astrologer/leads"
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-4 py-2 text-xs font-semibold text-midnight shadow"
          >
            Provide Predictions on Leads
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {data.reviews.map((rev) => (
            <div key={rev.id} className={`${CARD} p-5 space-y-3`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-midnight">
                    {rev.customer_name || "Verified Client"}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-800 rounded-full px-2 py-0.5">
                    <CheckCircle2 className="h-3 w-3" /> Verified Consultation
                  </span>
                </div>
                <div className="flex items-center gap-1 text-amber-500">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${i < rev.rating ? "fill-amber-400 text-amber-400" : "text-gray-300"}`}
                    />
                  ))}
                </div>
              </div>

              {rev.review_text && (
                <p className="text-xs text-ink/90 leading-relaxed bg-parchment/40 p-3 rounded-xl border border-line">
                  &ldquo;{rev.review_text}&rdquo;
                </p>
              )}

              <p className="text-[11px] text-muted text-right">
                Reviewed on {formatExactDateTime(rev.created_at)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
