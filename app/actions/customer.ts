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
  CustomerFullProfile,
  ConsultationReview,
  CustomerBillingRecord,
} from "@/lib/types/database.types";
import type { AuthResult } from "@/lib/types/auth.types";
import { createInAppNotification } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";

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

    // Concurrently query authenticated customer's leads and bookings in parallel
    const [leadsResult, bookingsResult] = await Promise.all([
      supabase
        .from("leads")
        .select("id, subject, message, status, created_at, astrologer_id")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("customer_bookings")
        .select("id, status, scheduled_at")
        .eq("customer_id", user.id),
    ]);

    const { data: leads, error } = leadsResult;

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

    let totalBookings = 0;
    let upcomingBookings = 0;
    const bookings = bookingsResult.data;

    if (bookings && bookings.length > 0) {
      totalBookings = bookings.length;
      upcomingBookings = bookings.filter(
        (b) => b.status === "confirmed" || b.status === "pending"
      ).length;
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

    // Normalize priority strictly to allowed database check constraint values ('low' | 'medium' | 'high' | 'urgent')
    const rawPriority = (payload.priority || "medium").toLowerCase();
    const priority =
      rawPriority === "normal"
        ? "medium"
        : ["low", "medium", "high", "urgent"].includes(rawPriority)
        ? rawPriority
        : "medium";

    // Normalize source_type strictly to allowed values ('platform' | 'direct' | 'campaign' | 'referral' | 'organic')
    const allowedSourceTypes = ["platform", "direct", "campaign", "referral", "organic"];
    const rawSourceType = (payload.source_type || "platform").toLowerCase();
    let resolvedAstrologerId = payload.astrologer_id || null;
    const sourceType = resolvedAstrologerId
      ? "direct"
      : allowedSourceTypes.includes(rawSourceType)
      ? rawSourceType
      : "platform";

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

    let createdLeadId: string | null = null;

    // Call canonical transactional RPC
    const { data: rpcLead, error: rpcErr } = await supabase.rpc(
      "submit_customer_enquiry",
      {
        p_subject: subject,
        p_message: message,
        p_astrologer_id: resolvedAstrologerId,
        p_source_type: sourceType,
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

    if (rpcLead && !rpcErr) {
      createdLeadId = rpcLead.id;
    } else {
      // Fallback: direct insert with admin client if RPC is unavailable or encounters schema cache issues
      console.warn("[Customer Enquiry RPC Fallback to Direct Insert]", rpcErr?.message || "No RPC data");
      try {
        const { createAdminClient } = await import("@/lib/supabase/admin");
        const targetAdmin = await createAdminClient(target);

        const leadPayload: Record<string, unknown> = {
          customer_id: user.id,
          astrologer_id: resolvedAstrologerId,
          subject,
          message,
          status: resolvedAstrologerId ? "assigned" : "new",
          source_type: sourceType,
          source_url: payload.source_url || null,
          contact_email: user.email,
          priority,
          qualification_status: "unqualified",
        };

        if (target === "admin") {
          leadPayload.customer_name = profile.full_name || "Customer";
        }

        const { data: directLead, error: directErr } = await targetAdmin
          .from("leads")
          .insert(leadPayload)
          .select("id")
          .single();

        if (directErr || !directLead) {
          console.error("[Customer Enquiry Direct Fallback Failed]", directErr);
          const safeMessage =
            rpcErr?.message?.includes("wait a moment")
              ? rpcErr.message
              : rpcErr?.message?.includes("listing not found")
              ? "The selected astrologer is not available."
              : directErr?.message || "Failed to submit enquiry. Please verify your input and try again.";

          return {
            success: false,
            error: safeMessage,
          };
        }

        createdLeadId = directLead.id;

        if (resolvedAstrologerId) {
          try {
            await targetAdmin
              .from("lead_assignments")
              .insert({
                lead_id: createdLeadId,
                astrologer_id: resolvedAstrologerId,
                status: "assigned",
              });
          } catch {
            // Non-blocking assignment
          }
        }
      } catch (fallbackCatchErr) {
        console.error("[Customer Enquiry Fallback Exception]", fallbackCatchErr);
        return {
          success: false,
          error: "Failed to submit enquiry. Please verify your input and try again.",
        };
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

        const { error: db2UpsertErr } = await db2Client.from("leads").upsert({
          id: createdLeadId,
          customer_id: user.id,
          astrologer_id: db2AstrologerId,
          subject,
          message,
          status: db2AstrologerId ? "assigned" : "new",
          source_type: db2AstrologerId ? "direct" : sourceType,
          priority,
          customer_name: profile.full_name || "Direct Customer",
          contact_email: user.email,
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

    // Send in-app notifications for both customer and assigned astrologer
    try {
      if (resolvedAstrologerId) {
        const { data: astProf } = await supabase
          .from("astrologer_profiles")
          .select("user_id, display_name")
          .eq("id", resolvedAstrologerId)
          .maybeSingle();

        if (astProf?.user_id) {
          await createInAppNotification({
            recipientUserId: astProf.user_id,
            title: "New Consultation Request",
            message: `${profile.full_name || "A seeker"} submitted: "${subject.slice(0, 45)}"`,
            linkUrl: `/astrologer/leads/${createdLeadId}`,
            eventType: "lead_assignment",
            metadata: { lead_id: createdLeadId },
          });
        }

        await createInAppNotification({
          recipientUserId: user.id,
          title: "Enquiry Submitted Successfully",
          message: `Your consultation enquiry "${subject.slice(0, 45)}" was sent to ${astProf?.display_name || "your astrologer"}.`,
          linkUrl: `/customer/enquiries/${createdLeadId}`,
          eventType: "enquiry_created",
          metadata: { lead_id: createdLeadId },
        });
      } else {
        await createInAppNotification({
          recipientUserId: user.id,
          title: "Enquiry Submitted",
          message: `Your consultation enquiry "${subject.slice(0, 45)}" has been received.`,
          linkUrl: `/customer/enquiries/${createdLeadId}`,
          eventType: "enquiry_created",
          metadata: { lead_id: createdLeadId },
        });
      }
    } catch (notifErr) {
      console.error("[createCustomerEnquiryAction Notification Warning]", notifErr);
    }

    // Revalidate customer, astrologer, and super admin dashboard paths immediately
    revalidatePath("/customer", "page");
    revalidatePath("/customer/enquiries", "page");
    revalidatePath("/customer/notification", "page");
    revalidatePath("/astrologer/dashboard", "page");
    revalidatePath("/astrologer/leads", "page");
    revalidatePath("/astrologer/notifications", "page");
    revalidatePath("/super-admin", "page");
    revalidatePath("/super-admin/leads", "page");
    revalidatePath("/super-admin/analytics", "page");
    revalidatePath("/super-admin/audit-logs", "page");
    revalidatePath("/admin", "page");
    revalidatePath("/admin/leads", "page");


    if (!createdLeadId) {
      return {
        success: false,
        error: "Failed to create enquiry record. Please try again.",
      };
    }

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
        updated_at,
        astrologer:astrologer_id(display_name)
      `)
      .eq("customer_id", user.id)
      .order("scheduled_at", { ascending: true });

    if (error) {
      return {
        success: false,
        error: `Failed to load bookings: ${error.message}`,
      };
    }

    const rawBookings = (bookings || []) as Array<
      CustomerBooking & {
        astrologer?: { display_name?: string | null } | null;
      }
    >;

    const result: CustomerBooking[] = rawBookings.map((b) => ({
      id: b.id,
      customer_id: b.customer_id,
      astrologer_id: b.astrologer_id,
      astrologer_name: b.astrologer?.display_name || "Vedic Astrologer",
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
 * The consultation price is derived AUTHORITATIVELY from the astrologer's profile
 * on the database side — never from client-submitted values.
 */
export async function createCustomerBookingAction(payload: {
  astrologer_id: string;
  service_type: string;
  consultation_mode: ConsultationMode;
  scheduled_at: string;
  duration_minutes?: number;
  // NOTE: price is intentionally omitted — it is derived from astrologer_profiles.consultation_fee
  // on the server side inside the book_astrologer_consultation RPC. Do NOT accept client prices.
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
    // Price is NOT passed — it is derived from astrologer_profiles.consultation_fee inside the RPC
    const { data: booking, error: rpcErr } = await supabase.rpc(
      "book_astrologer_consultation",
      {
        p_astrologer_id: payload.astrologer_id,
        p_service_type: payload.service_type,
        p_consultation_mode: payload.consultation_mode,
        p_scheduled_at: payload.scheduled_at,
        p_duration_minutes: payload.duration_minutes || 30,
        p_notes: payload.notes || null,
      }
    );

    if (rpcErr || !booking) {
      const safeMessage =
        rpcErr?.message?.includes("available") ||
        rpcErr?.message?.includes("advance") ||
        rpcErr?.message?.includes("slot") ||
        rpcErr?.message?.includes("mode")
          ? rpcErr.message
          : "Unable to complete booking. Please select another slot or astrologer.";

      return {
        success: false,
        error: safeMessage,
      };
    }

    revalidatePath("/customer/bookings", "page");
    revalidatePath("/customer", "page");
    revalidatePath("/astrologer/bookings", "page");

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
      await createInAppNotification({
        recipientUserId: user.id,
        title: "Booking Cancelled",
        message: "Your consultation appointment has been cancelled.",
        linkUrl: "/customer/bookings",
        eventType: "booking_cancelled",
        metadata: { booking_id: bookingId },
      });
    } catch {
      // Non-blocking notification
    }

    revalidatePath("/customer/bookings", "page");
    revalidatePath("/customer/notification", "page");
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
    const { user } = await requireCustomerContext();
    const admin = await createAdminClient("main");

    const { data: notifications, error } = await admin
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
    const { user } = await requireCustomerContext();
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
      return {
        success: false,
        error: "Failed to update notification status.",
      };
    }

    revalidatePath("/customer/notification", "page");
    revalidatePath("/customer", "layout");

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

/**
 * Deletes all notifications for the authenticated customer.
 */
export async function clearAllCustomerNotificationsAction(): Promise<
  AuthResult<{ success: boolean }>
> {
  try {
    const { user } = await requireCustomerContext();
    const admin = await createAdminClient("main");

    const { error } = await admin
      .from("customer_notifications")
      .delete()
      .eq("customer_id", user.id);

    if (error) {
      return {
        success: false,
        error: `Failed to clear notifications: ${error.message}`,
      };
    }

    revalidatePath("/customer/notification", "page");
    revalidatePath("/customer", "layout");

    return {
      success: true,
      data: { success: true },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to clear notifications.",
    };
  }
}

/**
 * Deletes a single notification for the authenticated customer.
 */
export async function deleteCustomerNotificationAction(
  notificationId: string
): Promise<AuthResult<{ success: boolean }>> {
  try {
    const { user } = await requireCustomerContext();
    const admin = await createAdminClient("main");

    const { error } = await admin
      .from("customer_notifications")
      .delete()
      .eq("id", notificationId)
      .eq("customer_id", user.id);

    if (error) {
      return {
        success: false,
        error: `Failed to delete notification: ${error.message}`,
      };
    }

    revalidatePath("/customer/notification", "page");
    revalidatePath("/customer", "layout");

    return {
      success: true,
      data: { success: true },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete notification.",
    };
  }
}

/**
 * Marks all unread notifications as read for the authenticated customer.
 */
export async function markAllCustomerNotificationsReadAction(): Promise<
  AuthResult<{ success: boolean }>
> {
  try {
    const { user } = await requireCustomerContext();
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
      return {
        success: false,
        error: "Failed to mark all notifications as read.",
      };
    }

    revalidatePath("/customer/notification", "page");
    revalidatePath("/customer", "layout");

    return {
      success: true,
      data: { success: true },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to mark all notifications.",
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
): Promise<AuthResult<ConsultationMessage[]> & { isClosed?: boolean }> {
  try {
    const { user } = await requireCustomerContext();
    const admin = await createAdminClient("main");

    // Verify lead ownership and status
    const { data: lead, error: leadErr } = await admin
      .from("leads")
      .select("id, customer_id, status")
      .eq("id", leadId)
      .eq("customer_id", user.id)
      .maybeSingle();

    if (leadErr || !lead) {
      return { success: false, error: "Consultation enquiry not found or access denied." };
    }

    let isLeadClosed = lead.status === "closed";
    if (!isLeadClosed) {
      const { data: closedAssign } = await admin
        .from("lead_assignments")
        .select("id, status")
        .eq("lead_id", leadId)
        .eq("status", "closed")
        .limit(1)
        .maybeSingle();
      if (closedAssign) {
        isLeadClosed = true;
      }
    }

    const { data: messages, error } = await admin
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
      const { data: profiles } = await admin
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
      sender_name: senderMap[m.sender_id] || (m.sender_role === "customer" ? "You" : "Astrologer"),
      sender_role: m.sender_role,
      message: m.message,
      prediction_title: m.prediction_title,
      is_official_prediction: m.is_official_prediction,
      attachments: m.attachments,
      created_at: m.created_at,
    }));

    return { success: true, data: result, isClosed: isLeadClosed };
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
    const { user } = await requireCustomerContext();
    const cleanMessage = (message || "").trim();
    const cleanLeadId = (leadId || "").trim().toLowerCase();

    if (!cleanMessage) {
      return { success: false, error: "Message content cannot be empty." };
    }

    const rateLimit = checkRateLimit(`msg:cust:${user.id}`, 25, 60_000);
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: `Message rate limit reached. Please wait ${rateLimit.retryAfterSeconds}s.`,
      };
    }

    const admin = await createAdminClient("main");

    // Verify lead ownership and status
    const { data: lead } = await admin
      .from("leads")
      .select("id, customer_id, astrologer_id, status")
      .eq("id", cleanLeadId)
      .eq("customer_id", user.id)
      .maybeSingle();

    if (!lead) {
      return { success: false, error: "Consultation enquiry not found." };
    }

    // Check if query is closed either on lead or assignment
    let isLeadClosed = lead.status === "closed";
    if (!isLeadClosed) {
      const { data: closedAssign } = await admin
        .from("lead_assignments")
        .select("id, status")
        .eq("lead_id", cleanLeadId)
        .eq("status", "closed")
        .limit(1)
        .maybeSingle();
      if (closedAssign) {
        isLeadClosed = true;
      }
    }

    if (isLeadClosed) {
      return {
        success: false,
        error: "This consultation enquiry has been closed by the astrologer. Further messaging is disabled.",
      };
    }

    const { data: inserted, error } = await admin
      .from("consultation_messages")
      .insert({
        lead_id: cleanLeadId,
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

    // Notify the assigned astrologer via in-app notification
    try {
      let astrologerProfileId = lead.astrologer_id;
      let assignmentId: string | null = null;

      const { data: assignment } = await admin
        .from("lead_assignments")
        .select("id, astrologer_id")
        .eq("lead_id", cleanLeadId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (assignment) {
        assignmentId = assignment.id;
        if (!astrologerProfileId) astrologerProfileId = assignment.astrologer_id;
      }

      if (astrologerProfileId) {
        const { data: astProfile } = await admin
          .from("astrologer_profiles")
          .select("user_id")
          .eq("id", astrologerProfileId)
          .maybeSingle();

        if (astProfile?.user_id) {
          const { data: custProfile } = await admin
            .from("profiles")
            .select("full_name")
            .eq("id", user.id)
            .maybeSingle();

          const senderName = custProfile?.full_name || "Customer";

          await createInAppNotification({
            recipientUserId: astProfile.user_id,
            title: "New Message from Client",
            message: `${senderName}: "${cleanMessage.slice(0, 60)}"`,
            linkUrl: `/astrologer/leads/${assignmentId || cleanLeadId}`,
            eventType: "consultation_message",
            metadata: { lead_id: cleanLeadId, customer_id: user.id },
          });
        }
      }
    } catch (notifErr) {
      console.error("[sendCustomerConsultationMessageAction Notification Warning]", notifErr);
    }

    revalidatePath(`/customer/enquiries/${cleanLeadId}`, "page");
    revalidatePath(`/astrologer/leads/${cleanLeadId}`, "page");
    revalidatePath("/astrologer/leads", "page");
    revalidatePath("/astrologer/notifications", "page");
    revalidatePath("/astrologer/dashboard", "page");

    return { success: true, data: inserted as ConsultationMessage };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to send message.",
    };
  }
}


// =====================================================
// CUSTOMER PROFILE & BIRTH DETAILS ACTIONS (Phase C)
// =====================================================

/**
 * Loads the full profile with birth details for the authenticated customer.
 */
export async function getCustomerFullProfile(): Promise<
  AuthResult<CustomerFullProfile>
> {
  try {
    const { user, target } = await requireCustomerContext();
    const supabase = await createClient(target);

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (error || !profile) {
      return {
        success: false,
        error: error?.message || "Failed to load customer profile.",
      };
    }

    const fullProfile: CustomerFullProfile = {
      id: profile.id,
      full_name: profile.full_name || null,
      email: user.email || null,
      phone: profile.phone || null,
      date_of_birth: profile.date_of_birth || null,
      time_of_birth: profile.time_of_birth || null,
      birthplace: profile.birthplace || null,
      gender: profile.gender || null,
      avatar_url: profile.avatar_url || null,
      emailVerified: Boolean(user.email_confirmed_at),
      role: profile.role,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
    };

    return { success: true, data: fullProfile };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load profile.",
    };
  }
}

/**
 * Updates personal and birth chart details for the authenticated customer.
 */
export async function updateCustomerProfileAction(payload: {
  full_name?: string;
  phone?: string;
  date_of_birth?: string | null;
  time_of_birth?: string | null;
  birthplace?: string | null;
  gender?: "male" | "female" | "other" | "prefer_not_to_say" | null;
}): Promise<AuthResult<CustomerFullProfile>> {
  try {
    const { user, target } = await requireCustomerContext();

    // Rate limiting: 10 profile updates per minute
    const rateLimit = checkRateLimit(`profile:cust:${user.id}`, 10, 60_000);
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: `Please wait ${rateLimit.retryAfterSeconds}s before updating your profile again.`,
      };
    }

    // Input validations
    const cleanName = payload.full_name?.trim();
    if (cleanName && (cleanName.length < 2 || cleanName.length > 100)) {
      return { success: false, error: "Full name must be between 2 and 100 characters." };
    }

    const cleanPhone = payload.phone?.trim() || null;
    if (cleanPhone && !/^\+?[0-9\s\-()]{7,20}$/.test(cleanPhone)) {
      return { success: false, error: "Please enter a valid phone number (7-20 digits)." };
    }

    const cleanBirthplace = payload.birthplace?.trim() || null;
    if (cleanBirthplace && cleanBirthplace.length > 150) {
      return { success: false, error: "Birthplace must not exceed 150 characters." };
    }

    const supabase = await createClient(target);

    // Call update_customer_profile RPC
    const { error: rpcErr } = await supabase.rpc("update_customer_profile", {
      p_full_name: cleanName || null,
      p_phone: cleanPhone,
      p_date_of_birth: payload.date_of_birth || null,
      p_time_of_birth: payload.time_of_birth || null,
      p_birthplace: cleanBirthplace,
      p_gender: payload.gender || null,
    });

    if (rpcErr) {
      // Fallback direct update with RLS guard
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({
          full_name: cleanName || undefined,
          phone: cleanPhone,
          date_of_birth: payload.date_of_birth || null,
          time_of_birth: payload.time_of_birth || null,
          birthplace: cleanBirthplace,
          gender: payload.gender || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (updateErr) {
        return { success: false, error: updateErr.message };
      }
    }

    revalidatePath("/customer", "page");
    revalidatePath("/customer/profile", "page");

    return getCustomerFullProfile();
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update profile.",
    };
  }
}

// =====================================================
// CONSULTATION REVIEWS & RATINGS (Phase D)
// =====================================================

/**
 * Loads the submitted review for a completed consultation.
 */
export async function getConsultationReview(
  leadId: string
): Promise<AuthResult<ConsultationReview | null>> {
  try {
    const { user, target } = await requireCustomerContext();
    const supabase = await createClient(target);

    const { data: review, error } = await supabase
      .from("consultation_reviews")
      .select("*")
      .eq("lead_id", leadId)
      .eq("customer_id", user.id)
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: (review || null) as ConsultationReview | null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load review.",
    };
  }
}

/**
 * Submits an authentic 1-5 star review for a completed consultation.
 */
export async function submitConsultationReviewAction(payload: {
  lead_id: string;
  rating: number;
  review_text?: string;
}): Promise<AuthResult<ConsultationReview>> {
  try {
    const { user, target } = await requireCustomerContext();

    if (!payload.rating || payload.rating < 1 || payload.rating > 5) {
      return { success: false, error: "Please provide a rating between 1 and 5 stars." };
    }

    const cleanText = (payload.review_text || "").trim();
    if (cleanText.length > 2000) {
      return { success: false, error: "Review feedback must not exceed 2000 characters." };
    }

    const rateLimit = checkRateLimit(`review:cust:${user.id}`, 5, 60_000);
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: `Please wait ${rateLimit.retryAfterSeconds}s before submitting another review.`,
      };
    }

    const supabase = await createClient(target);

    // Call submit_consultation_review RPC
    const { data: review, error: rpcErr } = await supabase.rpc("submit_consultation_review", {
      p_lead_id: payload.lead_id,
      p_rating: payload.rating,
      p_review_text: cleanText || null,
    });

    if (rpcErr || !review) {
      return {
        success: false,
        error: rpcErr?.message || "Failed to submit consultation review.",
      };
    }

    revalidatePath(`/customer/enquiries/${payload.lead_id}`, "page");
    revalidatePath("/customer", "page");

    return { success: true, data: review as ConsultationReview };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to submit review.",
    };
  }
}

// =====================================================
// UNREAD NOTIFICATIONS COUNT & BILLING HISTORY (Phase F & Scope 6)
// =====================================================

/**
 * Fetches the unread notification count for the current authenticated customer.
 */
export async function getCustomerUnreadNotificationCount(): Promise<
  AuthResult<number>
> {
  try {
    const { user } = await requireCustomerContext();
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


/**
 * Loads authentic billing / transaction history derived from completed or scheduled bookings.
 */
export async function getCustomerBillingHistory(): Promise<
  AuthResult<CustomerBillingRecord[]>
> {
  try {
    const { user, target } = await requireCustomerContext();
    const supabase = await createClient(target);

    const { data: bookings, error } = await supabase
      .from("customer_bookings")
      .select(`
        id,
        service_type,
        consultation_mode,
        scheduled_at,
        status,
        price,
        created_at,
        astrologer_id
      `)
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false });

    if (error || !bookings) {
      return { success: true, data: [] };
    }

    const astroIds = Array.from(new Set(bookings.map((b) => b.astrologer_id)));
    let astroMap: Record<string, string> = {};
    if (astroIds.length > 0) {
      const { data: astros } = await supabase
        .from("astrologer_profiles")
        .select("id, display_name")
        .in("id", astroIds);
      if (astros) {
        astroMap = Object.fromEntries(astros.map((a) => [a.id, a.display_name]));
      }
    }

    const billingRecords: CustomerBillingRecord[] = bookings.map((b) => {
      const priceNum = Number(b.price) || 0;
      return {
        id: `tx-${b.id.slice(0, 8)}`,
        booking_id: b.id,
        service_type: b.service_type,
        consultation_mode: b.consultation_mode as ConsultationMode,
        astrologer_name: astroMap[b.astrologer_id] || "Vedic Astrologer",
        amount: priceNum,
        currency: "INR",
        payment_status: priceNum === 0 ? "complimentary" : b.status === "completed" ? "paid" : "pending",
        transaction_ref: `JS-${b.created_at.slice(0, 10).replace(/-/g, "")}-${b.id.slice(0, 6).toUpperCase()}`,
        created_at: b.created_at,
      };
    });

    return { success: true, data: billingRecords };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load billing history.",
    };
  }
}


