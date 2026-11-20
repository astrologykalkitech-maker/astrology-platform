export type CanonicalPaymentStatus =
  | "created"
  | "pending"
  | "successful"
  | "failed"
  | "cancelled"
  | "expired"
  | "refunded";

export function normalizePaymentStatus(value: unknown): CanonicalPaymentStatus {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (["created", "initiated"].includes(status)) return "created";
  if (["pending", "processing", "pending_verification", "requested"].includes(status)) return "pending";
  if (["successful", "succeeded", "paid", "verified", "completed", "processed", "credit"].includes(status)) {
    return "successful";
  }
  if (["failed", "failure", "rejected", "declined"].includes(status)) return "failed";
  if (["cancelled", "canceled"].includes(status)) return "cancelled";
  if (["expired"].includes(status)) return "expired";
  if (["refunded", "partially_refunded", "refund_pending"].includes(status)) return "refunded";
  return "pending";
}
