"use server";

// =====================================================
// CUSTOMER DATA ACCESS & SERVER ACTIONS (Phase 1)
// =====================================================

import { revalidatePath } from "next/cache";
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
      .select("id, subject, message, status, created_at, astrologer_id")
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return {
        success: false,
        error: `Failed to load enquiries: ${error.message}`,
      };
    }

    const rawLeads = leads || [];
    const astrologerIds = Array.from(
      new Set(rawLeads.map((l) => l.astrologer_id).filter(Boolean) as string[])
    );

    let astroNameMap: Record<string, string> = {};
    if (astrologerIds.length > 0) {
      const { data: astrologers } = await supabase
        .from("astrologer_profiles")
        .select("id, display_name")
        .in("id", astrologerIds);

      if (astrologers && astrologers.length > 0) {
        astroNameMap = Object.fromEntries(
          astrologers.map((a) => [a.id, a.display_name])
        );
      }
    }

    const items: CustomerEnquiryItem[] = rawLeads.map((lead) => ({
      id: lead.id,
      subject: lead.subject,
      message: lead.message,
      status: lead.status as LeadStatus,
      created_at: lead.created_at,
      astrologer_id: lead.astrologer_id,
      astrologer_name: lead.astrologer_id ? (astroNameMap[lead.astrologer_id] ?? null) : null,
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
      .select("id, subject, message, status, created_at, astrologer_id")
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return {
        success: false,
        error: `Failed to load enquiries: ${error.message}`,
      };
    }

    const rawLeads = leads || [];
    const astrologerIds = Array.from(
      new Set(rawLeads.map((l) => l.astrologer_id).filter(Boolean) as string[])
    );

    let astroNameMap: Record<string, string> = {};
    if (astrologerIds.length > 0) {
      const { data: astrologers } = await supabase
        .from("astrologer_profiles")
        .select("id, display_name")
        .in("id", astrologerIds);

      if (astrologers && astrologers.length > 0) {
        astroNameMap = Object.fromEntries(
          astrologers.map((a) => [a.id, a.display_name])
        );
      }
    }

    const items: CustomerEnquiryItem[] = rawLeads.map((lead) => ({
      id: lead.id,
      subject: lead.subject,
      message: lead.message,
      status: lead.status as LeadStatus,
      created_at: lead.created_at,
      astrologer_id: lead.astrologer_id,
      astrologer_name: lead.astrologer_id ? (astroNameMap[lead.astrologer_id] ?? null) : null,
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
    const priority = payload.priority || "medium";
    let resolvedAstrologerId = payload.astrologer_id || null;

    if (!subject || subject.length > 200) {
      return { success: false, error: "Subject is required (max 200 characters)." };
    }
    if (!message || message.length > 5000) {
      return { success: false, error: "Message is required (max 5000 characters)." };
    }

    // Resolve and strictly validate astrologer eligibility for current target database if targeting direct astrologer
    if (resolvedAstrologerId) {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const { isAstrologerEligibleForBooking } = await import("@/lib/astrologer/visibility");
      const currentAdmin = await createAdminClient(target);

      // 1. Check if ID exists in current target DB
      const { data: targetProfile } = await currentAdmin
        .from("astrologer_profiles")
        .select("id, slug, approval_status, display_name")
        .eq("id", resolvedAstrologerId)
        .maybeSingle();

      let validatedProfile = targetProfile;

      if (!validatedProfile?.id) {
        // 2. Look up the ID in the other DB to find its unique slug, then find matching profile in current DB
        const otherTarget = target === "main" ? "admin" : "main";
        try {
          const otherAdmin = await createAdminClient(otherTarget);
          const { data: sourceProfile } = await otherAdmin
            .from("astrologer_profiles")
            .select("slug, approval_status, display_name")
            .eq("id", resolvedAstrologerId)
            .maybeSingle();

          if (sourceProfile?.slug) {
            const { data: matchedProfile } = await currentAdmin
              .from("astrologer_profiles")
              .select("id, slug, approval_status, display_name")
              .eq("slug", sourceProfile.slug)
              .maybeSingle();

            if (matchedProfile?.id) {
              validatedProfile = matchedProfile;
            }
          }
        } catch {
          // Cross-lookup failed
        }
      }

      if (!validatedProfile) {
        return {
          success: false,
          error: "Selected astrologer profile was not found.",
        };
      }

      // Authoritative eligibility check on server before booking/enquiry creation
      const eligibility = isAstrologerEligibleForBooking(validatedProfile);
      if (!eligibility.eligible) {
        return {
          success: false,
          error: eligibility.reason || "This astrologer is currently unavailable for new consultations.",
        };
      }

      resolvedAstrologerId = validatedProfile.id;
    }

    // Try canonical RPC first if installed in database
    const { data: rpcLead, error: rpcErr } = await supabase.rpc(
      "submit_customer_enquiry",
      {
        p_subject: subject,
        p_message: message,
        p_astrologer_id: resolvedAstrologerId,
        p_source_type: resolvedAstrologerId ? "direct" : (payload.source_type || "platform"),
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

    let createdLeadId: string | null = null;

    if (!rpcErr && rpcLead) {
      createdLeadId = rpcLead.id;
    } else {
      // Direct table fallback: Customer inserts directly with status 'new'
      // Attempt insert with extended fields, fall back to core schema if columns are absent
      let lead = null;
      let insertError = null;

      const fullPayload: Record<string, unknown> = {
        customer_id: user.id,
        astrologer_id: resolvedAstrologerId,
        subject,
        message,
        status: "new",
        source_type: resolvedAstrologerId ? "direct" : "platform",
        priority,
      };

      const res = await supabase.from("leads").insert(fullPayload).select("id").single();
      lead = res.data;
      insertError = res.error;

      // If 'priority' or 'source_type' column does not exist on this database, retry with core schema columns
      if (insertError && (insertError.message.includes("priority") || insertError.message.includes("source_type"))) {
        const corePayload = {
          customer_id: user.id,
          astrologer_id: resolvedAstrologerId,
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

      createdLeadId = lead.id;

      // If an astrologer was directly targeted, create lead assignment using service role client
      if (resolvedAstrologerId) {
        try {
          const { createAdminClient } = await import("@/lib/supabase/admin");
          const adminDb = await createAdminClient(target);
          await adminDb.from("lead_assignments").insert({
            lead_id: lead.id,
            astrologer_id: resolvedAstrologerId,
            status: "assigned",
          });
        } catch {
          // Log silently; central inbox will route
        }
      }
    }

    // Mirror lead to DB2 (Admin DB) if current target was DB1, so Super Admin dashboard reflects it immediately
    if (target === "main" && createdLeadId) {
      try {
        const { createAdminClient } = await import("@/lib/supabase/admin");
        const db2Client = await createAdminClient("admin");

        // Resolve astrologer ID in DB2 if direct astrologer
        let db2AstrologerId: string | null = null;
        if (resolvedAstrologerId) {
          const { data: db2Direct } = await db2Client
            .from("astrologer_profiles")
            .select("id")
            .eq("id", resolvedAstrologerId)
            .maybeSingle();

          if (db2Direct?.id) {
            db2AstrologerId = db2Direct.id;
          } else {
            // Find slug in DB1 to match in DB2 using privileged admin client
            const db1Client = await createAdminClient("main");
            const { data: db1Profile } = await db1Client
              .from("astrologer_profiles")
              .select("slug")
              .eq("id", resolvedAstrologerId)
              .maybeSingle();

            if (db1Profile?.slug) {
              const { data: db2Profile } = await db2Client
                .from("astrologer_profiles")
                .select("id")
                .eq("slug", db1Profile.slug)
                .maybeSingle();

              db2AstrologerId = db2Profile?.id ?? null;
            }
          }
        }

        await db2Client.from("leads").upsert({
          id: createdLeadId,
          customer_id: user.id,
          astrologer_id: db2AstrologerId,
          subject,
          message,
          status: "new",
          source_type: db2AstrologerId ? "direct" : "platform",
          priority,
          customer_name: profile.full_name || "Direct Customer",
        });

        if (db2AstrologerId) {
          await db2Client.from("lead_assignments").upsert({
            lead_id: createdLeadId,
            astrologer_id: db2AstrologerId,
            status: "assigned",
          });
        }

        // Log central enquiry submission into admin audit trail
        try {
          const { logAdminAction } = await import("@/lib/admin/audit");
          await logAdminAction({
            actorId: user.id,
            actorRole: "customer",
            action: db2AstrologerId ? "enquiry.direct.created" : "enquiry.platform.created",
            targetType: "lead",
            targetId: createdLeadId,
            reason: `Customer submitted new consultation request: ${subject.slice(0, 50)}`,
            outcome: "success",
          });
        } catch {
          // Non-blocking audit log
        }
      } catch (syncErr) {
        console.warn("[Customer Enquiry DB2 Mirror Warning]", syncErr);
      }
    }

    // Revalidate customer, astrologer, and super admin dashboard paths immediately
    revalidatePath("/customer", "page");
    revalidatePath("/customer/enquiries", "page");
    revalidatePath("/astrologer/dashboard", "page");
    revalidatePath("/astrologer/leads", "page");
    revalidatePath("/super-admin", "page");
    revalidatePath("/super-admin/leads", "page");
    revalidatePath("/super-admin/analytics", "page");
    revalidatePath("/super-admin/audit-logs", "page");
    revalidatePath("/admin", "page");
    revalidatePath("/admin/leads", "page");

    return {
      success: true,
      data: { id: createdLeadId || "" },
    };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "An unexpected error occurred while submitting enquiry.",
    };
  }
}

