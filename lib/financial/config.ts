import { z } from "zod";

export const InstamojoEnvSchema = z.object({
  INSTAMOJO_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  INSTAMOJO_API_BASE_URL: z.string().url().optional(),
  INSTAMOJO_API_KEY: z.string().min(1, "Instamojo API Key is required"),
  INSTAMOJO_AUTH_TOKEN: z.string().min(1, "Instamojo Auth Token is required"),
  INSTAMOJO_SALT: z.string().min(1, "Instamojo Private Salt is required"),
  INSTAMOJO_WEBHOOK_SECRET: z.string().min(1).optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
});

export interface SafeConfigDiagnostic {
  isValid: boolean;
  environment: "sandbox" | "production";
  resolvedBaseUrl: string;
  hasApiKey: boolean;
  hasAuthToken: boolean;
  hasSalt: boolean;
  hasWebhookConfig: boolean;
  publicSiteUrl: string;
  missingVariables: string[];
}

/**
 * Validates Instamojo configuration without ever printing or exposing secret tokens.
 */
export function validateInstamojoEnvironment(): SafeConfigDiagnostic {
  const env = process.env;
  const missing: string[] = [];

  if (!env.INSTAMOJO_API_KEY && !env.INSTAMOJO_CLIENT_ID) missing.push("INSTAMOJO_API_KEY");
  if (!env.INSTAMOJO_AUTH_TOKEN && !env.INSTAMOJO_CLIENT_SECRET) missing.push("INSTAMOJO_AUTH_TOKEN");
  if (!env.INSTAMOJO_SALT && !env.INSTAMOJO_WEBHOOK_SECRET) missing.push("INSTAMOJO_SALT");

  const isProduction = (env.INSTAMOJO_ENV || "").toLowerCase() === "production";
  const defaultEndpoint = isProduction
    ? "https://www.instamojo.com/api/1.1/"
    : "https://test.instamojo.com/api/1.1/";

  const resolvedBaseUrl = env.INSTAMOJO_API_BASE_URL || defaultEndpoint;

  return {
    isValid: missing.length === 0,
    environment: isProduction ? "production" : "sandbox",
    resolvedBaseUrl,
    hasApiKey: !missing.includes("INSTAMOJO_API_KEY"),
    hasAuthToken: !missing.includes("INSTAMOJO_AUTH_TOKEN"),
    hasSalt: !missing.includes("INSTAMOJO_SALT"),
    hasWebhookConfig: !!(env.INSTAMOJO_SALT || env.INSTAMOJO_WEBHOOK_SECRET),
    publicSiteUrl: env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
    missingVariables: missing,
  };
}

