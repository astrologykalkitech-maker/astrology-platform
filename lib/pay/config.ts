import { JyotishGatewayConfig } from "./types";

export function getJyotishPayConfig(): JyotishGatewayConfig {
  const mode = (process.env.JYOTISH_PAY_MODE || process.env.PAYMENT_GATEWAY_MODE || "sandbox").toLowerCase() as "sandbox" | "live";
  
  return {
    mode,
    merchantVpa: process.env.JYOTISH_PAY_VPA || "jyotishsetu@upi",
    merchantName: process.env.JYOTISH_PAY_MERCHANT_NAME || "JyotishSetu Astrology Services",
    merchantCode: process.env.JYOTISH_PAY_MCC || "8299", // Astrological / Educational / Consultation services
    appBaseUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
    webhookSecret: process.env.JYOTISH_PAY_WEBHOOK_SECRET || "jsp_secret_dev_key_secure_2026",
    autoApproveSandbox: mode === "sandbox",
  };
}
