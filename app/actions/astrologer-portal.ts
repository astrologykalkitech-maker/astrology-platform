"use server";

// =====================================================
// ASTROLOGER PORTAL EXTENDED SERVER ACTIONS
// Reviews, Bookings, Earnings, Notifications, & Support
// =====================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAstrologer } from "@/lib/auth/session";
import { getOwnAstrologerProfile } from "@/lib/astrologer/guard";
import type { AuthResult } from "@/lib/types/auth.types";
import type {
  CustomerBooking,
  CustomerNotification,
  ConsultationReview,
} from "@/lib/types/database.types";

export interface AstrologerEarningsRecord {
  id: string;
  booking_id: string;
  customer_name: string;
  service_type: string;
  consultation_mode: string;
  fee_amount: number;
  currency: string;
  scheduled_at: string;
  status: string;
  created_at: string;
}

export interface AstrologerEarningsSummary {
  totalConsultations: number;
  completedConsultations: number;
  totalEarningsValue: number;
  pendingEarningsValue: number;
  records: AstrologerEarningsRecord[];
}

/**
 * Resolves the authenticated astrologer's profile record using request-memoized lookup.
 */
async function getAuthenticatedAstrologerProfile() {
  const { user, target } = await requireAstrologer();
  const { profile, error } = await getOwnAstrologerProfile();

  if (error || !profile) {
    throw new Error(error || "Astrologer profile record not found.");
  }

  const supabase = await createClient(target);
  return { user, profile, supabase };
}

/**
 * Loads all consultation bookings assigned to the authenticated astrologer.
 */
export async function getAstrologerBookingsAction(): Promise<
  AuthResult<CustomerBooking[]>
> {
  try {
    const { profile } = await getAuthenticatedAstrologerProfile();
    const admin = await createAdminClient("main");

    const { data: bookings, error } = await admin
      .from("customer_bookings")
      .select("*, customer:customer_id(full_name, avatar_url)")
      .eq("astrologer_id", profile.id)
      .order("scheduled_at", { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    const rawBookings = (bookings || []) as Array<
      CustomerBooking & {
        customer?: { full_name?: string | null; avatar_url?: string | null } | null;
      }
    >;
    const enriched: CustomerBooking[] = rawBookings.map((b) => ({
      ...b,
      customer_name: b.customer?.full_name || "Verified Customer",
      customer_avatar_url: b.customer?.avatar_url || null,
    }));

    return { success: true, data: enriched };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load bookings.",
    };
  }
}

/**
 * Loads customer reviews & ratings submitted for this astrologer.
 */
export async function getAstrologerReviewsAction(): Promise<
  AuthResult<{
    reviews: (ConsultationReview & { customer_name?: string })[];
    averageRating: number;
    totalReviews: number;
  }>
> {
  try {
    const { profile } = await getAuthenticatedAstrologerProfile();
    const admin = await createAdminClient("main");

    const { data: reviews, error } = await admin
      .from("consultation_reviews")
      .select("*, customer:customer_id(full_name)")
      .eq("astrologer_id", profile.id)
      .order("created_at", { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    const reviewList = (reviews || []) as Array<
      ConsultationReview & {
        customer?: { full_name?: string | null } | null;
      }
    >;
    const totalReviews = reviewList.length;
    const avg =
      totalReviews > 0
        ? Number((reviewList.reduce((acc, r) => acc + (r.rating || 5), 0) / totalReviews).toFixed(1))
        : 5.0;

    const enriched = reviewList.map((r) => ({
      ...r,
      customer_name: r.customer?.full_name || "Verified Customer",
    }));

    return {
      success: true,
      data: {
        reviews: enriched,
        averageRating: avg,
        totalReviews,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load reviews.",
    };
  }
}

/**
 * Loads earnings and fee breakdown derived from consultations.
 */
export async function getAstrologerEarningsAction(): Promise<
  AuthResult<AstrologerEarningsSummary>
> {
  try {
    const { profile, supabase } = await getAuthenticatedAstrologerProfile();

    const { data: bookings, error } = await supabase
      .from("customer_bookings")
      .select("*, customer:customer_id(full_name)")
      .eq("astrologer_id", profile.id)
      .order("created_at", { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    const allBookings = (bookings || []) as Array<
      CustomerBooking & {
        customer?: { full_name?: string | null } | null;
      }
    >;
    const customerMap: Record<string, string> = {};

    // First populate names from the joined customer relation
    const missingCustomerIds: string[] = [];
    for (const b of allBookings) {
      if (b.customer?.full_name) {
        customerMap[b.customer_id] = b.customer.full_name;
      } else if (b.customer_id && !customerMap[b.customer_id]) {
        missingCustomerIds.push(b.customer_id);
      }
    }

    // Only fallback query for customer profiles if any were missing from join
    if (missingCustomerIds.length > 0) {
      const uniqueMissing = Array.from(new Set(missingCustomerIds));
      const { data: customers } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", uniqueMissing);
      if (customers) {
        for (const c of customers) {
          if (c.id && c.full_name) {
            customerMap[c.id] = c.full_name;
          }
        }
      }
    }

    let completedCount = 0;
    let totalEarnings = 0;
    let pendingEarnings = 0;

    const records: AstrologerEarningsRecord[] = allBookings.map((b) => {
      const price = Number(b.price) || 0;
      if (b.status === "completed") {
        completedCount++;
        totalEarnings += price;
      } else if (b.status === "confirmed" || b.status === "pending") {
        pendingEarnings += price;
      }

      return {
        id: `earn-${b.id.slice(0, 8)}`,
        booking_id: b.id,
        customer_name: customerMap[b.customer_id] || "Customer",
        service_type: b.service_type,
        consultation_mode: b.consultation_mode,
        fee_amount: price,
        currency: "INR",
        scheduled_at: b.scheduled_at,
        status: b.status,
        created_at: b.created_at,
      };
    });

    return {
      success: true,
      data: {
        totalConsultations: allBookings.length,
        completedConsultations: completedCount,
        totalEarningsValue: totalEarnings,
        pendingEarningsValue: pendingEarnings,
        records,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load earnings.",
    };
  }
}

/**
 * Loads persistent notifications for the authenticated astrologer.
 */
export async function getAstrologerNotificationsAction(): Promise<
  AuthResult<CustomerNotification[]>
> {
  try {
    const { user } = await getAuthenticatedAstrologerProfile();
    const admin = await createAdminClient("main");

    const { data: notifications, error } = await admin
      .from("customer_notifications")
      .select("*")
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: (notifications || []) as CustomerNotification[],
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load notifications.",
    };
  }
}

/**
 * Marks an astrologer notification as read.
 */
export async function markAstrologerNotificationReadAction(
  notificationId: string
): Promise<AuthResult<{ success: boolean }>> {
  try {
    const { user } = await getAuthenticatedAstrologerProfile();
    const admin = await createAdminClient("main");

    const { error } = await admin
      .from("customer_notifications")
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq("id", notificationId)
      .eq("customer_id", user.id);

    if (error) {
      return { success: false, error: "Failed to update notification." };
    }

    revalidatePath("/astrologer/notifications", "page");
    revalidatePath("/astrologer", "layout");
    return { success: true, data: { success: true } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to mark notification.",
    };
  }
}

/**
 * Deletes all notifications for the authenticated astrologer.
 */
export async function clearAllAstrologerNotificationsAction(): Promise<
  AuthResult<{ success: boolean }>
> {
  try {
    const { user } = await getAuthenticatedAstrologerProfile();
    const admin = await createAdminClient("main");

    const { error } = await admin
      .from("customer_notifications")
      .delete()
      .eq("customer_id", user.id);

    if (error) {
      return { success: false, error: `Failed to clear notifications: ${error.message}` };
    }

    revalidatePath("/astrologer/notifications", "page");
    revalidatePath("/astrologer", "layout");

    return { success: true, data: { success: true } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to clear notifications.",
    };
  }
}

/**
 * Deletes a single notification for the authenticated astrologer.
 */
export async function deleteAstrologerNotificationAction(
  notificationId: string
): Promise<AuthResult<{ success: boolean }>> {
  try {
    const { user } = await getAuthenticatedAstrologerProfile();
    const admin = await createAdminClient("main");

    const { error } = await admin
      .from("customer_notifications")
      .delete()
      .eq("id", notificationId)
      .eq("customer_id", user.id);

    if (error) {
      return { success: false, error: `Failed to delete notification: ${error.message}` };
    }

    revalidatePath("/astrologer/notifications", "page");
    revalidatePath("/astrologer", "layout");

    return { success: true, data: { success: true } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete notification.",
    };
  }
}

/**
 * Marks all notifications as read for the authenticated astrologer.
 */
export async function markAllAstrologerNotificationsReadAction(): Promise<
  AuthResult<{ success: boolean }>
> {
  try {
    const { user } = await getAuthenticatedAstrologerProfile();
    const admin = await createAdminClient("main");

    const { error } = await admin
      .from("customer_notifications")
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq("customer_id", user.id)
      .eq("is_read", false);

    if (error) {
      return { success: false, error: "Failed to mark all notifications as read." };
    }

    revalidatePath("/astrologer/notifications", "page");
    revalidatePath("/astrologer", "layout");

    return { success: true, data: { success: true } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to mark all notifications.",
    };
  }
}

/**
 * Returns the unread notification count for the authenticated astrologer.
 */
export async function getAstrologerUnreadNotificationCount(): Promise<AuthResult<number>> {
  try {
    const { user } = await getAuthenticatedAstrologerProfile();
    const admin = await createAdminClient("main");

    const { count, error } = await admin
      .from("customer_notifications")
      .select("*", { count: "exact", head: true })
      .eq("customer_id", user.id)
      .eq("is_read", false);

    if (error) {
      return { success: true, data: 0 };
    }

    return { success: true, data: count || 0 };
  } catch {
    return { success: true, data: 0 };
  }
}


