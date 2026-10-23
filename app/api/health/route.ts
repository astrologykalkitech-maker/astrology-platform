import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const uptimeSeconds = Math.floor(process.uptime());

  // Fail-closed checks on critical runtime environment
  const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasAnonKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  const isHealthy = hasSupabaseUrl && hasAnonKey;

  return NextResponse.json(
    {
      status: isHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      uptime_seconds: uptimeSeconds,
      environment: process.env.NODE_ENV ?? "development",
      checks: {
        supabase_url: hasSupabaseUrl ? "configured" : "missing",
        public_publishable_key: hasAnonKey ? "configured" : "missing",
        service_role_key: hasServiceKey ? "configured" : "missing",
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
