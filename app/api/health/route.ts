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

  // DB1 Mandatory configuration checks (fail-closed)
  const hasDb1Url = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasDb1PublishableKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const hasDb1ServiceRoleKey = Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.DB1_SUPABASE_SERVICE_ROLE_KEY
  );

  const db1Configured = hasDb1Url && hasDb1PublishableKey && hasDb1ServiceRoleKey;

  // DB2 (Admin) configuration checks:
  // If ADMIN_SUPABASE_URL or DB2_SUPABASE_URL is configured, its paired service role key must also be configured!
  const isDb2Configured = Boolean(process.env.ADMIN_SUPABASE_URL || process.env.DB2_SUPABASE_URL);
  const hasDb2Key = Boolean(
    process.env.ADMIN_SUPABASE_SERVICE_ROLE_KEY || process.env.DB2_SUPABASE_SERVICE_ROLE_KEY
  );

  // If dual DB mode is enabled, it must have complete credential pairing
  const db2PairingValid = !isDb2Configured || hasDb2Key;

  // Safe health status
  const isHealthy = db1Configured && db2PairingValid;

  return NextResponse.json(
    {
      status: isHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      uptime_seconds: uptimeSeconds,
      environment: process.env.NODE_ENV ?? "development",
      databases: {
        db1_status: db1Configured ? "configured" : "missing_mandatory_keys",
        db2_mode: isDb2Configured ? (hasDb2Key ? "isolated_paired" : "unpaired_credentials") : "shared_fallback",
      },
    },
    {
      status: isHealthy ? 200 : 503,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
