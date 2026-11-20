/**
 * ============================================================================
 * EXACT INTEGER PROPORTIONAL ARITHMETIC ENGINE
 * Phase 2.1 - Phase 2.3: Elimination of Floating-Point Drift in Refunds & Commissions
 * ============================================================================
 *
 * Requirements:
 * - Pure integer arithmetic using BigInt for monetary computations.
 * - Non-negative validation for all amounts.
 * - Astrologer Share + Platform Commission === Total Refund Amount exactly.
 * - Cumulative-target allocation:
 *     currentAstro = newCumulativeAstroTarget - priorRefundedAstro
 *     currentFee = currentRefund - currentAstro
 * - Prevents cumulative rounding drift across multiple partial refunds.
 * - Ensures final refund reconciles remaining balance with zero residue.
 * - Guarantees that neither cumulative allocation ever exceeds original allocation.
 * - Safe handling of large monetary figures up to and beyond MAX_SAFE_INTEGER.
 */

export interface ProportionalRefundSplit {
  refundAmountPaise: bigint;
  astrologerRefundSharePaise: bigint;
  platformFeeRefundSharePaise: bigint;
}

export interface RefundHistorySnapshot {
  originalTotalPaise: bigint;
  originalAstroSharePaise: bigint;
  originalFeeSharePaise: bigint;
  priorRefundedTotalPaise: bigint;
  priorRefundedAstroSharePaise: bigint;
  priorRefundedFeeSharePaise: bigint;
}

/**
 * Calculates the exact integer proportional split for a refund.
 * Invariant: astrologerRefundSharePaise + platformFeeRefundSharePaise === refundAmountPaise
 */
export function calculateExactProportionalRefund(
  refundAmount: number | bigint | string,
  totalSettledAmount: number | bigint | string,
  settledAstroShare: number | bigint | string
): ProportionalRefundSplit {
  const refundPaise = BigInt(refundAmount);
  const totalPaise = BigInt(totalSettledAmount);
  const astroSharePaise = BigInt(settledAstroShare);

  if (refundPaise <= BigInt(0)) {
    throw new Error("Refund amount must be a positive integer in paise.");
  }
  if (totalPaise <= BigInt(0)) {
    throw new Error("Total settled amount must be a positive integer in paise.");
  }
  if (refundPaise > totalPaise) {
    throw new Error(`Refund amount (${refundPaise}) cannot exceed total settled amount (${totalPaise}).`);
  }
  if (astroSharePaise < BigInt(0) || astroSharePaise > totalPaise) {
    throw new Error("Settled astrologer share must be between 0 and total settled amount.");
  }

  // Exact integer proportional calculation using integer truncation
  // (refund * astroShare) / total
  const astroRefund = (refundPaise * astroSharePaise) / totalPaise;
  // Remainder allocation ensures zero rounding discrepancy: Fee = Refund - Astro
  const feeRefund = refundPaise - astroRefund;

  return {
    refundAmountPaise: refundPaise,
    astrologerRefundSharePaise: astroRefund,
    platformFeeRefundSharePaise: feeRefund,
  };
}

/**
 * Calculates a progressive partial refund accounting for prior refunds using
 * cumulative-target proportional allocation:
 * 
 * 1. newCumulativeRefund = priorRefundedTotal + currentRefund
 * 2. newCumulativeAstroTarget = (newCumulativeRefund * origAstro) / origTotal
 * 3. currentAstro = newCumulativeAstroTarget - priorRefundedAstro
 * 4. currentFee = currentRefund - currentAstro
 * 
 * On the final refund (when priorRefundedTotal + currentRefund === origTotal),
 * it dynamically reconciles exact remaining shares so no penny is lost or duplicated.
 */
export function calculateReconciledProgressiveRefund(
  currentRefundAmount: number | bigint | string,
  history: {
    originalTotalPaise: number | bigint | string;
    originalAstroSharePaise: number | bigint | string;
    originalFeeSharePaise: number | bigint | string;
    priorRefundedTotalPaise: number | bigint | string;
    priorRefundedAstroSharePaise: number | bigint | string;
    priorRefundedFeeSharePaise: number | bigint | string;
  }
): ProportionalRefundSplit {
  const currentRefund = BigInt(currentRefundAmount);
  const origTotal = BigInt(history.originalTotalPaise);
  const origAstro = BigInt(history.originalAstroSharePaise);
  const origFee = BigInt(history.originalFeeSharePaise);

  const priorTotal = BigInt(history.priorRefundedTotalPaise);
  const priorAstro = BigInt(history.priorRefundedAstroSharePaise);
  const priorFee = BigInt(history.priorRefundedFeeSharePaise);

  if (currentRefund <= BigInt(0)) {
    throw new Error("Current refund amount must be positive.");
  }
  if (origTotal <= BigInt(0)) {
    throw new Error("Original total amount must be positive.");
  }
  if (origAstro < BigInt(0) || origAstro > origTotal) {
    throw new Error("Original astrologer share must be between 0 and original total.");
  }
  if (origAstro + origFee !== origTotal) {
    throw new Error("Original astrologer share and fee share must sum to original total.");
  }
  if (priorTotal < BigInt(0) || priorAstro < BigInt(0) || priorFee < BigInt(0)) {
    throw new Error("Prior refunded amounts must be non-negative.");
  }
  if (priorAstro + priorFee !== priorTotal) {
    throw new Error("Prior refunded components must sum to prior refunded total.");
  }
  if (priorAstro > origAstro || priorFee > origFee) {
    throw new Error("Prior refunded shares cannot exceed original allocations.");
  }

  const remainingTotal = origTotal - priorTotal;
  if (currentRefund > remainingTotal) {
    throw new Error(`Current refund (${currentRefund}) exceeds remaining refundable amount (${remainingTotal}).`);
  }

  // If this refund exhausts the remaining total (Final Refund), reconcile exact remaining balance
  if (currentRefund === remainingTotal) {
    const finalAstro = origAstro - priorAstro;
    const finalFee = origFee - priorFee;

    // Safety assert
    if (finalAstro + finalFee !== currentRefund) {
      throw new Error("Reconciliation sanity check failed on final refund split.");
    }

    return {
      refundAmountPaise: currentRefund,
      astrologerRefundSharePaise: finalAstro,
      platformFeeRefundSharePaise: finalFee,
    };
  }

  // Cumulative-target allocation:
  const newCumulativeRefund = priorTotal + currentRefund;
  const newCumulativeAstroTarget = (newCumulativeRefund * origAstro) / origTotal;
  
  let currentAstro = newCumulativeAstroTarget - priorAstro;
  
  // Guard against non-negative constraint & bounds
  if (currentAstro < BigInt(0)) {
    currentAstro = BigInt(0);
  }
  const maxPossibleAstro = origAstro - priorAstro;
  if (currentAstro > maxPossibleAstro) {
    currentAstro = maxPossibleAstro;
  }
  if (currentAstro > currentRefund) {
    currentAstro = currentRefund;
  }

  const currentFee = currentRefund - currentAstro;

  return {
    refundAmountPaise: currentRefund,
    astrologerRefundSharePaise: currentAstro,
    platformFeeRefundSharePaise: currentFee,
  };
}
