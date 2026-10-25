"use server";

// =====================================================
// ASTROLOGER PORTAL EXTENDED SERVER ACTIONS
// Reviews, Bookings, Earnings, Notifications, & Support
// =====================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAstrologer } from "@/lib/auth/session";
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
 * Resolves the authenticated astrologer's profile record.
 */
async function getAuthenticatedAstrologerProfile() {
  const { user, target } = await requireAstrologer();
  const supabase = await createClient(target);

  const { data: profile, error } = await supabase
    .from("astrologer_profiles")
    .select("id, display_name, user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !profile) {
    throw new Error("Astrologer profile record not found.");
  }

  return { user, profile, supabase };
}

/**
 * Loads all consultation bookings assigned to the authenticated astrologer.
 */
export async function getAstrologerBookingsAction(): Promise<
  AuthResult<CustomerBooking[]>
> {
  try {
    const { profile, supabase } = await getAuthenticatedAstrologerProfile();

    const { data: bookings, error } = await supabase
      .from("customer_bookings")
      .select("*")
      .eq("astrologer_id", profile.id)
      .order("scheduled_at", { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: (bookings || []) as CustomerBooking[] };
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
    const { profile, supabase } = await getAuthenticatedAstrologerProfile();

    const { data: reviews, error } = await supabase
      .from("consultation_reviews")
      .select("*")
      .eq("astrologer_id", profile.id)
      .order("created_at", { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    const reviewList = (reviews || []) as ConsultationReview[];
    const totalReviews = reviewList.length;
    const avg =
      totalReviews > 0
        ? Number((reviewList.reduce((acc, r) => acc + r.rating, 0) / totalReviews).toFixed(1))
        : 5.0;

    // Attach customer names
    const customerIds = Array.from(new Set(reviewList.map((r) => r.customer_id)));
    let customerMap: Record<string, string> = {};
    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", customerIds);
      if (customers) {
        customerMap = Object.fromEntries(customers.map((c) => [c.id, c.full_name || "Verified Customer"]));
      }
    }

    const enriched = reviewList.map((r) => ({
      ...r,
      customer_name: customerMap[r.customer_id] || "Verified Customer",
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
      .select("*")
      .eq("astrologer_id", profile.id)
      .order("created_at", { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    const allBookings = (bookings || []) as CustomerBooking[];
    const customerIds = Array.from(new Set(allBookings.map((b) => b.customer_id)));
    let customerMap: Record<string, string> = {};

    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", customerIds);
      if (customers) {
        customerMap = Object.fromEntries(customers.map((c) => [c.id, c.full_name || "Customer"]));
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
    const { user, supabase } = await getAuthenticatedAstrologerProfile();

    const { data: notifications, error } = await supabase
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
    const { user, supabase } = await getAuthenticatedAstrologerProfile();

    const { error } = await supabase
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
    return { success: true, data: { success: true } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to mark notification.",
    };
  }
}
