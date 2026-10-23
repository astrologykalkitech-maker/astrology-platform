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
    const { user, profile, target } = await requireCustomerContext();
    const supabase = await createClient(target);

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
    const assignedEnquiries = items.filter(
      (l) => l.status === "assigned" || l.status === "contacted"
    ).length;
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
    const { user, target } = await requireCustomerContext();
    const supabase = await createClient(target);

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

/**
 * Server Action to submit an enquiry reliably using authenticated customer context.
 * Automatically inserts lead and lead_assignment when targeting an astrologer.
 */
export async function submitCustomerEnquiryAction(payload: {
  subject: string;
  message: string;
  priority?: string;
  astrologer_id?: string | null;
  source_type?: string;
  source_url?: string;
}): Promise<AuthResult<{ id: string }>> {
  try {
    const { user, profile, target } = await requireCustomerContext();
    const supabase = await createClient(target);

    const subject = (payload.subject || "").trim();
    const message = (payload.message || "").trim();
    const astrologer_id = payload.astrologer_id || null;
    const priority = payload.priority || "medium";

    if (!subject || subject.length > 200) {
      return { success: false, error: "Subject is required (max 200 characters)." };
    }
    if (!message || message.length > 5000) {
      return { success: false, error: "Message is required (max 5000 characters)." };
    }

    // Try canonical RPC first if installed in database
    const { data: rpcLead, error: rpcErr } = await supabase.rpc(
      "submit_customer_enquiry",
      {
        p_subject: subject,
        p_message: message,
        p_astrologer_id: astrologer_id,
        p_source_type: astrologer_id ? "direct" : (payload.source_type || "platform"),
        p_source_url: payload.source_url || null,
        p_utm_source: null,
        p_utm_medium: null,
        p_utm_campaign: null,
        p_customer_name: profile.full_name || "Customer",
        p_contact_email: user.email,
        p_contact_phone: null,
        p_priority: priority,
      }
    );

    if (!rpcErr && rpcLead) {
      return { success: true, data: { id: rpcLead.id } };
    }

    // Direct table fallback: Customer inserts directly with status 'new'
    // Attempt insert with extended fields, fall back to core schema if columns are absent
    let lead = null;
    let insertError = null;

    const fullPayload: Record<string, unknown> = {
      customer_id: user.id,
      astrologer_id: astrologer_id,
      subject,
      message,
      status: "new",
      source_type: astrologer_id ? "direct" : "platform",
      priority,
    };

    const res = await supabase.from("leads").insert(fullPayload).select("id").single();
    lead = res.data;
    insertError = res.error;

    // If 'priority' or 'source_type' column does not exist on this database, retry with core schema columns
    if (insertError && (insertError.message.includes("priority") || insertError.message.includes("source_type"))) {
      const corePayload = {
        customer_id: user.id,
        astrologer_id: astrologer_id,
        subject,
        message,
        status: "new",
      };
      const retryRes = await supabase.from("leads").insert(corePayload).select("id").single();
      lead = retryRes.data;
      insertError = retryRes.error;
    }

    if (insertError || !lead) {
      return {
        success: false,
        error: insertError?.message || "Failed to submit enquiry.",
      };
    }

    // If an astrologer was directly targeted, create lead assignment using service role client
    if (astrologer_id) {
      try {
        const { createAdminClient } = await import("@/lib/supabase/admin");
        const adminDb = await createAdminClient(target);
        await adminDb.from("lead_assignments").insert({
          lead_id: lead.id,
          astrologer_id: astrologer_id,
          status: "assigned",
        });
      } catch {
        // Log silently; central inbox will route
      }
    }

    return {
      success: true,
      data: { id: lead.id },
    };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "An unexpected error occurred while submitting enquiry.",
    };
  }
}

