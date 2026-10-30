"use server";

// =====================================================
// REAL-DATA ADMINISTRATIVE ANALYTICS SERVER ACTIONS
// =====================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminPermission } from "@/lib/auth/admin-guard";
import type { AuthResult } from "@/lib/types/auth.types";

export interface PlatformOverviewMetrics {
  totalLeads: number;
  leadsToday: number;
  unassignedLeads: number;
  assignedLeads: number;
  contactedLeads: number;
  convertedLeads: number;
  closedLeads: number;
  invalidLeads: number;
  duplicateLeads: number;
  platformGeneratedLeads: number;
  directLeads: number;
  pendingListings: number;
  approvedListings: number;
  changesRequestedListings: number;
  suspendedListings: number;
  totalListings: number;
  activeConsultants: number;
  totalCustomers: number;
  activeCustomers: number;
  totalBookings: number;
  pendingBookings: number;
  confirmedBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  dbConnected: boolean;
  lastRefreshedAt: string;
}

export interface QueryDiagnosticLog {
  queryName: string;
  table: string;
  targetDb: "main" | "admin";
  targetFingerprint: string;
  errorCode?: string;
  errorMessage?: string;
  correlationId: string;
}

/**
 * Derives a safe project fingerprint without exposing full URLs or sensitive host parameters.
 */
function getSafeDbFingerprint(url: string | undefined): string {
  if (!url) return "UNKNOWN";
  try {
    const u = new URL(url);
    const hostParts = u.hostname.split(".");
    return hostParts[0] + ".supabase.co";
  } catch {
    return "INVALID_URL";
  }
}

/**
 * Validates Supabase exact count query results.
 * Distinguishes genuine zero-count rows from query errors and null failures.
 * Never represents an unavailable metric as zero.
 */
export async function validateCountQueryResult(
  result: { count: number | null; error: { code?: string; message?: string } | null },
  meta: {
    queryName: string;
    table: string;
    targetDb: "main" | "admin";
    correlationId: string;
  }
): Promise<number> {
  if (result.error) {
    const targetUrl =
      meta.targetDb === "main"
        ? process.env.NEXT_PUBLIC_SUPABASE_URL
        : process.env.ADMIN_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

    const logPayload: QueryDiagnosticLog = {
      queryName: meta.queryName,
      table: meta.table,
      targetDb: meta.targetDb,
      targetFingerprint: getSafeDbFingerprint(targetUrl),
      errorCode: result.error.code,
      errorMessage: result.error.message,
      correlationId: meta.correlationId,
    };

    console.error("[SuperAdmin Analytics Query Error]", JSON.stringify(logPayload));
    throw new Error(`Query '${meta.queryName}' on table '${meta.table}' failed [${result.error.code ?? "UNKNOWN"}].`);
  }

  if (result.count === null || result.count === undefined || typeof result.count !== "number") {
    console.error(
      "[SuperAdmin Analytics Query Error]",
      JSON.stringify({
        queryName: meta.queryName,
        table: meta.table,
        targetDb: meta.targetDb,
        targetFingerprint: getSafeDbFingerprint(
          meta.targetDb === "main" ? process.env.NEXT_PUBLIC_SUPABASE_URL : process.env.ADMIN_SUPABASE_URL
        ),
        errorMessage: "Query returned null or non-numeric count",
        correlationId: meta.correlationId,
      })
    );
    throw new Error(`Query '${meta.queryName}' on table '${meta.table}' returned an invalid count.`);
  }

  return result.count;
}

/**
 * Calculates genuine platform metrics aggregated directly from database tables.
 * Every figure corresponds directly to a live PostgreSQL record count.
 */
export async function getPlatformOverviewMetrics(): Promise<AuthResult<PlatformOverviewMetrics>> {
  const correlationId = `metrics_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  try {
    await requireAdminPermission("analytics.read");

    const dbAdmin = await createAdminClient("admin");
    const dbMain = await createAdminClient("main");

    // Today's start in UTC
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const todayIso = startOfToday.toISOString();

    // Execute all queries concurrently with exact counts
    const [
      // 1. Leads Queries (DB1 - Main)
      resTotalLeads,
      resLeadsToday,
      resUnassignedLeads,
      resAssignedLeads,
      resContactedLeads,
      resConvertedLeads,
      resClosedLeads,
      resInvalidLeads,
      resDuplicateLeads,
      resPlatformLeads,
      resDirectLeads,

      // 2. Astrologer Listings Queries (DB1 - Main)
      resPendingListings,
      resApprovedListings,
      resChangesRequestedListings,
      resSuspendedListings,
      resTotalListings,

      // 3. User & Consultant Queries
      resActiveConsultants,
      resTotalCustomers,

      // 4. Bookings Queries (DB1 - Main customer_bookings)
      resTotalBookings,
      resPendingBookings,
      resConfirmedBookings,
      resCompletedBookings,
      resCancelledBookings,
    ] = await Promise.all([
      dbMain.from("leads").select("*", { count: "exact", head: true }),
      dbMain.from("leads").select("*", { count: "exact", head: true }).gte("created_at", todayIso),
      dbMain.from("leads").select("*", { count: "exact", head: true }).is("astrologer_id", null).not("status", "in", '("closed","converted","invalid")'),
      dbMain.from("leads").select("*", { count: "exact", head: true }).eq("status", "assigned"),
      dbMain.from("leads").select("*", { count: "exact", head: true }).eq("status", "contacted"),
      dbMain.from("leads").select("*", { count: "exact", head: true }).eq("status", "converted"),
      dbMain.from("leads").select("*", { count: "exact", head: true }).eq("status", "closed"),
      dbMain.from("leads").select("*", { count: "exact", head: true }).eq("status", "invalid"),
      dbMain.from("leads").select("*", { count: "exact", head: true }).eq("status", "duplicate"),
      dbMain.from("leads").select("*", { count: "exact", head: true }).eq("source_type", "platform"),
      dbMain.from("leads").select("*", { count: "exact", head: true }).eq("source_type", "direct"),

      dbMain.from("astrologer_profiles").select("*", { count: "exact", head: true }).eq("approval_status", "pending"),
      dbMain.from("astrologer_profiles").select("*", { count: "exact", head: true }).eq("approval_status", "approved"),
      dbMain.from("astrologer_profiles").select("*", { count: "exact", head: true }).eq("approval_status", "changes_requested"),
      dbMain.from("astrologer_profiles").select("*", { count: "exact", head: true }).eq("approval_status", "suspended"),
      dbMain.from("astrologer_profiles").select("*", { count: "exact", head: true }),

      dbAdmin.from("profiles").select("*", { count: "exact", head: true }).in("role", ["consultant_admin", "super_admin", "admin"]),
      dbMain.from("profiles").select("*", { count: "exact", head: true }).eq("role", "customer"),

      dbMain.from("customer_bookings").select("*", { count: "exact", head: true }),
      dbMain.from("customer_bookings").select("*", { count: "exact", head: true }).eq("status", "pending"),
      dbMain.from("customer_bookings").select("*", { count: "exact", head: true }).eq("status", "confirmed"),
      dbMain.from("customer_bookings").select("*", { count: "exact", head: true }).eq("status", "completed"),
      dbMain.from("customer_bookings").select("*", { count: "exact", head: true }).eq("status", "cancelled"),
    ]);

    // Validate each result strictly against errors and non-numeric counts
    const totalLeads = await validateCountQueryResult(resTotalLeads, { queryName: "totalLeads", table: "leads", targetDb: "main", correlationId });
    const leadsToday = await validateCountQueryResult(resLeadsToday, { queryName: "leadsToday", table: "leads", targetDb: "main", correlationId });
    const unassignedLeads = await validateCountQueryResult(resUnassignedLeads, { queryName: "unassignedLeads", table: "leads", targetDb: "main", correlationId });
    const assignedLeads = await validateCountQueryResult(resAssignedLeads, { queryName: "assignedLeads", table: "leads", targetDb: "main", correlationId });
    const contactedLeads = await validateCountQueryResult(resContactedLeads, { queryName: "contactedLeads", table: "leads", targetDb: "main", correlationId });
    const convertedLeads = await validateCountQueryResult(resConvertedLeads, { queryName: "convertedLeads", table: "leads", targetDb: "main", correlationId });
    const closedLeads = await validateCountQueryResult(resClosedLeads, { queryName: "closedLeads", table: "leads", targetDb: "main", correlationId });
    const invalidLeads = await validateCountQueryResult(resInvalidLeads, { queryName: "invalidLeads", table: "leads", targetDb: "main", correlationId });
    const duplicateLeads = await validateCountQueryResult(resDuplicateLeads, { queryName: "duplicateLeads", table: "leads", targetDb: "main", correlationId });
    const platformGeneratedLeads = await validateCountQueryResult(resPlatformLeads, { queryName: "platformGeneratedLeads", table: "leads", targetDb: "main", correlationId });
    const directLeads = await validateCountQueryResult(resDirectLeads, { queryName: "directLeads", table: "leads", targetDb: "main", correlationId });

    const pendingListings = await validateCountQueryResult(resPendingListings, { queryName: "pendingListings", table: "astrologer_profiles", targetDb: "main", correlationId });
    const approvedListings = await validateCountQueryResult(resApprovedListings, { queryName: "approvedListings", table: "astrologer_profiles", targetDb: "main", correlationId });
    const changesRequestedListings = await validateCountQueryResult(resChangesRequestedListings, { queryName: "changesRequestedListings", table: "astrologer_profiles", targetDb: "main", correlationId });
    const suspendedListings = await validateCountQueryResult(resSuspendedListings, { queryName: "suspendedListings", table: "astrologer_profiles", targetDb: "main", correlationId });
    const totalListings = await validateCountQueryResult(resTotalListings, { queryName: "totalListings", table: "astrologer_profiles", targetDb: "main", correlationId });

    const activeConsultants = await validateCountQueryResult(resActiveConsultants, { queryName: "activeConsultants", table: "profiles", targetDb: "admin", correlationId });
    const totalCustomers = await validateCountQueryResult(resTotalCustomers, { queryName: "totalCustomers", table: "profiles", targetDb: "main", correlationId });

    const totalBookings = await validateCountQueryResult(resTotalBookings, { queryName: "totalBookings", table: "customer_bookings", targetDb: "main", correlationId });
    const pendingBookings = await validateCountQueryResult(resPendingBookings, { queryName: "pendingBookings", table: "customer_bookings", targetDb: "main", correlationId });
    const confirmedBookings = await validateCountQueryResult(resConfirmedBookings, { queryName: "confirmedBookings", table: "customer_bookings", targetDb: "main", correlationId });
    const completedBookings = await validateCountQueryResult(resCompletedBookings, { queryName: "completedBookings", table: "customer_bookings", targetDb: "main", correlationId });
    const cancelledBookings = await validateCountQueryResult(resCancelledBookings, { queryName: "cancelledBookings", table: "customer_bookings", targetDb: "main", correlationId });

    return {
      success: true,
      data: {
        totalLeads,
        leadsToday,
        unassignedLeads,
        assignedLeads,
        contactedLeads,
        convertedLeads,
        closedLeads,
        invalidLeads,
        duplicateLeads,
        platformGeneratedLeads,
        directLeads,
        pendingListings,
        approvedListings,
        changesRequestedListings,
        suspendedListings,
        totalListings,
        activeConsultants,
        totalCustomers,
        activeCustomers: totalCustomers,
        totalBookings,
        pendingBookings,
        confirmedBookings,
        completedBookings,
        cancelledBookings,
        dbConnected: true,
        lastRefreshedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    const safeMessage = err instanceof Error ? err.message : "Database telemetry aggregation failed.";
    return {
      success: false,
      error: safeMessage,
    };
  }
}
