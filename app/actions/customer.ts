"use server";

// =====================================================
// CUSTOMER DATA ACCESS & SERVER ACTIONS (Phase 1)
// =====================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCustomerContext } from "@/lib/auth/customer-guard";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { parseSchedulingDateTime, formatExactDateTime } from "@/lib/astrologer/format";
import { isValidUUID } from "@/lib/validations/lead";
import { isRpcNotInstalledError } from "@/lib/admin/audit";
import { assertAstrologerAvailable, loadAstrologerAvailability } from "@/lib/availability/server";
import { hasWorkingRules, generateSlots } from "@/lib/availability/slots";
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
import { toUuidOrNull } from "@/lib/security/postgrest";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  encryptCustomerBirthData,
  decryptCustomerBirthData,
  isBeneficiaryEncryptionConfigured,
  getActiveKeyVersion,
} from "@/lib/financial/encryption";

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
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load customer dashboard data.",
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
        payment_mode,
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

    const bookingIds = rawBookings.map((booking) => booking.id);
    const astrologerIds = Array.from(new Set(rawBookings.map((booking) => booking.astrologer_id)));
    const paymentAdmin = bookingIds.length || astrologerIds.length
      ? await createAdminClient("main")
      : null;
    const [directPaymentResult, astrologerResult] = paymentAdmin
      ? await Promise.all([
          bookingIds.length
            ? paymentAdmin
                .from("direct_consultation_payments")
                .select("id, booking_id, utr, amount_paise, payment_date, status, rejection_reason, submitted_at")
                .in("booking_id", bookingIds)
                .order("submitted_at", { ascending: false })
            : Promise.resolve({ data: [], error: null }),
          astrologerIds.length
            ? paymentAdmin.from("astrologer_profiles").select("id, upi_vpa").in("id", astrologerIds)
            : Promise.resolve({ data: [], error: null }),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];

    if (directPaymentResult.error) {
      console.warn("[getCustomerBookings] direct_consultation_payments lookup:", directPaymentResult.error.message);
    }
    if (astrologerResult.error) {
      return { success: false, error: `Failed to load astrologer payment details: ${astrologerResult.error.message}` };
    }

    const directPayments = new Map<string, NonNullable<CustomerBooking["direct_payment"]>>();
    for (const payment of (directPaymentResult.error ? [] : directPaymentResult.data) || []) {
      if (!directPayments.has(payment.booking_id)) {
        directPayments.set(payment.booking_id, payment as NonNullable<CustomerBooking["direct_payment"]>);
      }
    }
    const upiVpas = new Map((astrologerResult.data || []).map((astrologer) => [astrologer.id, astrologer.upi_vpa]));

    const result: CustomerBooking[] = rawBookings.map((b) => ({
      id: b.id,
      customer_id: b.customer_id,
      astrologer_id: b.astrologer_id,
      astrologer_name: b.astrologer?.display_name || "Vedic Astrologer",
      astrologer_upi_vpa: upiVpas.get(b.astrologer_id) || null,
      service_type: b.service_type,
      consultation_mode: b.consultation_mode as ConsultationMode,
      scheduled_at: b.scheduled_at,
      duration_minutes: b.duration_minutes,
      status: b.status as BookingStatus,
      price: Number(b.price),
      payment_mode: b.payment_mode,
      direct_payment: directPayments.get(b.id) || null,
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

    const parsedScheduledDate = parseSchedulingDateTime(payload.scheduled_at);
    if (!parsedScheduledDate || isNaN(parsedScheduledDate.getTime())) {
      return {
        success: false,
        error: "Invalid scheduled date and time.",
      };
    }
    const canonicalScheduledAt = parsedScheduledDate.toISOString();

    // Respect the astrologer's configured working hours, breaks and time off (no-op if none configured)
    const availabilityAstrologerId = toUuidOrNull(payload.astrologer_id);
    if (availabilityAstrologerId) {
      try {
        const availability = await assertAstrologerAvailable(
          availabilityAstrologerId,
          parsedScheduledDate,
          Number(payload.duration_minutes) || 30
        );
        if (!availability.available) {
          return { success: false, error: availability.reason };
        }
      } catch (availabilityErr) {
        console.error("[createCustomerBookingAction] availability check failed:", availabilityErr);
        return {
          success: false,
          error: "Unable to verify the astrologer's availability right now. Please try again.",
        };
      }
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
        p_scheduled_at: canonicalScheduledAt,
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

    if (booking.status === "completed" || booking.status === "no_show") {
      return {
        success: false,
        error: "Cannot cancel a consultation that has already been completed.",
      };
    }

    const now = new Date().toISOString();
    // Conditional on a cancellable status so a concurrent completion cannot be overwritten
    const { data: cancelledRows, error: updateErr } = await supabase
      .from("customer_bookings")
      .update({
        status: "cancelled",
        cancellation_reason: (reason || "Cancelled by customer").slice(0, 500),
        cancelled_at: now,
        cancelled_by: user.id,
        updated_at: now,
      })
      .eq("id", bookingId)
      .eq("customer_id", user.id)
      .in("status", ["pending", "confirmed"])
      .select("id");

    if (updateErr) {
      return {
        success: false,
        error: "Failed to cancel booking. Please try again.",
      };
    }
    if (!cancelledRows || cancelledRows.length === 0) {
      return {
        success: false,
        error: "This booking can no longer be cancelled. Please refresh the page.",
      };
    }

    // Keep the consultation room consistent with the booking and tell the astrologer.
    // Both are best-effort and logged; the cancellation itself is already persisted.
    try {
      const admin = await createAdminClient("main");
      const { error: meetingErr } = await admin
        .from("consultation_meetings")
        .update({ status: "cancelled", updated_at: now })
        .eq("booking_id", bookingId)
        .in("status", ["scheduled", "waiting", "active"]);
      if (meetingErr) {
        console.error("[cancelCustomerBookingAction] meeting sync failed:", meetingErr.message);
      }

      const { data: astro } = await admin
        .from("astrologer_profiles")
        .select("user_id")
        .eq("id", booking.astrologer_id)
        .maybeSingle();
      if (astro?.user_id) {
        await createInAppNotification({
          recipientUserId: astro.user_id,
          title: "Consultation Cancelled by Customer",
          message: "A customer cancelled an upcoming consultation with you.",
          linkUrl: "/astrologer/bookings",
          eventType: "booking_cancelled",
          metadata: { booking_id: bookingId },
        });
      }
    } catch (syncErr) {
      console.error("[cancelCustomerBookingAction] post-cancel sync failed:", syncErr);
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
      error:
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while cancelling your booking.",
    };
  }
}

/**
 * Reschedules a customer's consultation booking to an available future slot.
 * Concurrency-safe, validates astrologer weekly availability, prevents overlaps,
 * and maintains immutable rescheduling audit history.
 */
export async function rescheduleCustomerBookingAction(params: {
  bookingId: string;
  newScheduledAt: string;
  reason?: string;
}): Promise<AuthResult<CustomerBooking>> {
  try {
    const { user, target } = await requireCustomerContext();
    const { bookingId, newScheduledAt, reason } = params;

    if (!isValidUUID(bookingId)) {
      return { success: false, error: "Invalid booking ID format." };
    }

    const targetDate = new Date(newScheduledAt);
    if (Number.isNaN(targetDate.getTime())) {
      return { success: false, error: "Invalid date and time specified." };
    }

    const minAllowedTime = Date.now() + 10 * 60 * 1000; // 10 minutes in future
    if (targetDate.getTime() < minAllowedTime) {
      return { success: false, error: "Appointments must be scheduled at least 10 minutes in advance." };
    }

    const supabase = await createClient(target);
    const admin = await createAdminClient("main");

    // 1. Fetch current booking details and verify customer ownership
    const { data: booking, error: fetchErr } = await supabase
      .from("customer_bookings")
      .select("*, astrologer:astrologer_profiles(id, display_name, user_id)")
      .eq("id", bookingId)
      .eq("customer_id", user.id)
      .maybeSingle();

    if (fetchErr || !booking) {
      return { success: false, error: "Booking record not found or access unauthorized." };
    }

    if (booking.status === "completed" || booking.status === "no_show") {
      return { success: false, error: "Cannot reschedule a completed or no-show consultation." };
    }

    if (booking.status === "cancelled") {
      return { success: false, error: "Cannot reschedule a cancelled consultation." };
    }

    if (new Date(booking.scheduled_at).getTime() === targetDate.getTime()) {
      return { success: false, error: "Requested slot is identical to current appointment slot." };
    }

    // 2. Validate Astrologer Availability Rules (working hours & breaks)
    const availabilityCheck = await assertAstrologerAvailable(
      booking.astrologer_id,
      targetDate,
      booking.duration_minutes || 30
    );
    if (!availabilityCheck.available) {
      return { success: false, error: availabilityCheck.reason };
    }

    // 3. Execute atomic rescheduling RPC or fallback to hardened transaction
    let updatedBooking: CustomerBooking | null = null;
    const rpcRes = await supabase.rpc("reschedule_customer_consultation_booking", {
      p_booking_id: bookingId,
      p_new_scheduled_at: targetDate.toISOString(),
      p_reason: (reason || "").trim() || "Rescheduled by customer",
    });

    if (rpcRes.error) {
      if (rpcRes.error.code === "23505") {
        return { success: false, error: "The selected time slot is already booked. Please choose another slot." };
      }
      if (rpcRes.error.code === "P0002") {
        return { success: false, error: "Astrologer is currently unavailable for this booking." };
      }
      // If RPC is missing from unapplied local migration, perform fallback atomic update
      if (rpcRes.error.code === "42883" || isRpcNotInstalledError(rpcRes.error)) {
        // Fallback: Check overlapping bookings directly
        const newStart = targetDate.toISOString();
        const newEnd = new Date(targetDate.getTime() + (booking.duration_minutes || 30) * 60_000).toISOString();

        // Query precise overlap
        const { count: overlapCount } = await admin
          .from("customer_bookings")
          .select("id", { count: "exact", head: true })
          .eq("astrologer_id", booking.astrologer_id)
          .neq("id", bookingId)
          .in("status", ["pending", "confirmed"])
          .gte("scheduled_at", newStart)
          .lt("scheduled_at", newEnd);

        if ((overlapCount ?? 0) > 0) {
          return { success: false, error: "The selected time slot is already booked. Please choose another slot." };
        }

        const now = new Date().toISOString();
        const historyEntry = {
          rescheduled_at: now,
          rescheduled_by: user.id,
          rescheduled_by_role: "customer",
          previous_scheduled_at: booking.scheduled_at,
          new_scheduled_at: targetDate.toISOString(),
          reason: (reason || "").trim() || "Rescheduled by customer",
        };

        const existingHistory = Array.isArray(booking.reschedule_history) ? booking.reschedule_history : [];

        const { data: updatedRows, error: updateErr } = await admin
          .from("customer_bookings")
          .update({
            original_scheduled_at: booking.original_scheduled_at || booking.scheduled_at,
            scheduled_at: targetDate.toISOString(),
            reschedule_count: (booking.reschedule_count || 0) + 1,
            last_rescheduled_at: now,
            last_rescheduled_by: user.id,
            reschedule_reason: (reason || "").trim() || booking.reschedule_reason || null,
            reschedule_history: [...existingHistory, historyEntry],
            updated_at: now,
          })
          .eq("id", bookingId)
          .eq("customer_id", user.id)
          .in("status", ["pending", "confirmed"])
          .select("*");

        if (updateErr || !updatedRows || updatedRows.length === 0) {
          return { success: false, error: "Failed to reschedule booking. Please try again." };
        }
        updatedBooking = updatedRows[0] as CustomerBooking;
      } else {
        return { success: false, error: rpcRes.error.message || "Failed to reschedule booking." };
      }
    } else {
      updatedBooking = rpcRes.data as CustomerBooking;
    }

    if (!updatedBooking) {
      return { success: false, error: "Rescheduling was not completed." };
    }

    // 4. Synchronize Consultation Meeting record if one exists
    try {
      const now = new Date().toISOString();
      await admin
        .from("consultation_meetings")
        .update({
          scheduled_at: targetDate.toISOString(),
          updated_at: now,
        })
        .eq("booking_id", bookingId)
        .in("status", ["scheduled", "waiting"]);
    } catch (meetingErr) {
      console.warn("[rescheduleCustomerBookingAction] meeting sync notice:", meetingErr);
    }

    // 5. Send Realtime in-app notifications to Astrologer & Customer
    try {
      const formattedDate = formatExactDateTime(targetDate.toISOString());
      const astroUserId = (booking.astrologer as { user_id?: string })?.user_id;

      if (astroUserId) {
        await createInAppNotification({
          recipientUserId: astroUserId,
          title: "Consultation Appointment Rescheduled",
          message: `A customer rescheduled their ${booking.service_type} consultation to ${formattedDate}.`,
          linkUrl: "/astrologer/bookings",
          eventType: "booking_rescheduled",
          metadata: {
            booking_id: bookingId,
            previous_scheduled_at: booking.scheduled_at,
            new_scheduled_at: targetDate.toISOString(),
          },
        });
      }

      await createInAppNotification({
        recipientUserId: user.id,
        title: "Appointment Rescheduled",
        message: `Your ${booking.service_type} consultation has been rescheduled to ${formattedDate}.`,
        linkUrl: "/customer/bookings",
        eventType: "booking_rescheduled",
        metadata: {
          booking_id: bookingId,
          previous_scheduled_at: booking.scheduled_at,
          new_scheduled_at: targetDate.toISOString(),
        },
      });
    } catch (notifyErr) {
      console.warn("[rescheduleCustomerBookingAction] notification notice:", notifyErr);
    }

    // 6. Revalidate relevant cache paths
    revalidatePath("/customer/bookings", "page");
    revalidatePath("/astrologer/bookings", "page");
    revalidatePath("/astrologer/dashboard", "page");
    revalidatePath("/super-admin/bookings", "page");

    return {
      success: true,
      data: updatedBooking,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "An unexpected error occurred while rescheduling.",
    };
  }
}

/**
 * Loads available bookable slots for an astrologer on a given date (YYYY-MM-DD),
 * excluding existing bookings and respecting weekly working hours & breaks.
 */
export async function getAstrologerAvailableSlotsAction(params: {
  astrologerId: string;
  date: string; // YYYY-MM-DD
  durationMinutes?: number;
  excludeBookingId?: string;
}): Promise<AuthResult<{ restricted: boolean; slots: string[] }>> {
  try {
    const { astrologerId, date, durationMinutes = 30, excludeBookingId } = params;

    if (!isValidUUID(astrologerId)) {
      return { success: false, error: "Invalid astrologer ID." };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { success: false, error: "Invalid date format. Expected YYYY-MM-DD." };
    }

    const duration = Math.min(Math.max(durationMinutes, 10), 180);
    const dayStart = parseSchedulingDateTime(`${date}T00:00`);
    if (!dayStart) return { success: false, error: "Invalid calendar date." };

    const data = await loadAstrologerAvailability(astrologerId);
    const admin = await createAdminClient("main");

    let query = admin
      .from("customer_bookings")
      .select("id, scheduled_at, duration_minutes")
      .eq("astrologer_id", astrologerId)
      .in("status", ["pending", "confirmed"])
      .gte("scheduled_at", new Date(dayStart.getTime() - 181 * 60_000).toISOString())
      .lt("scheduled_at", new Date(dayStart.getTime() + 86_400_000).toISOString());

    if (excludeBookingId && isValidUUID(excludeBookingId)) {
      query = query.neq("id", excludeBookingId);
    }

    const { data: bookings, error } = await query;
    if (error) {
      console.warn("[getAstrologerAvailableSlotsAction] bookings lookup notice:", error.message);
    }

    // If astrologer hasn't configured availability rules, generate default working day slots
    // (e.g. 09:00 - 21:00 in 30-min increments)
    const effectiveRules = hasWorkingRules(data.rules)
      ? data.rules
      : [
          { weekday: 0, start: "09:00", end: "21:00", kind: "working" as const },
          { weekday: 1, start: "09:00", end: "21:00", kind: "working" as const },
          { weekday: 2, start: "09:00", end: "21:00", kind: "working" as const },
          { weekday: 3, start: "09:00", end: "21:00", kind: "working" as const },
          { weekday: 4, start: "09:00", end: "21:00", kind: "working" as const },
          { weekday: 5, start: "09:00", end: "21:00", kind: "working" as const },
          { weekday: 6, start: "09:00", end: "21:00", kind: "working" as const },
        ];

    const result = generateSlots({
      rules: effectiveRules,
      timeOff: data.timeOff,
      bookings: (bookings ?? []).map((b) => ({
        scheduledAt: b.scheduled_at as string,
        durationMinutes: (b.duration_minutes as number) || 30,
      })),
      date,
      durationMinutes: duration,
      stepMinutes: 30,
      minLeadMinutes: 10,
    });

    return {
      success: true,
      data: {
        restricted: true,
        slots: result.slots,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load available slots.",
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
    if (cleanMessage.length > 2000) {
      return { success: false, error: "Message must not exceed 2000 characters." };
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

    const rawProfile = profile as Record<string, unknown>;
    let resolvedDob: string | null = null;
    let resolvedTob: string | null = null;
    let resolvedBirthplace: string | null = null;

    // Strict Decryption Path: If encrypted columns exist, require valid encryption and fail closed.
    // If encrypted column is null (historical unmigrated record), allow read from legacy column during migration transition.
    if (rawProfile.encrypted_date_of_birth && typeof rawProfile.encrypted_date_of_birth === "string") {
      if (!isBeneficiaryEncryptionConfigured()) {
        return { success: false, error: "Secure profile decryption service is temporarily unavailable." };
      }
      try {
        resolvedDob = decryptCustomerBirthData(profile.id, "date_of_birth", rawProfile.encrypted_date_of_birth);
      } catch {
        return { success: false, error: "Unable to verify secure birth chart credentials. Please contact support." };
      }
    } else {
      resolvedDob = (rawProfile.date_of_birth as string | null) || null;
    }

    if (rawProfile.encrypted_time_of_birth && typeof rawProfile.encrypted_time_of_birth === "string") {
      if (!isBeneficiaryEncryptionConfigured()) {
        return { success: false, error: "Secure profile decryption service is temporarily unavailable." };
      }
      try {
        resolvedTob = decryptCustomerBirthData(profile.id, "time_of_birth", rawProfile.encrypted_time_of_birth);
      } catch {
        return { success: false, error: "Unable to verify secure birth time credentials." };
      }
    } else {
      resolvedTob = (rawProfile.time_of_birth as string | null) || null;
    }

    if (rawProfile.encrypted_birthplace && typeof rawProfile.encrypted_birthplace === "string") {
      if (!isBeneficiaryEncryptionConfigured()) {
        return { success: false, error: "Secure profile decryption service is temporarily unavailable." };
      }
      try {
        resolvedBirthplace = decryptCustomerBirthData(profile.id, "birthplace", rawProfile.encrypted_birthplace);
      } catch {
        return { success: false, error: "Unable to verify secure birthplace credentials." };
      }
    } else {
      resolvedBirthplace = (rawProfile.birthplace as string | null) || null;
    }

    const fullProfile: CustomerFullProfile = {
      id: profile.id,
      full_name: profile.full_name || null,
      email: user.email || null,
      phone: profile.phone || null,
      date_of_birth: resolvedDob,
      time_of_birth: resolvedTob,
      birthplace: resolvedBirthplace,
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

    // Prepare encrypted birth data if encryption engine is configured
    let encryptedDob: string | null = null;
    let encryptedTob: string | null = null;
    let encryptedBirthplace: string | null = null;

    if (isBeneficiaryEncryptionConfigured()) {
      if (payload.date_of_birth) {
        encryptedDob = encryptCustomerBirthData(user.id, "date_of_birth", payload.date_of_birth).ciphertext;
      }
      if (payload.time_of_birth) {
        encryptedTob = encryptCustomerBirthData(user.id, "time_of_birth", payload.time_of_birth).ciphertext;
      }
      if (cleanBirthplace) {
        encryptedBirthplace = encryptCustomerBirthData(user.id, "birthplace", cleanBirthplace).ciphertext;
      }
    }

    // Call update_customer_profile RPC
    // When encryption is enabled, we pass null to plaintext birth data in the RPC so that
    // plaintext PII is never stored in unencrypted database columns.
    const isEncrypted = isBeneficiaryEncryptionConfigured();
    const { error: rpcErr } = await supabase.rpc("update_customer_profile", {
      p_full_name: cleanName || null,
      p_phone: cleanPhone,
      p_date_of_birth: isEncrypted ? null : (payload.date_of_birth || null),
      p_time_of_birth: isEncrypted ? null : (payload.time_of_birth || null),
      p_birthplace: isEncrypted ? null : cleanBirthplace,
      p_gender: payload.gender || null,
    });

    if (rpcErr) {
      // Fallback direct update with RLS guard
      const updateData: Record<string, unknown> = {
        full_name: cleanName || undefined,
        phone: cleanPhone,
        date_of_birth: isEncrypted ? null : (payload.date_of_birth || null),
        time_of_birth: isEncrypted ? null : (payload.time_of_birth || null),
        birthplace: isEncrypted ? null : cleanBirthplace,
        gender: payload.gender || null,
        updated_at: new Date().toISOString(),
      };

      if (isEncrypted) {
        updateData.encrypted_date_of_birth = encryptedDob;
        updateData.encrypted_time_of_birth = encryptedTob;
        updateData.encrypted_birthplace = encryptedBirthplace;
        updateData.birth_encryption_version = getActiveKeyVersion();
      }

      const { error: updateErr } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", user.id);

      if (updateErr) {
        return { success: false, error: updateErr.message };
      }
    } else if (isEncrypted) {
      // Synchronize encrypted birth columns when RPC succeeds
      await supabase
        .from("profiles")
        .update({
          date_of_birth: null,
          time_of_birth: null,
          birthplace: null,
          encrypted_date_of_birth: encryptedDob,
          encrypted_time_of_birth: encryptedTob,
          encrypted_birthplace: encryptedBirthplace,
          birth_encryption_version: getActiveKeyVersion(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);
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

    // Query payments across all gateways: Instamojo, Wallet, Jyotish Pay, and Direct UPI
    const bookingIds = bookings.map((b) => b.id);
    const paymentMap: Record<string, { receipt_number: string; payment_id: string; gateway: "instamojo" | "wallet" }> = {};
    const intentPaymentMap: Record<string, { receipt_number?: string; intent_id: string; gateway: "jyotish_pay" }> = {};
    const directPaymentMap: Record<string, { status: string; utr: string; gateway: "direct_upi" }> = {};
    const refundRequestMap: Record<string, { status: "requested" | "approved" | "processed" | "rejected"; reason: string; rejection_reason?: string }> = {};

    if (bookingIds.length > 0) {
      const adminClient = await createAdminClient("main");

      // 1. Payment orders (Instamojo & Wallet) + payments
      const { data: orders, error: orderError } = await adminClient
        .from("payment_orders")
        .select(`
          id,
          entity_id,
          metadata,
          payments(receipt_number, payment_id, status, payment_method)
        `)
        .eq("entity_type", "consultation")
        .eq("status", "successful")
        .in("entity_id", bookingIds);

      if (orderError) {
        return { success: false, error: `Failed to load platform payment records: ${orderError.message}` };
      }

      if (orders) {
        for (const o of orders) {
          const pays = Array.isArray(o.payments) ? o.payments : (o.payments ? [o.payments] : []);
          const successfulPayment = pays.find((payment) => payment.status === "successful");
          const isWalletMethod = (o.metadata && typeof o.metadata === "object" && (o.metadata as any).payment_method === "wallet") ||
                                 (successfulPayment && (successfulPayment as any).payment_method === "wallet");
          if (successfulPayment) {
            paymentMap[o.entity_id] = {
              receipt_number: successfulPayment.receipt_number,
              payment_id: successfulPayment.payment_id,
              gateway: isWalletMethod ? "wallet" : "instamojo",
            };
          } else if (isWalletMethod) {
            const metaReceipt = (o.metadata as any)?.receipt_number || `RCP-WLT-${o.entity_id.slice(0, 8).toUpperCase()}`;
            paymentMap[o.entity_id] = {
              receipt_number: metaReceipt,
              payment_id: `PAY-WLT-${o.id.slice(0, 8)}`,
              gateway: "wallet",
            };
          }
        }
      }

      // 2. Jyotish Pay UPI intents + receipts
      const { data: intents, error: intentError } = await adminClient
        .from("payment_intents")
        .select("id, booking_id, status")
        .eq("entity_type", "consultation")
        .eq("status", "succeeded")
        .in("booking_id", bookingIds);

      if (intentError) {
        console.warn("[getCustomerBillingHistory] payment_intents lookup:", intentError.message);
      } else if (intents && intents.length > 0) {
        const intentIds = intents.map((i) => i.id);
        const { data: receipts } = await adminClient
          .from("payment_receipts")
          .select("receipt_number, intent_id, booking_id")
          .in("intent_id", intentIds);

        const receiptByIntent = Object.fromEntries(
          (receipts || []).map((r) => [r.intent_id, r.receipt_number])
        );

        for (const intent of intents) {
          if (intent.booking_id) {
            intentPaymentMap[intent.booking_id] = {
              receipt_number: receiptByIntent[intent.id] || `JSP-${intent.id.slice(0, 8).toUpperCase()}`,
              intent_id: intent.id,
              gateway: "jyotish_pay",
            };
          }
        }
      }

      // 3. Direct consultation payments (UTR)
      const { data: directPayments, error: directPaymentError } = await adminClient
        .from("direct_consultation_payments")
        .select("booking_id, status, utr, submitted_at")
        .in("booking_id", bookingIds)
        .order("submitted_at", { ascending: false });

      if (directPaymentError) {
        console.warn("[getCustomerBillingHistory] direct_consultation_payments lookup:", directPaymentError.message);
      } else {
        for (const payment of directPayments || []) {
          if (!directPaymentMap[payment.booking_id]) {
            directPaymentMap[payment.booking_id] = {
              status: payment.status,
              utr: payment.utr,
              gateway: "direct_upi",
            };
          }
        }
      }

      // 4. Refund requests for user context
      const { data: refunds, error: refundError } = await adminClient
        .from("refund_requests")
        .select("id, payment_id, status, reason, rejection_reason, created_at")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false });

      if (refundError) {
        console.warn("[getCustomerBillingHistory] refund_requests lookup:", refundError.message);
      } else if (refunds) {
        for (const r of refunds) {
          if (r.payment_id && !refundRequestMap[r.payment_id]) {
            refundRequestMap[r.payment_id] = {
              status: r.status as "requested" | "approved" | "processed" | "rejected",
              reason: r.reason,
              rejection_reason: r.rejection_reason || undefined,
            };
          }
        }
      }
    }

    const billingRecords: CustomerBillingRecord[] = bookings.map((b) => {
      const priceNum = Number(b.price) || 0;
      const instamojoPayment = paymentMap[b.id];
      const jyotishPayment = intentPaymentMap[b.id];
      const directPayment = directPaymentMap[b.id];

      const isPaid =
        !!instamojoPayment ||
        !!jyotishPayment ||
        directPayment?.status === "verified";

      const gateway: "instamojo" | "jyotish_pay" | "direct_upi" | "complimentary" | "wallet" =
        priceNum === 0
          ? "complimentary"
          : instamojoPayment
          ? instamojoPayment.gateway
          : jyotishPayment
          ? "jyotish_pay"
          : directPayment
          ? "direct_upi"
          : "instamojo";

      const receiptNumber =
        instamojoPayment?.receipt_number ||
        jyotishPayment?.receipt_number;

      const paymentId =
        instamojoPayment?.payment_id ||
        jyotishPayment?.intent_id;

      const refundInfo = paymentId ? refundRequestMap[paymentId] : null;

      const paymentStatus: "paid" | "pending" | "complimentary" | "refunded" =
        priceNum === 0
          ? "complimentary"
          : directPayment?.status === "refunded" || refundInfo?.status === "processed"
          ? "refunded"
          : isPaid
          ? "paid"
          : "pending";

      return {
        id: `tx-${b.id.slice(0, 8)}`,
        booking_id: b.id,
        service_type: b.service_type,
        consultation_mode: b.consultation_mode as ConsultationMode,
        astrologer_name: astroMap[b.astrologer_id] || "Vedic Astrologer",
        amount: priceNum,
        currency: "INR",
        payment_status: paymentStatus,
        transaction_ref:
          receiptNumber ||
          directPayment?.utr ||
          `JS-${b.created_at.slice(0, 10).replace(/-/g, "")}-${b.id.slice(0, 6).toUpperCase()}`,
        receipt_number: receiptNumber,
        payment_id: paymentId,
        created_at: b.created_at,
        payment_gateway: gateway,
        refund_status: refundInfo?.status || null,
        refund_reason: refundInfo?.reason || null,
        refund_rejection_reason: refundInfo?.rejection_reason || null,
        transaction_category: "consultation",
        transaction_direction: "debit",
      };
    });

    // 5. Query wallet recharges and other direct payment orders for customer
    const admin = await createAdminClient("main");
    const { data: walletOrders } = await admin
      .from("payment_orders")
      .select(`
        id,
        order_number,
        entity_type,
        amount_paise,
        status,
        created_at,
        metadata,
        payments(receipt_number, payment_id, status)
      `)
      .eq("customer_id", user.id)
      .eq("entity_type", "customer_wallet_recharge")
      .order("created_at", { ascending: false });

    const rechargeRecords: CustomerBillingRecord[] = ((walletOrders || []) as any[]).map((wo: any) => {
      const pays = Array.isArray(wo.payments) ? wo.payments : (wo.payments ? [wo.payments] : []);
      const successfulPay = pays.find((p: any) => p.status === "successful");
      const meta = typeof wo.metadata === "object" && wo.metadata !== null ? (wo.metadata as any) : {};
      const utr = meta.utr || null;
      const receiptNum = successfulPay?.receipt_number || (wo.status === "successful" ? `RCP-RCHG-${wo.order_number.slice(-6)}` : undefined);
      const isPaid = wo.status === "successful";
      const isFailed = wo.status === "failed" || wo.status === "rejected";
      const status: "paid" | "pending" | "complimentary" | "refunded" | "failed" =
        isPaid ? "paid" : isFailed ? "failed" : "pending";

      const gateway: "instamojo" | "jyotish_pay" | "direct_upi" | "complimentary" | "wallet" =
        meta.payment_mode === "upi_manual" ? "direct_upi" : "instamojo";

      return {
        id: `tx-rchg-${wo.id.slice(0, 8)}`,
        booking_id: `RECHARGE-${wo.order_number}`,
        service_type: "Wallet Recharge",
        consultation_mode: "Chat" as ConsultationMode,
        astrologer_name: "Karmic Ascension Wallet",
        amount: Number(wo.amount_paise) / 100,
        currency: "INR",
        payment_status: status,
        transaction_ref: receiptNum || utr || wo.order_number,
        receipt_number: receiptNum,
        payment_id: successfulPay?.payment_id || `ORD-${wo.order_number}`,
        created_at: wo.created_at,
        payment_gateway: gateway,
        refund_status: null,
        refund_reason: null,
        refund_rejection_reason: null,
        transaction_category: "wallet_recharge",
        transaction_direction: "credit",
      };
    });

    // Merge and sort chronologically descending
    const allRecords: CustomerBillingRecord[] = [...billingRecords, ...rechargeRecords].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return { success: true, data: allRecords };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load billing history.",
    };
  }
}

