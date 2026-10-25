"use server";

// =====================================================
// CUSTOMER DATA ACCESS & SERVER ACTIONS (Phase 1)
// =====================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCustomerContext } from "@/lib/auth/customer-guard";
import { checkRateLimit } from "@/lib/security/rate-limit";
import type {
  LeadStatus,
  CustomerBooking,
  CustomerNotification,
  BookingStatus,
  ConsultationMode,
  ConsultationMessage,
} from "@/lib/types/database.types";
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
    emailVerified: boolean;
  };
  stats: {
    totalEnquiries: number;
    pendingEnquiries: number;
    assignedEnquiries: number;
    completedEnquiries: number;
    totalBookings: number;
    upcomingBookings: number;
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

    // Query authenticated customer's bookings count if table exists
    let totalBookings = 0;
    let upcomingBookings = 0;
    try {
      const { data: bookings } = await supabase
        .from("customer_bookings")
        .select("id, status, scheduled_at")
        .eq("customer_id", user.id);

      if (bookings && bookings.length > 0) {
        totalBookings = bookings.length;
        upcomingBookings = bookings.filter(
          (b) => b.status === "confirmed" || b.status === "pending"
        ).length;
      }
    } catch {
      // customer_bookings may not exist yet on fresh installations
    }

    const isEmailVerified = Boolean(user.email_confirmed_at);

    return {
      success: true,
      data: {
        profile: {
          id: user.id,
          fullName: profile.full_name || "Customer",
          email: user.email || null,
          emailVerified: isEmailVerified,
        },
        stats: {
          totalEnquiries,
          pendingEnquiries,
          assignedEnquiries,
          completedEnquiries,
          totalBookings,
          upcomingBookings,
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
/**
 * Server Action to submit an enquiry reliably using authenticated customer context.
 * Enforces rate limiting, input normalization, authoritative astrologer eligibility,
 * and canonical transactional lead capture via submit_customer_enquiry RPC.
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

    // 1. Enforce rate limiting: 5 enquiries per minute per customer
    const rateLimit = checkRateLimit(`enquiry:customer:${user.id}`, 5, 60_000);
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: `Submission rate limit exceeded. Please wait ${rateLimit.retryAfterSeconds} seconds before trying again.`,
      };
    }

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

    // Call canonical transactional RPC
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

    if (rpcErr || !rpcLead) {
      // Safe error return without leaking internal database schemas or credentials
      const safeMessage =
        rpcErr?.message?.includes("wait a moment")
          ? rpcErr.message
          : rpcErr?.message?.includes("listing not found")
          ? "The selected astrologer is not available."
          : "Failed to submit enquiry. Please verify your input and try again.";

      return {
        success: false,
        error: safeMessage,
      };
    }

    const createdLeadId = rpcLead.id;

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

        const { error: db2UpsertErr } = await db2Client.from("leads").upsert({
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

        if (db2UpsertErr) {
          console.error("[Customer Enquiry DB2 Sync Error]", {
            leadId: createdLeadId,
            message: db2UpsertErr.message,
          });
        }

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
        console.error("[Customer Enquiry DB2 Mirror Failed]", {
          leadId: createdLeadId,
          error: syncErr instanceof Error ? syncErr.message : "Unknown error",
        });
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
      data: { id: createdLeadId },
    };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "An unexpected error occurred while submitting enquiry.",
    };
  }
}

// =====================================================
// CUSTOMER BOOKINGS SERVER ACTIONS (Phase D)
// =====================================================

/**
 * Loads all bookings for the authenticated customer.
 */
export async function getCustomerBookings(): Promise<
  AuthResult<CustomerBooking[]>
> {
  try {
    const { user, target } = await requireCustomerContext();
    const supabase = await createClient(target);

    const { data: bookings, error } = await supabase
      .from("customer_bookings")
      .select(`
        id,
        customer_id,
        astrologer_id,
        service_type,
        consultation_mode,
        scheduled_at,
        duration_minutes,
        status,
        price,
        notes,
        cancellation_reason,
        cancelled_at,
        created_at,
        updated_at
      `)
      .eq("customer_id", user.id)
      .order("scheduled_at", { ascending: true });

    if (error) {
      return {
        success: false,
        error: `Failed to load bookings: ${error.message}`,
      };
    }

    const rawBookings = bookings || [];
    const astroIds = Array.from(new Set(rawBookings.map((b) => b.astrologer_id)));

    let astroNameMap: Record<string, string> = {};
    if (astroIds.length > 0) {
      const { data: astrologers } = await supabase
        .from("astrologer_profiles")
        .select("id, display_name")
        .in("id", astroIds);

      if (astrologers) {
        astroNameMap = Object.fromEntries(
          astrologers.map((a) => [a.id, a.display_name])
        );
      }
    }

    const result: CustomerBooking[] = rawBookings.map((b) => ({
      id: b.id,
      customer_id: b.customer_id,
      astrologer_id: b.astrologer_id,
      astrologer_name: astroNameMap[b.astrologer_id] || "Vedic Astrologer",
      service_type: b.service_type,
      consultation_mode: b.consultation_mode as ConsultationMode,
      scheduled_at: b.scheduled_at,
      duration_minutes: b.duration_minutes,
      status: b.status as BookingStatus,
      price: Number(b.price),
      notes: b.notes,
      cancellation_reason: b.cancellation_reason,
      cancelled_at: b.cancelled_at,
      created_at: b.created_at,
      updated_at: b.updated_at,
    }));

    return {
      success: true,
      data: result,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load bookings.",
    };
  }
}

/**
 * Creates a persistent booking using server-side slot check and overlap prevention.
 */
export async function createCustomerBookingAction(payload: {
  astrologer_id: string;
  service_type: string;
  consultation_mode: ConsultationMode;
  scheduled_at: string;
  duration_minutes?: number;
  price?: number;
  notes?: string;
}): Promise<AuthResult<CustomerBooking>> {
  try {
    const { user, target } = await requireCustomerContext();

    // Rate limiting: 5 booking attempts per minute per customer
    const rateLimit = checkRateLimit(`booking:customer:${user.id}`, 5, 60_000);
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: `Booking rate limit exceeded. Please wait ${rateLimit.retryAfterSeconds} seconds.`,
      };
    }

    const supabase = await createClient(target);

    // Call book_astrologer_consultation RPC
    const { data: booking, error: rpcErr } = await supabase.rpc(
      "book_astrologer_consultation",
      {
        p_astrologer_id: payload.astrologer_id,
        p_service_type: payload.service_type,
        p_consultation_mode: payload.consultation_mode,
        p_scheduled_at: payload.scheduled_at,
        p_duration_minutes: payload.duration_minutes || 30,
        p_price: payload.price || 0.0,
        p_notes: payload.notes || null,
      }
    );

    if (rpcErr || !booking) {
      const safeMessage =
        rpcErr?.message?.includes("available") || rpcErr?.message?.includes("advance")
          ? rpcErr.message
          : "Unable to complete booking. Please select another slot or astrologer.";

      return {
        success: false,
        error: safeMessage,
      };
    }

    revalidatePath("/customer/bookings", "page");
    revalidatePath("/customer", "page");

    return {
      success: true,
      data: booking as CustomerBooking,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to schedule booking.",
    };
  }
}

/**
 * Cancels a booking owned by the authenticated customer.
 */
export async function cancelCustomerBookingAction(
  bookingId: string,
  reason?: string
): Promise<AuthResult<{ success: boolean }>> {
  try {
    const { user, target } = await requireCustomerContext();
    const supabase = await createClient(target);

    // Verify booking ownership and cancellable status
    const { data: booking, error: fetchErr } = await supabase
      .from("customer_bookings")
      .select("id, customer_id, status, astrologer_id")
      .eq("id", bookingId)
      .eq("customer_id", user.id)
      .maybeSingle();

    if (fetchErr || !booking) {
      return {
        success: false,
        error: "Booking record not found or access unauthorized.",
      };
    }

    if (booking.status === "cancelled") {
      return { success: true, data: { success: true } };
    }

    if (booking.status === "completed") {
      return {
        success: false,
        error: "Cannot cancel a consultation that has already been completed.",
      };
    }

    const now = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from("customer_bookings")
      .update({
        status: "cancelled",
        cancellation_reason: reason || "Cancelled by customer",
        cancelled_at: now,
        cancelled_by: user.id,
        updated_at: now,
      })
      .eq("id", bookingId)
      .eq("customer_id", user.id);

    if (updateErr) {
      return {
        success: false,
        error: "Failed to cancel booking. Please try again.",
      };
    }

    // Insert persistent cancellation notification
    try {
      await supabase.from("customer_notifications").insert({
        customer_id: user.id,
        title: "Booking Cancelled",
        message: "Your consultation appointment has been cancelled.",
        link_url: "/customer/bookings",
        event_type: "booking_cancelled",
        metadata: { booking_id: bookingId },
      });
    } catch {
      // Non-blocking notification
    }

    revalidatePath("/customer/bookings", "page");
    revalidatePath("/customer", "page");

    return {
      success: true,
      data: { success: true },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to cancel booking.",
    };
  }
}

// =====================================================
// CUSTOMER NOTIFICATIONS SERVER ACTIONS (Phase G)
// =====================================================

/**
 * Loads persistent notifications for the authenticated customer.
 */
export async function getCustomerNotifications(): Promise<
  AuthResult<CustomerNotification[]>
> {
  try {
    const { user, target } = await requireCustomerContext();
    const supabase = await createClient(target);

    const { data: notifications, error } = await supabase
      .from("customer_notifications")
      .select("*")
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return {
        success: false,
        error: `Failed to load notifications: ${error.message}`,
      };
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
 * Marks a notification as read for the authenticated customer.
 */
export async function markNotificationReadAction(
  notificationId: string
): Promise<AuthResult<{ success: boolean }>> {
  try {
    const { user, target } = await requireCustomerContext();
    const supabase = await createClient(target);

    const { error } = await supabase
      .from("customer_notifications")
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq("id", notificationId)
      .eq("customer_id", user.id);

    if (error) {
      return {
        success: false,
        error: "Failed to update notification status.",
      };
    }

    revalidatePath("/customer/notification", "page");
    return {
      success: true,
      data: { success: true },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to mark notification.",
    };
  }
}

// =====================================================
// DIRECT CONSULTATION MESSAGING SERVER ACTIONS (Problem 4)
// =====================================================

/**
 * Loads the discussion thread / written predictions for an enquiry.
 * Verified to only return messages if caller is the owner customer, assigned astrologer, or admin.
 */
export async function getConsultationMessages(
  leadId: string
): Promise<AuthResult<ConsultationMessage[]>> {
  try {
    const { user, target } = await requireCustomerContext();
    const supabase = await createClient(target);

    // Verify lead ownership
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, customer_id")
      .eq("id", leadId)
      .eq("customer_id", user.id)
      .maybeSingle();

    if (leadErr || !lead) {
      return { success: false, error: "Consultation enquiry not found or access denied." };
    }

    const { data: messages, error } = await supabase
      .from("consultation_messages")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    const rawMsgs = messages || [];
    const senderIds = Array.from(new Set(rawMsgs.map((m) => m.sender_id)));

    let senderMap: Record<string, string> = {};
    if (senderIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", senderIds);
      if (profiles) {
        senderMap = Object.fromEntries(profiles.map((p) => [p.id, p.full_name || "User"]));
      }
    }

    const result: ConsultationMessage[] = rawMsgs.map((m) => ({
      id: m.id,
      lead_id: m.lead_id,
      sender_id: m.sender_id,
      sender_name: senderMap[m.sender_id] || "Astrologer",
      sender_role: m.sender_role,
      message: m.message,
      prediction_title: m.prediction_title,
      is_official_prediction: m.is_official_prediction,
      attachments: m.attachments,
      created_at: m.created_at,
    }));

    return { success: true, data: result };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load messages.",
    };
  }
}

/**
 * Sends a message from the authenticated customer on their consultation enquiry.
 */
export async function sendCustomerConsultationMessageAction(
  leadId: string,
  message: string
): Promise<AuthResult<ConsultationMessage>> {
  try {
    const { user, target } = await requireCustomerContext();
    const cleanMessage = (message || "").trim();

    if (!cleanMessage) {
      return { success: false, error: "Message content cannot be empty." };
    }

    const rateLimit = checkRateLimit(`msg:cust:${user.id}`, 15, 60_000);
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: `Message rate limit reached. Please wait ${rateLimit.retryAfterSeconds}s.`,
      };
    }

    const supabase = await createClient(target);

    // Verify lead ownership
    const { data: lead } = await supabase
      .from("leads")
      .select("id, customer_id, astrologer_id")
      .eq("id", leadId)
      .eq("customer_id", user.id)
      .maybeSingle();

    if (!lead) {
      return { success: false, error: "Consultation enquiry not found." };
    }

    const { data: inserted, error } = await supabase
      .from("consultation_messages")
      .insert({
        lead_id: leadId,
        sender_id: user.id,
        sender_role: "customer",
        message: cleanMessage,
        is_official_prediction: false,
      })
      .select("*")
      .single();

    if (error || !inserted) {
      return { success: false, error: error?.message || "Failed to send message." };
    }

    revalidatePath(`/customer/enquiries/${leadId}`, "page");
    return { success: true, data: inserted as ConsultationMessage };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to send message.",
    };
  }
}

