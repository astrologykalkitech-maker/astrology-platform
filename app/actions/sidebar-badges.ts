"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/session";
import type { AuthResult } from "@/lib/types/auth.types";

export interface CustomerSidebarBadges {
  unreadNotifications: number;
  upcomingBookings: number;
  activeConsultations: number;
}

export interface AstrologerSidebarBadges {
  unreadNotifications: number;
  upcomingBookings: number;
  pendingRequests: number;
  activeConsultations: number;
  isVerified: boolean;
  isAvailable: boolean;
}

/**
 * Fast server action to retrieve live badge counters for Customer Sidebar.
 */
export async function getCustomerSidebarBadgesAction(): Promise<AuthResult<CustomerSidebarBadges>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return {
        success: true,
        data: { unreadNotifications: 0, upcomingBookings: 0, activeConsultations: 0 },
      };
    }

    const admin = await createAdminClient("main");

    const [notifsRes, bookingsRes, consultationsRes] = await Promise.all([
      admin
        .from("customer_notifications")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", user.id)
        .eq("is_read", false),
      admin
        .from("customer_bookings")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", user.id)
        .in("status", ["confirmed", "pending"]),
      admin
        .from("consultation_meetings")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", user.id)
        .eq("status", "active"),
    ]);

    return {
      success: true,
      data: {
        unreadNotifications: notifsRes.count || 0,
        upcomingBookings: bookingsRes.count || 0,
        activeConsultations: consultationsRes.count || 0,
      },
    };
  } catch {
    return {
      success: true,
      data: { unreadNotifications: 0, upcomingBookings: 0, activeConsultations: 0 },
    };
  }
}

/**
 * Fast server action to retrieve live badge counters and verification for Astrologer Sidebar.
 */
export async function getAstrologerSidebarBadgesAction(): Promise<AuthResult<AstrologerSidebarBadges>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return {
        success: true,
        data: {
          unreadNotifications: 0,
          upcomingBookings: 0,
          pendingRequests: 0,
          activeConsultations: 0,
          isVerified: false,
          isAvailable: false,
        },
      };
    }

    const admin = await createAdminClient("main");

    // Fetch astrologer profile
    const { data: profile } = await admin
      .from("astrologer_profiles")
      .select("id, is_verified, is_available")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) {
      return {
        success: true,
        data: {
          unreadNotifications: 0,
          upcomingBookings: 0,
          pendingRequests: 0,
          activeConsultations: 0,
          isVerified: false,
          isAvailable: false,
        },
      };
    }

    const [notifsRes, upcomingRes, pendingRes, activeRes] = await Promise.all([
      admin
        .from("customer_notifications")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", user.id)
        .eq("is_read", false),
      admin
        .from("customer_bookings")
        .select("id", { count: "exact", head: true })
        .eq("astrologer_id", profile.id)
        .eq("status", "confirmed"),
      admin
        .from("customer_bookings")
        .select("id", { count: "exact", head: true })
        .eq("astrologer_id", profile.id)
        .eq("status", "pending"),
      admin
        .from("consultation_meetings")
        .select("id", { count: "exact", head: true })
        .eq("astrologer_id", profile.id)
        .eq("status", "active"),
    ]);

    return {
      success: true,
      data: {
        unreadNotifications: notifsRes.count || 0,
        upcomingBookings: upcomingRes.count || 0,
        pendingRequests: pendingRes.count || 0,
        activeConsultations: activeRes.count || 0,
        isVerified: !!profile.is_verified,
        isAvailable: !!profile.is_available,
      },
    };
  } catch {
    return {
      success: true,
      data: {
        unreadNotifications: 0,
        upcomingBookings: 0,
        pendingRequests: 0,
        activeConsultations: 0,
        isVerified: false,
        isAvailable: false,
      },
    };
  }
}

