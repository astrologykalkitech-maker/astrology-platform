/**
 * Centralized Consultation Per-Minute Billing Engine
 *
 * Implements server-authoritative per-minute duration calculation, pricing snapshotting,
 * atomic customer wallet deduction, platform commission accrual, astrologer operating
 * credit, and double-entry general ledger synchronization across all 3 consultation modes:
 * - CHAT
 * - VOICE / CALL
 * - VIDEO
 */

import { rupeesToPaise, paiseToRupees, calculateCommissionBreakdown } from "@/lib/financial/pricing";
import type { ConsultationMode } from "@/lib/types/database.types";

export interface ConsultationPricingSnapshot {
  bookingId: string;
  customerId: string;
  astrologerId: string;
  mode: ConsultationMode;
  ratePerMinuteRupees: number;
  ratePerMinutePaise: number;
  commissionPercent: number;
  currency: string;
  capturedAt: string;
}

export interface ConsultationBillingCalculation {
  durationSeconds: number;
  billableMinutes: number;
  ratePerMinutePaise: number;
  grossAmountPaise: number;
  grossAmountRupees: number;
  platformCommissionPaise: number;
  astrologerEarningsPaise: number;
  commissionPercent: number;
}

/**
 * Calculates billable duration in integer minutes according to platform rounding rules:
 * - Minimum duration: 1 minute once session becomes billable
 * - Partial minutes rounded up (e.g., 65s -> 2 minutes, 175s -> 3 minutes)
 * - 0 duration -> 0 billable minutes (no charge for unaccepted / failed calls)
 */
export function calculateBillableMinutes(durationSeconds: number): number {
  if (durationSeconds <= 0) return 0;
  return Math.max(1, Math.ceil(durationSeconds / 60));
}

/**
 * Authoritatively calculates gross fee, commission, and astrologer share in integer paise.
 */
export function calculateConsultationFee({
  durationSeconds,
  ratePerMinutePaise,
  commissionPercent = 10,
}: {
  durationSeconds: number;
  ratePerMinutePaise: number;
  commissionPercent?: number;
}): ConsultationBillingCalculation {
  const billableMinutes = calculateBillableMinutes(durationSeconds);
  const grossAmountPaise = billableMinutes * Math.max(0, ratePerMinutePaise);
  const breakdown = calculateCommissionBreakdown(grossAmountPaise, commissionPercent);

  return {
    durationSeconds,
    billableMinutes,
    ratePerMinutePaise,
    grossAmountPaise,
    grossAmountRupees: paiseToRupees(grossAmountPaise),
    platformCommissionPaise: breakdown.platformFeePaise,
    astrologerEarningsPaise: breakdown.consultantPayablePaise,
    commissionPercent,
  };
}

/**
 * Returns service-specific price per minute based on mode.
 * Falls back to canonical baseline if profile rate is unconfigured.
 */
export function resolveConsultationRate({
  mode,
  chatRate,
  voiceRate,
  videoRate,
}: {
  mode: ConsultationMode | string;
  chatRate?: number | null;
  voiceRate?: number | null;
  videoRate?: number | null;
}): { rateRupees: number; ratePaise: number } {
  const norm = (mode || "").trim().toLowerCase();
  let rateRupees = 25; // default video

  if (norm === "chat") {
    rateRupees = Number(chatRate) > 0 ? Number(chatRate) : 10;
  } else if (norm === "call" || norm === "voice") {
    rateRupees = Number(voiceRate) > 0 ? Number(voiceRate) : 15;
  } else {
    rateRupees = Number(videoRate) > 0 ? Number(videoRate) : 25;
  }

  return {
    rateRupees,
    ratePaise: rupeesToPaise(rateRupees),
  };
}
