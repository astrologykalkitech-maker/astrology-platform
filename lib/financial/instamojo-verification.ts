export interface InstamojoPaymentOrderOwner {
  entity_type: string;
  customer_id: string | null;
  astrologer_id: string | null;
}

export interface InstamojoPaymentCaller {
  userId: string;
  role: string;
  astrologerProfileId?: string | null;
}

export function isInstamojoPaymentOrderOwnedByCaller(
  order: InstamojoPaymentOrderOwner,
  caller: InstamojoPaymentCaller
): boolean {
  if (order.entity_type === "consultation") {
    return caller.role === "customer" && order.customer_id === caller.userId;
  }

  if (order.entity_type === "subscription") {
    return (
      caller.role === "astrologer" &&
      Boolean(caller.astrologerProfileId) &&
      order.astrologer_id === caller.astrologerProfileId
    );
  }

  return false;
}

export function parseInstamojoAmountPaise(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;

  const rupees = Number(match[1]);
  const paise = Number((match[2] || "").padEnd(2, "0"));
  const amountPaise = rupees * 100 + paise;

  return Number.isSafeInteger(amountPaise) ? amountPaise : null;
}

export function matchesVerifiedInstamojoPayment({
  expectedPaymentRequestId,
  expectedPaymentId,
  expectedAmountPaise,
  expectedCurrency,
  actualPaymentRequestId,
  actualPaymentId,
  actualAmount,
  actualStatus,
}: {
  expectedPaymentRequestId: string;
  expectedPaymentId: string;
  expectedAmountPaise: number;
  expectedCurrency: string;
  actualPaymentRequestId: string;
  actualPaymentId: string;
  actualAmount: unknown;
  actualStatus: string;
}): boolean {
  const actualAmountPaise = parseInstamojoAmountPaise(actualAmount);
  const status = actualStatus.trim().toLowerCase();

  return (
    expectedCurrency === "INR" &&
    Number.isSafeInteger(expectedAmountPaise) &&
    expectedAmountPaise > 0 &&
    actualPaymentRequestId === expectedPaymentRequestId &&
    actualPaymentId === expectedPaymentId &&
    actualAmountPaise === expectedAmountPaise &&
    (status === "successful" || status === "credit")
  );
}
