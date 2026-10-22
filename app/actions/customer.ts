"use server";

// =====================================================
// CUSTOMER DATA ACCESS & SERVER ACTIONS (Phase 1)
// =====================================================

import { createClient } from "@/lib/supabase/server";
import { requireCustomerContext } from "@/lib/auth/customer-guard";
import type { LeadStatus } from "@/lib/types/database.types";
import type { AuthResult } from "@/lib/types/auth.types";

export interface CustomerEnquiryItem {
  id: string;
  subject: string;
  message: string;
  status: LeadStatus;
  created_at: string;
  astrologer_id: string | null;
  astrologer_name?: string | null;
}

export interface CustomerDashboardSummary {
  profile: {
    id: string;
    fullName: string;
    email: string | null;
  };
  stats: {
    totalEnquiries: number;
    pendingEnquiries: number;
    assignedEnquiries: number;
    completedEnquiries: number;
  };
  recentEnquiries: CustomerEnquiryItem[];
}

interface LeadRowResult {
  id: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
  astrologer_id: string | null;
  astrologer_profiles: {
    display_name: string;
  } | null;
}

/**
 * Loads the dashboard summary strictly for the authenticated customer.
 * Enforces server-side customer role and queries solely user-scoped records.
 */
export async function getCustomerDashboardData(): Promise<
  AuthResult<CustomerDashboardSummary>
> {
  try {
    const { user, profile } = await requireCustomerContext();
    const supabase = await createClient();

    // Query authenticated customer's own leads only
    const { data: leads, error } = await supabase
      .from("leads")
      .select(`
        id,
        subject,
        message,
        status,
        created_at,
        astrologer_id,
        astrologer_profiles (
          display_name
        )
      `)
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return {
        success: false,
        error: `Failed to load enquiries: ${error.message}`,
      };
    }

    const typedLeads = (leads as unknown as LeadRowResult[]) || [];
    const items: CustomerEnquiryItem[] = typedLeads.map((lead) => ({
      id: lead.id,
      subject: lead.subject,
      message: lead.message,
      status: lead.status as LeadStatus,
      created_at: lead.created_at,
      astrologer_id: lead.astrologer_id,
      astrologer_name: lead.astrologer_profiles?.display_name ?? null,
    }));

    const totalEnquiries = items.length;
    const pendingEnquiries = items.filter((l) => l.status === "new").length;
    const assignedEnquiries = items.filter((l) => l.status === "assigned").length;
    const completedEnquiries = items.filter(
      (l) => l.status === "closed" || l.status === "converted"
    ).length;

    return {
      success: true,
      data: {
        profile: {
          id: user.id,
          fullName: profile.full_name || "Customer",
          email: user.email || null,
        },
        stats: {
          totalEnquiries,
          pendingEnquiries,
          assignedEnquiries,
          completedEnquiries,
        },
        recentEnquiries: items.slice(0, 5),
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load customer dashboard.";
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Loads all enquiries for the authenticated customer.
 */
export async function getCustomerEnquiries(): Promise<
  AuthResult<CustomerEnquiryItem[]>
> {
  try {
    const { user } = await requireCustomerContext();
    const supabase = await createClient();

    const { data: leads, error } = await supabase
      .from("leads")
      .select(`
        id,
        subject,
        message,
        status,
        created_at,
        astrologer_id,
        astrologer_profiles (
          display_name
        )
      `)
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return {
        success: false,
        error: `Failed to load enquiries: ${error.message}`,
      };
    }

    const typedLeads = (leads as unknown as LeadRowResult[]) || [];
    const items: CustomerEnquiryItem[] = typedLeads.map((lead) => ({
      id: lead.id,
      subject: lead.subject,
      message: lead.message,
      status: lead.status as LeadStatus,
      created_at: lead.created_at,
      astrologer_id: lead.astrologer_id,
      astrologer_name: lead.astrologer_profiles?.display_name ?? null,
    }));

    return {
      success: true,
      data: items,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load customer enquiries.";
    return {
      success: false,
      error: message,
    };
  }
}
