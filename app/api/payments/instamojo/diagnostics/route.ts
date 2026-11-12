import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { validateInstamojoEnvironment } from "@/lib/financial/config";

export async function GET(req: NextRequest) {
  try {
    // Only authorized Super Admins may view diagnostic health status
    await requireSuperAdmin();

    const diagnostic = validateInstamojoEnvironment();

    return NextResponse.json({
      status: "ok",
      diagnostic,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Unauthorized or failed to retrieve diagnostics" },
      { status: 403 }
    );
  }
}

