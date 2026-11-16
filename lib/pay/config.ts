import { JyotishGatewayConfig } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";

export function getJyotishPayConfig(): JyotishGatewayConfig {
  const mode = (process.env.JYOTISH_PAY_MODE || process.env.PAYMENT_GATEWAY_MODE || "sandbox").toLowerCase() as "sandbox" | "live";
  
  return {
    mode,
    merchantVpa: (process.env.JYOTISH_PAY_VPA || process.env.NEXT_PUBLIC_JYOTISH_PAY_VPA || "jyotishsetu@upi").trim(),
    merchantName: (process.env.JYOTISH_PAY_MERCHANT_NAME || "JyotishSetu Astrology Services").trim(),
    merchantCode: (process.env.JYOTISH_PAY_MCC || "8299").trim(), // 8299/8999 for Merchant, 0000 for Personal
    appBaseUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
    webhookSecret: (process.env.JYOTISH_PAY_WEBHOOK_SECRET || "").trim(),
    autoApproveSandbox: mode === "sandbox",
  };
}

/**
 * Gets live dynamic payment configuration including custom VPA overrides set by Super Admin.
 */
export async function getLivePaymentRuntimeConfig() {
  const baseConfig = getJyotishPayConfig();
  try {
    const supabase = await createAdminClient("main");
    const { data: vpaSetting } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "payment_upi_vpa")
      .maybeSingle();

    const { data: nameSetting } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "payment_merchant_name")
      .maybeSingle();

    const { data: mccSetting } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "payment_merchant_code")
      .maybeSingle();

    return {
      ...baseConfig,
      merchantVpa: typeof vpaSetting?.value === "string" && vpaSetting.value.trim() ? vpaSetting.value.trim() : baseConfig.merchantVpa,
      merchantName: typeof nameSetting?.value === "string" && nameSetting.value.trim() ? nameSetting.value.trim() : baseConfig.merchantName,
      merchantCode: typeof mccSetting?.value === "string" && mccSetting.value.trim() ? mccSetting.value.trim() : baseConfig.merchantCode,
    };
  } catch (e) {
    return baseConfig;
  }
}

/**
 * Checks whether Super Admin has enabled zero-cost payment testing mode.
 * Evaluates live database platform_settings first with fallback to environment.
 */
export async function isPaymentTestingModeEnabled(): Promise<boolean> {
  try {
    const supabase = await createAdminClient("main");
    const { data } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "payment_testing_mode_enabled")
      .maybeSingle();

    if (data && typeof data.value === "boolean") {
      return data.value;
    }
  } catch (e) {
    // fallback
  }

  // Fallback to environment configuration
  const config = getJyotishPayConfig();
  return config.mode === "sandbox";
}

