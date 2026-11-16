import type { BookingStatus, UserRole } from "@/lib/types/database.types";

export type DirectConsultationPaymentStatus =
  | "pending"
  | "verified"
  | "rejected"
  | "refunded"
  | "failed";

export function normalizeDirectPaymentUtr(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9-]{8,20}$/.test(normalized) ? normalized : null;
}

export function canReviewDirectPayment({
  role,
  adminUserId,
  customerId,
  astrologerUserId,
}: {
  role: UserRole;
  adminUserId: string;
  customerId: string;
  astrologerUserId: string | null;
}): boolean {
  return (
    role === "super_admin" &&
    adminUserId !== customerId &&
    adminUserId !== astrologerUserId
  );
}

export function isEligibleForDirectCommission({
  bookingStatus,
  paymentStatus,
  paymentMode,
  hasSuccessfulGatewayPayment,
  transactionType = "consultation",
}: {
  bookingStatus: BookingStatus;
  paymentStatus: DirectConsultationPaymentStatus;
  paymentMode: string | null;
  hasSuccessfulGatewayPayment: boolean;
  transactionType?: "consultation" | "lead_purchase" | "subscription";
}): boolean {
  return (
    transactionType === "consultation" &&
    bookingStatus === "completed" &&
    paymentStatus === "verified" &&
    (paymentMode === "direct_consultant" || paymentMode === "pay_at_drop") &&
    !hasSuccessfulGatewayPayment
  );
}

export function calculateCommissionPaise(amountPaise: number, ratePercent: number): number {
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 0) {
    throw new RangeError("Commission amount must be a non-negative integer number of paise.");
  }
  if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) {
    throw new RangeError("Commission rate must be between 0 and 100 percent.");
  }
  return Math.round((amountPaise * ratePercent) / 100);
}

export function directCommissionIdempotencyKey(paymentId: string): string {
  return `DIRECT_CONSULTATION_COMMISSION_${paymentId}`;
}

export function directCommissionRefundIdempotencyKey(paymentId: string): string {
  return `DIRECT_CONSULTATION_REFUND_${paymentId}`;
}
