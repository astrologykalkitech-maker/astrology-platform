"use server";

// =====================================================
// ADMIN CUSTOMER MANAGEMENT SERVER ACTIONS
// =====================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminAccess } from "@/lib/auth/admin-guard";
import type { AuthResult } from "@/lib/types/auth.types";
import type { CustomerBooking, CustomerFullProfile, Lead, Profile } from "@/lib/types/database.types";
import { isValidUUID } from "@/lib/validations/lead";

export interface AdminCustomerSummary extends Profile {
  email?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  birthplace?: string | null;
  gender?: string | null;
  total_bookings?: number;
  total_enquiries?: number;
}

export interface AdminCustomersFilter {
  search?: string;
  limit?: number;
  offset?: number;
}

export interface AdminCustomersResultData {
  customers: AdminCustomerSummary[];
  totalCount: number;
}

export interface AdminCustomerDetailedView {
  profile: Profile;
  fullProfile: CustomerFullProfile | null;
  bookings: CustomerBooking[];
  leads: Lead[];
}

// In-memory 60-second memoized auth email map for high-speed admin customer browsing
let cachedAuthEmailMap: { map: Map<string, string>; expiresAt: number } | null = null;

/**
 * Fetch registered customer seekers with search and pagination (Admin only).
 */
export async function getAdminCustomers(
  filter: AdminCustomersFilter = {}
): Promise<AuthResult<AdminCustomersResultData>> {
  try {
    await requireAdminAccess();

    const supabase = await createAdminClient("main");
    const limit = Math.min(Math.max(filter.limit ?? 25, 1), 100);
    const offset = Math.max(filter.offset ?? 0, 0);

    let query = supabase
      .from("profiles")
      .select("*", { count: "exact" })
      .eq("role", "customer");

    if (filter.search && filter.search.trim()) {
      const term = `%${filter.search.trim()}%`;
      query = query.ilike("full_name", term);
    }

    query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

    const { data: profiles, count, error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    const customerProfiles = (profiles as Profile[]) ?? [];
    const customerIds = customerProfiles.map((p) => p.id);

    // Resolve emails from auth.admin (with 60-second in-memory memoization)
    let emailMap = new Map<string, string>();
    if (cachedAuthEmailMap && Date.now() < cachedAuthEmailMap.expiresAt) {
      emailMap = cachedAuthEmailMap.map;
    } else {
      try {
        const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        if (authUsers?.users) {
          for (const u of authUsers.users) {
            if (u.id && u.email) {
              emailMap.set(u.id, u.email);
            }
          }
          cachedAuthEmailMap = { map: emailMap, expiresAt: Date.now() + 60_000 };
        }
      } catch {
        // Graceful fallback if auth listing is restricted
      }
    }

    // Fetch booking counts
    const bookingCountsMap = new Map<string, number>();
    if (customerIds.length > 0) {
      try {
        const { data: bookings } = await supabase
          .from("customer_bookings")
          .select("customer_id")
          .in("customer_id", customerIds);

        if (bookings) {
          for (const b of bookings) {
            bookingCountsMap.set(b.customer_id, (bookingCountsMap.get(b.customer_id) ?? 0) + 1);
          }
        }
      } catch {
        // customer_bookings may not exist
      }
    }

    // Fetch lead counts
    const leadCountsMap = new Map<string, number>();
    if (customerIds.length > 0) {
      try {
        const { data: leads } = await supabase
          .from("leads")
          .select("customer_id")
          .in("customer_id", customerIds);

        if (leads) {
          for (const l of leads) {
            leadCountsMap.set(l.customer_id, (leadCountsMap.get(l.customer_id) ?? 0) + 1);
          }
        }
      } catch {
        // leads table may be empty
      }
    }

    const enrichedCustomers: AdminCustomerSummary[] = customerProfiles.map((p) => {
      const raw = p as unknown as Record<string, unknown>;
      return {
        ...p,
        email: emailMap.get(p.id) ?? (raw.email as string | null) ?? null,
        phone: (raw.phone as string | null) ?? null,
        date_of_birth: (raw.date_of_birth as string | null) ?? null,
        birthplace: (raw.birthplace as string | null) ?? null,
        gender: (raw.gender as string | null) ?? null,
        total_bookings: bookingCountsMap.get(p.id) ?? 0,
        total_enquiries: leadCountsMap.get(p.id) ?? 0,
      };
    });

    return {
      success: true,
      data: {
        customers: enrichedCustomers,
        totalCount: count ?? 0,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load customers.",
    };
  }
}

/**
 * Fetch full details, kundli profile, bookings, and enquiries for a specific customer.
 */
export async function getAdminCustomerDetails(
  customerId: string
): Promise<AuthResult<AdminCustomerDetailedView>> {
  try {
    await requireAdminAccess();

    if (!isValidUUID(customerId)) {
      return { success: false, error: "Invalid customer identifier." };
    }

    const supabase = await createAdminClient("main");

    // 1. Base profile
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", customerId)
      .single();

    if (pErr || !profile) {
      return { success: false, error: "Customer profile not found." };
    }

    // 2. Auth user info (email & verification)
    let email: string | null = null;
    let emailVerified = false;
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(customerId);
      if (authUser?.user) {
        email = authUser.user.email ?? null;
        emailVerified = Boolean(authUser.user.email_confirmed_at);
      }
    } catch {
      // Graceful fallback
    }

    const raw = profile as unknown as Record<string, unknown>;
    const fullProfile: CustomerFullProfile = {
      id: profile.id,
      full_name: profile.full_name || null,
      email,
      phone: (raw.phone as string | null) ?? null,
      date_of_birth: (raw.date_of_birth as string | null) ?? null,
      time_of_birth: (raw.time_of_birth as string | null) ?? null,
      birthplace: (raw.birthplace as string | null) ?? null,
      gender: (raw.gender as "male" | "female" | "other" | "prefer_not_to_say" | null) ?? null,
      avatar_url: (raw.avatar_url as string | null) ?? null,
      emailVerified,
      role: profile.role,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
    };

    // 3. Customer bookings
    let bookings: CustomerBooking[] = [];
    try {
      const { data: bData } = await supabase
        .from("customer_bookings")
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(50);
      bookings = (bData as CustomerBooking[]) ?? [];
    } catch {
      // customer_bookings may not exist
    }

    // 4. Customer leads / enquiries
    let leads: Lead[] = [];
    try {
      const { data: lData } = await supabase
        .from("leads")
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(50);
      leads = (lData as Lead[]) ?? [];
    } catch {
      // leads query error fallback
    }

    return {
      success: true,
      data: {
        profile: profile as Profile,
        fullProfile,
        bookings,
        leads,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load customer details.",
    };
  }
}
