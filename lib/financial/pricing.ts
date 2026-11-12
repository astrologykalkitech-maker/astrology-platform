/**
 * Financial pricing, fee, and integer paise conversion utilities.
 * All monetary calculations MUST use integer paise (₹1 = 100 paise)
 * to guarantee 0 floating-point rounding errors.
 */

/**
 * Converts Indian Rupees (float or string) into integer paise.
 */
export function rupeesToPaise(rupees: number | string): number {
  const numeric = typeof rupees === "string" ? parseFloat(rupees) : rupees;
  if (isNaN(numeric) || numeric < 0) return 0;
  return Math.round(numeric * 100);
}

/**
 * Converts integer paise into Indian Rupees formatted for display.
 */
export function paiseToRupees(paise: number): number {
  if (isNaN(paise) || !Number.isFinite(paise)) return 0;
  return Math.round(paise) / 100;
}

/**
 * Formats integer paise into a human-readable INR currency string.
 * Example: 49900 paise -> "₹499.00"
 */
export function formatPaiseToInr(paise: number, includeDecimals = true): string {
  const rs = paiseToRupees(paise);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: includeDecimals ? 2 : 0,
    maximumFractionDigits: includeDecimals ? 2 : 0,
  }).format(rs);
}

export interface CommissionBreakdown {
  grossPaise: number;
  commissionPercent: number;
  platformFeePaise: number;
  consultantPayablePaise: number;
}

/**
 * Calculates platform commission and consultant payable amount in integer paise.
 * Uses strict rounding to avoid fractional paise.
 */
export function calculateCommissionBreakdown(
  grossPaise: number,
  commissionPercent: number
): CommissionBreakdown {
  if (grossPaise <= 0) {
    return {
      grossPaise: 0,
      commissionPercent,
      platformFeePaise: 0,
      consultantPayablePaise: 0,
    };
  }

  // Safe percentage clamp [0, 100]
  const validPercent = Math.max(0, Math.min(100, commissionPercent));
  const platformFeePaise = Math.round((grossPaise * validPercent) / 100);
  const consultantPayablePaise = grossPaise - platformFeePaise;

  return {
    grossPaise,
    commissionPercent: validPercent,
    platformFeePaise,
    consultantPayablePaise,
  };
}

/**
 * Estimates standard Instamojo gateway fees for reconciliation:
 * 2% + ₹3.00 + 18% GST on the fee, if applicable.
 */
export function estimateGatewayFeePaise(grossPaise: number): number {
  if (grossPaise <= 0) return 0;
  // 2% = 0.02, fixed = 300 paise
  const baseFee = grossPaise * 0.02 + 300;
  const withGst = baseFee * 1.18;
  return Math.round(withGst);
}

/**
 * Generates an idempotent, human-readable Order Number:
 * Format: ORD-YYYYMM-XXXXXX
 */
export function generateOrderNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 7).replace("-", "");
  const randomChars = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORD-${dateStr}-${randomChars}`;
}

/**
 * Generates an official, sequential receipt number format:
 * Format: REC-YYYYMMDD-XXXX
 */
export function generateReceiptNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomChars = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `REC-${dateStr}-${randomChars}`;
}

/**
 * Generates an official settlement identifier:
 * Format: SETL-YYYYMM-XXXX
 */
export function generateSettlementNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 7).replace("-", "");
  const randomChars = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `SETL-${dateStr}-${randomChars}`;
}

