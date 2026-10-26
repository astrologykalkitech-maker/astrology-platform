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

/**
 * Fetch registered customer seekers with search and pagination (Admin only).
 */
export async function getAdminCustomers(
  filter: AdminCustomersFilter = {}
): Promise<AuthResult<AdminCustomersResultData>> {
  try {
    await requireAdminAccess();

    const supabase = await createAdminClient();
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

    // Fetch full profiles if customer_full_profiles table is available
    const fullProfilesMap = new Map<string, Partial<CustomerFullProfile>>();
    if (customerIds.length > 0) {
      try {
        const { data: fullProfiles } = await supabase
          .from("customer_full_profiles")
          .select("*")
          .in("id", customerIds);

        if (fullProfiles) {
          for (const fp of fullProfiles) {
            fullProfilesMap.set(fp.id, fp);
          }
        }
      } catch {
        // Table may not have records
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
      const fp = fullProfilesMap.get(p.id);
      return {
        ...p,
        email: fp?.email ?? null,
        phone: fp?.phone ?? null,
        date_of_birth: fp?.date_of_birth ?? null,
        birthplace: fp?.birthplace ?? null,
        gender: fp?.gender ?? null,
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

    const supabase = await createAdminClient();

    // 1. Base profile
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", customerId)
      .single();

    if (pErr || !profile) {
      return { success: false, error: "Customer profile not found." };
    }

    // 2. Full Kundli / Seeker profile
    let fullProfile: CustomerFullProfile | null = null;
    try {
      const { data: fp } = await supabase
        .from("customer_full_profiles")
        .select("*")
        .eq("id", customerId)
        .maybeSingle();
      fullProfile = fp;
    } catch {
      // Graceful fallback
    }

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
