/**
 * Transparent, Explainable Marketplace Ranking Algorithm
 * Combines Bayesian rating confidence, consultation volume, experience,
 * verification badges, and activity recency without permanent dominance or paid manipulation.
 */

export interface MarketplaceAstrologerScores {
  trendingScore: number;
  rankingScore: number;
  isRisingStar: boolean;
  isTopChoice: boolean;
}

export interface AstrologerRawMetrics {
  id: string;
  createdAt: string;
  avgRating: number;
  totalReviews: number;
  completedConsultations: number;
  experienceYears: number;
  isFeatured?: boolean;
  isCelebrity?: boolean;
  verifiedCredentialsCount?: number;
}

const GLOBAL_PRIOR_RATING = 4.8;
const MIN_REVIEWS_CONFIDENCE = 5;

/**
 * Calculates Bayesian weighted rating confidence score (m = 5 reviews threshold)
 * Prevents a single 5-star review from outranking an astrologer with 100 reviews at 4.9.
 */
export function calculateBayesianRating(rating: number, count: number): number {
  if (count <= 0) return 4.0;
  return (count * rating + MIN_REVIEWS_CONFIDENCE * GLOBAL_PRIOR_RATING) / (count + MIN_REVIEWS_CONFIDENCE);
}

/**
 * Calculates marketplace algorithmic badges and normalized ranking scores.
 */
export function calculateMarketplaceMetrics(metrics: AstrologerRawMetrics): MarketplaceAstrologerScores {
  const now = Date.now();
  const createdTimestamp = new Date(metrics.createdAt).getTime();
  const accountAgeDays = Math.max(1, (now - createdTimestamp) / (1000 * 60 * 60 * 24));

  const bayesianRating = calculateBayesianRating(metrics.avgRating, metrics.totalReviews);
  const ratingScore = (bayesianRating / 5.0) * 40; // Max 40 points

  // Consultation completion volume score (diminishing logarithmic return)
  const consultationScore = Math.min(25, Math.log10(Math.max(1, metrics.completedConsultations + 1)) * 12.5); // Max 25 points

  // Professional experience score (up to 20 years considered)
  const experienceScore = Math.min(15, (metrics.experienceYears / 20) * 15); // Max 15 points

  // Verified credentials trust score
  const credentialsBonus = Math.min(10, (metrics.verifiedCredentialsCount || 0) * 5); // Max 10 points

  // Featured / editorial active boost
  const featuredBoost = metrics.isFeatured ? 10 : 0; // Max 10 points

  const rankingScore = Number(
    (ratingScore + consultationScore + experienceScore + credentialsBonus + featuredBoost).toFixed(2)
  );

  // Rising Star Badge Criteria:
  // - Joined within past 90 days
  // - Has at least 3 completed consultations
  // - Bayesian rating >= 4.5
  const isRisingStar =
    accountAgeDays <= 90 &&
    metrics.completedConsultations >= 3 &&
    bayesianRating >= 4.5 &&
    !metrics.isCelebrity;

  // Top Choice Badge Criteria:
  // - At least 10 completed consultations
  // - At least 5 genuine reviews
  // - True average rating >= 4.8
  const isTopChoice =
    metrics.completedConsultations >= 10 &&
    metrics.totalReviews >= 5 &&
    metrics.avgRating >= 4.8;

  // Trending Score Calculation:
  // Time-weighted recency score measuring consultations per account day
  const velocity = metrics.completedConsultations / Math.sqrt(accountAgeDays);
  const trendingScore = Number((velocity * 10 + bayesianRating * 5).toFixed(2));

  return {
    rankingScore,
    trendingScore,
    isRisingStar,
    isTopChoice,
  };
}

