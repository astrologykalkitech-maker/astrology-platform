"use server";

// =====================================================
// ADMIN BOOKING & SERVICE MANAGEMENT SERVER ACTIONS
// =====================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { logAdminAction } from "@/lib/admin/audit";
import { revalidatePath } from "next/cache";
import type { AuthResult } from "@/lib/types/auth.types";
import type { BookingStatus, ConsultationMode, CustomerBooking } from "@/lib/types/database.types";
import { isValidUUID } from "@/lib/validations/lead";

export interface AdminBookingItem extends CustomerBooking {
  customer_name?: string;
  customer_email?: string;
  astrologer_name?: string;
  astrologer_city?: string;
}

export interface AdminBookingsFilter {
  status?: BookingStatus | "all";
  mode?: ConsultationMode | "all";
  search?: string;
  limit?: number;
  offset?: number;
}

export interface AdminBookingsResultData {
  bookings: AdminBookingItem[];
  totalCount: number;
}

const VALID_BOOKING_STATUSES: BookingStatus[] = [
  "pending",
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
];

/**
 * Fetch all platform consultation bookings with filtering, search, and pagination.
 */
export async function getAdminBookings(
  filter: AdminBookingsFilter = {}
): Promise<AuthResult<AdminBookingsResultData>> {
  try {
    // Platform-wide booking data is Owner-only; consultant admins are scoped to assigned leads.
    await requireSuperAdmin();

    const supabase = await createAdminClient("main");
    const limit = Math.min(Math.max(filter.limit ?? 25, 1), 100);
    const offset = Math.max(filter.offset ?? 0, 0);

    let query = supabase.from("customer_bookings").select("*", { count: "exact" });

    if (filter.status && filter.status !== "all") {
      query = query.eq("status", filter.status);
    }

    if (filter.mode && filter.mode !== "all") {
      query = query.eq("consultation_mode", filter.mode);
    }

    query = query.order("scheduled_at", { ascending: false }).range(offset, offset + limit - 1);

    const { data: rawBookings, count, error } = await query;

    if (error) {
      // Table may not have been created yet on fresh databases
      return {
        success: true,
        data: { bookings: [], totalCount: 0 },
      };
    }

    const bookings = (rawBookings as CustomerBooking[]) ?? [];

    // Collect customer IDs and astrologer IDs to resolve names in batch
    const customerIds = Array.from(new Set(bookings.map((b) => b.customer_id).filter(Boolean)));
    const astrologerIds = Array.from(new Set(bookings.map((b) => b.astrologer_id).filter(Boolean)));

    const [customerProfilesRes, astrologerProfilesRes] = await Promise.all([
      customerIds.length > 0
        ? supabase.from("profiles").select("id, full_name").in("id", customerIds)
        : Promise.resolve({ data: [] }),
      astrologerIds.length > 0
        ? supabase.from("astrologer_profiles").select("id, display_name, city").in("id", astrologerIds)
        : Promise.resolve({ data: [] }),
    ]);

    const customerMap = new Map<string, string>();
    if (customerProfilesRes.data) {
      for (const c of customerProfilesRes.data) {
        customerMap.set(c.id, c.full_name ?? "Seeker");
      }
    }

    const astrologerMap = new Map<string, { name: string; city?: string }>();
    if (astrologerProfilesRes.data) {
      for (const a of astrologerProfilesRes.data) {
        astrologerMap.set(a.id, { name: a.display_name, city: a.city ?? undefined });
      }
    }

    let enrichedBookings: AdminBookingItem[] = bookings.map((b) => {
      const astro = astrologerMap.get(b.astrologer_id);
      return {
        ...b,
        customer_name: customerMap.get(b.customer_id) ?? "Seeker",
        astrologer_name: astro?.name ?? b.astrologer_name ?? "Vedic Astrologer",
        astrologer_city: astro?.city,
      };
    });

    if (filter.search && filter.search.trim()) {
      const s = filter.search.toLowerCase().trim();
      enrichedBookings = enrichedBookings.filter(
        (b) =>
          b.customer_name?.toLowerCase().includes(s) ||
          b.astrologer_name?.toLowerCase().includes(s) ||
          b.service_type?.toLowerCase().includes(s) ||
          b.id.toLowerCase().includes(s)
      );
    }

    return {
      success: true,
      data: {
        bookings: enrichedBookings,
        totalCount: count ?? enrichedBookings.length,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load bookings.",
    };
  }
}

/**
 * Update booking status administratively (confirm, complete, or cancel with reason).
 */
export async function updateAdminBookingStatus(params: {
  bookingId: string;
  status: BookingStatus;
  cancellationReason?: string;
}): Promise<AuthResult<CustomerBooking>> {
  try {
    const { user, profile } = await requireSuperAdmin();

    if (!isValidUUID(params.bookingId)) {
      return { success: false, error: "Invalid booking identifier." };
    }

    if (!VALID_BOOKING_STATUSES.includes(params.status)) {
      return { success: false, error: "Invalid booking status." };
    }

    const supabase = await createAdminClient("main");

    // Fetch before-state
    const { data: beforeBooking, error: fetchErr } = await supabase
      .from("customer_bookings")
      .select("*")
      .eq("id", params.bookingId)
      .single();

    if (fetchErr || !beforeBooking) {
      return { success: false, error: "Booking record not found." };
    }

    const updatePayload: Record<string, unknown> = {
      status: params.status,
      updated_at: new Date().toISOString(),
    };

    if (params.status === "cancelled") {
      updatePayload.cancellation_reason = params.cancellationReason || "Cancelled by administrator";
      updatePayload.cancelled_at = new Date().toISOString();
    }

    const { data: updatedBooking, error: updateErr } = await supabase
      .from("customer_bookings")
      .update(updatePayload)
      .eq("id", params.bookingId)
      .select("*")
      .single();

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    // Record audit event
    await logAdminAction({
      actorId: user.id,
      actorRole: profile.role,
      action: `booking.status_change.${params.status}`,
      targetType: "booking",
      targetId: params.bookingId,
      reason: params.cancellationReason ?? `Admin status change to ${params.status}`,
      beforeState: { status: beforeBooking.status },
      afterState: { status: params.status },
      outcome: "success",
    });

    revalidatePath("/super-admin/bookings", "page");
    revalidatePath("/super-admin", "page");
    revalidatePath("/customer/bookings", "page");
    revalidatePath("/astrologer/bookings", "page");

    return {
      success: true,
      data: updatedBooking as CustomerBooking,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update booking status.",
    };
  }
}
