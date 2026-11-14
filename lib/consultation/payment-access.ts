export function isVideoPaymentVerifiedForMode(input: {
  paymentMode: string | null | undefined;
  hasVerifiedDirectPayment: boolean;
  hasSuccessfulPlatformPayment: boolean;
}): boolean {
  if (input.paymentMode === "pay_at_drop") return true;
  if (input.paymentMode === "platform_gateway") return input.hasSuccessfulPlatformPayment;
  if (input.paymentMode === "direct_consultant") return input.hasVerifiedDirectPayment;
  return false;
}
