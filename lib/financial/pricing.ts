/**
 * Financial pricing, fee, and integer paise conversion utilities.
 * All monetary calculations MUST use integer paise (₹1 = 100 paise)
 * to guarantee 0 floating-point rounding errors.
 */

/**
 * Authoritative financial limits for wallet recharges across both
 * Customer Consultation Wallets and Astrologer Operating Wallets.
 */
export const WALLET_RECHARGE_LIMITS = {
  MIN_RUPEES: 10,
  MAX_RUPEES: 100000,
  MIN_PAISE: 1000, // ₹10 = 1,000 paise
  MAX_PAISE: 10000000, // ₹1,00,000 = 10,000,000 paise
  CURRENCY: "INR" as const,
} as const;

export interface ValidationSuccess {
  isValid: true;
  amountPaise: number;
  amountRupees: number;
}

export interface ValidationFailure {
  isValid: false;
  error: string;
}

export type AmountValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Validates a wallet recharge input amount strictly against financial and business invariants:
 * - Must be non-empty, finite numeric value or well-formed decimal string
 * - At most 2 decimal places (exact paise resolution)
 * - Must lie within [WALLET_RECHARGE_LIMITS.MIN_RUPEES, WALLET_RECHARGE_LIMITS.MAX_RUPEES]
 * - Converts exactly to integer paise without floating-point inaccuracy
 */
export function validateRechargeAmount(input: unknown): AmountValidationResult {
  if (input === null || input === undefined || input === "") {
    return { isValid: false, error: "Recharge amount is required." };
  }

  // Reject unexpected complex types
  if (typeof input !== "number" && typeof input !== "string") {
    return { isValid: false, error: "Invalid amount format. Must be a numeric value." };
  }

  let strVal: string;
  let numVal: number;

  if (typeof input === "number") {
    if (!Number.isFinite(input) || Number.isNaN(input)) {
      return { isValid: false, error: "Amount must be a valid finite number." };
    }
    numVal = input;
    // Format to string to inspect decimal places accurately
    strVal = input.toString();
  } else {
    strVal = input.trim();
    if (!/^-?\d+(\.\d+)?$/.test(strVal)) {
      return { isValid: false, error: "Amount must be a valid numeric string." };
    }
    numVal = Number(strVal);
    if (!Number.isFinite(numVal) || Number.isNaN(numVal)) {
      return { isValid: false, error: "Amount must be a valid finite number." };
    }
  }

  // Check positivity
  if (numVal <= 0) {
    return { isValid: false, error: "Recharge amount must be greater than zero." };
  }

  // Check decimal places: at most 2 decimal places allowed (rupees and paise)
  const parts = strVal.split(".");
  if (parts.length > 1 && parts[1].length > 2) {
    return {
      isValid: false,
      error: "Amount cannot have more than 2 decimal places (fractional paise are not permitted).",
    };
  }

  // Exact conversion to integer paise using BigInt intermediate arithmetic
  let paiseBigInt: bigint;
  try {
    const rupeesBigInt = BigInt(parts[0]);
    const fractionStr = parts.length > 1 ? parts[1].padEnd(2, "0") : "00";
    const fractionBigInt = BigInt(fractionStr);
    paiseBigInt = rupeesBigInt * BigInt(100) + fractionBigInt;
  } catch {
    return { isValid: false, error: "Amount contains invalid numeric characters." };
  }

  // Enforce configured range using BigInt comparisons
  const minPaiseBigInt = BigInt(WALLET_RECHARGE_LIMITS.MIN_PAISE);
  const maxPaiseBigInt = BigInt(WALLET_RECHARGE_LIMITS.MAX_PAISE);

  if (paiseBigInt < minPaiseBigInt) {
    return {
      isValid: false,
      error: `Minimum recharge amount is ₹${WALLET_RECHARGE_LIMITS.MIN_RUPEES}.`,
    };
  }

  if (paiseBigInt > maxPaiseBigInt) {
    return {
      isValid: false,
      error: `Maximum single recharge amount is ₹${WALLET_RECHARGE_LIMITS.MAX_RUPEES.toLocaleString("en-IN")}.`,
    };
  }

  // Safe integer check before converting BigInt to JavaScript number
  if (paiseBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
    return { isValid: false, error: "Calculated amount exceeds safe integer limits." };
  }

  const paise = Number(paiseBigInt);

  return {
    isValid: true,
    amountPaise: paise,
    amountRupees: paise / 100,
  };
}

/**
 * Converts Indian Rupees (float or string) into integer paise.
 * For strict validation, use validateRechargeAmount().
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

