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

export function isConsultationPaymentVerified(input: {
  price?: number | null;
  paymentStatus?: string | null;
  paymentMode?: string | null;
  hasVerifiedDirectPayment?: boolean;
  hasSuccessfulPlatformOrder?: boolean;
  hasSucceededPaymentIntent?: boolean;
}): boolean {
  // Free consultations are always permitted
  if (input.price === 0 || input.paymentStatus === "completed" || input.paymentStatus === "paid") {
    return true;
  }
  // Cash on delivery / pay at drop workflow
  if (input.paymentMode === "pay_at_drop") {
    return true;
  }
  // Direct consultant payment
  if (input.paymentMode === "direct_consultant") {
    return !!input.hasVerifiedDirectPayment;
  }
  // Platform gateway payment
  if (input.paymentMode === "platform_gateway") {
    return !!input.hasSuccessfulPlatformOrder || !!input.hasSucceededPaymentIntent;
  }
  // Any verified platform payment
  return (
    !!input.hasSuccessfulPlatformOrder ||
    !!input.hasSucceededPaymentIntent ||
    !!input.hasVerifiedDirectPayment
  );
}
