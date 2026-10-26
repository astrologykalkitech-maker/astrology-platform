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
  totalBookings: number;
  pendingBookings: number;
  confirmedBookings: number;
  completedBookings: number;
  cancelledBookings: number;
}

/**
 * Calculates genuine platform metrics aggregated directly from database tables.
 * Every figure corresponds directly to a live PostgreSQL record count.
 */
export async function getPlatformOverviewMetrics(): Promise<AuthResult<PlatformOverviewMetrics>> {
  try {
    await requireAdminPermission("analytics.read");

    const supabase = await createAdminClient();

    // Today's start in UTC
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const todayIso = startOfToday.toISOString();

    // 1. Leads queries
    const [
      { count: totalLeads },
      { count: leadsToday },
      { count: unassignedLeads },
      { count: assignedLeads },
      { count: contactedLeads },
      { count: convertedLeads },
      { count: closedLeads },
      { count: invalidLeads },
      { count: duplicateLeads },
      { count: platformLeads },
      { count: directLeads },
    ] = await Promise.all([
      supabase.from("leads").select("*", { count: "exact", head: true }),
      supabase.from("leads").select("*", { count: "exact", head: true }).gte("created_at", todayIso),
      supabase.from("leads").select("*", { count: "exact", head: true }).is("astrologer_id", null).not("status", "in", '("closed","converted","invalid")'),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "assigned"),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "contacted"),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "converted"),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "closed"),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "invalid"),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "duplicate"),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("source_type", "platform"),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("source_type", "direct"),
    ]);

    // 2. Listings queries
    const [
      { count: pendingListings },
      { count: approvedListings },
      { count: changesRequestedListings },
      { count: suspendedListings },
      { count: totalListings },
    ] = await Promise.all([
      supabase.from("astrologer_profiles").select("*", { count: "exact", head: true }).eq("approval_status", "pending"),
      supabase.from("astrologer_profiles").select("*", { count: "exact", head: true }).eq("approval_status", "approved"),
      supabase.from("astrologer_profiles").select("*", { count: "exact", head: true }).eq("approval_status", "changes_requested"),
      supabase.from("astrologer_profiles").select("*", { count: "exact", head: true }).eq("approval_status", "suspended"),
      supabase.from("astrologer_profiles").select("*", { count: "exact", head: true }),
    ]);

    // 3. Active consultants & registered customers
    const [{ count: activeConsultants }, { count: totalCustomersCount }] = await Promise.all([
      supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .in("role", ["consultant_admin", "super_admin", "admin"]),
      supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "customer"),
    ]);

    // 4. Bookings queries (graceful handling if table empty)
    let totalBookings = 0;
    let pendingBookings = 0;
    let confirmedBookings = 0;
    let completedBookings = 0;
    let cancelledBookings = 0;

    try {
      const [
        { count: tBookings },
        { count: pBookings },
        { count: cBookings },
        { count: compBookings },
        { count: cancBookings },
      ] = await Promise.all([
        supabase.from("customer_bookings").select("*", { count: "exact", head: true }),
        supabase.from("customer_bookings").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("customer_bookings").select("*", { count: "exact", head: true }).eq("status", "confirmed"),
        supabase.from("customer_bookings").select("*", { count: "exact", head: true }).eq("status", "completed"),
        supabase.from("customer_bookings").select("*", { count: "exact", head: true }).eq("status", "cancelled"),
      ]);
      totalBookings = tBookings ?? 0;
      pendingBookings = pBookings ?? 0;
      confirmedBookings = cBookings ?? 0;
      completedBookings = compBookings ?? 0;
      cancelledBookings = cancBookings ?? 0;
    } catch {
      // Table may not have records or exist yet
    }

    return {
      success: true,
      data: {
        totalLeads: totalLeads ?? 0,
        leadsToday: leadsToday ?? 0,
        unassignedLeads: unassignedLeads ?? 0,
        assignedLeads: assignedLeads ?? 0,
        contactedLeads: contactedLeads ?? 0,
        convertedLeads: convertedLeads ?? 0,
        closedLeads: closedLeads ?? 0,
        invalidLeads: invalidLeads ?? 0,
        duplicateLeads: duplicateLeads ?? 0,
        platformGeneratedLeads: platformLeads ?? 0,
        directLeads: directLeads ?? 0,
        pendingListings: pendingListings ?? 0,
        approvedListings: approvedListings ?? 0,
        changesRequestedListings: changesRequestedListings ?? 0,
        suspendedListings: suspendedListings ?? 0,
        totalListings: totalListings ?? 0,
        activeConsultants: activeConsultants ?? 0,
        totalCustomers: totalCustomersCount ?? 0,
        totalBookings,
        pendingBookings,
        confirmedBookings,
        completedBookings,
        cancelledBookings,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to calculate analytics.",
    };
  }
}
