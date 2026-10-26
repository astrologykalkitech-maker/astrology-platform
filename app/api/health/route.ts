import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Liveness + basic readiness check.
 * Returns 200 (healthy) only when all mandatory runtime configuration is present.
 * Returns 503 (degraded) when any mandatory variable is missing.
 *
 * Security: Does NOT reveal which specific keys are present or missing.
 * Does NOT expose version strings, database connection details, or secrets.
 */
export async function GET() {
  const uptimeSeconds = Math.floor(process.uptime());

  // Mandatory configuration checks (fail-closed)
  const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasPublishableKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const hasServiceRoleKey = Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.DB1_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.ADMIN_SUPABASE_SERVICE_ROLE_KEY
  );

  // All three are mandatory for the application to operate safely
  const isHealthy = hasSupabaseUrl && hasPublishableKey && hasServiceRoleKey;

  // Count how many mandatory checks pass (without disclosing which)
  const passedChecks = [hasSupabaseUrl, hasPublishableKey, hasServiceRoleKey].filter(Boolean).length;
  const totalChecks = 3;

  return NextResponse.json(
    {
      status: isHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      uptime_seconds: uptimeSeconds,
      environment: process.env.NODE_ENV ?? "development",
      // Report pass/fail count without identifying which secrets are present
      configuration: isHealthy
        ? "all_mandatory_checks_passed"
        : `${passedChecks}/${totalChecks}_mandatory_checks_passed`,
    },
    {
      status: isHealthy ? 200 : 503,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
