import { NextRequest, NextResponse } from "next/server";
import { requireAstrologer, AuthRequiredError, ForbiddenRoleError } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { parseSchedulingDateTime, formatExactDateTime } from "@/lib/astrologer/format";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { isValidUUID } from "@/lib/validations/lead";
import { assertAstrologerAvailable } from "@/lib/availability/server";

export const runtime = "nodejs";

const MIN_LEAD_TIME_MS = 5 * 60 * 1000;

/**
 * POST /api/astrologer/create-booking
 * Allows an authenticated astrologer to schedule a booking for a specific customer.
 *
 * Authorization: the astrologer must be approved and must already share a lead,
 * lead assignment or booking with the customer. Overlap prevention is atomic when
 * migration 025 (create_booking_for_customer) is applied; otherwise a best-effort
 * application-level check is used.
 *
 * Payload: {
 *   customer_id: string,
 *   service_type: string,
 *   consultation_mode: 'Video' | 'Voice' | 'Call' | 'Chat',
 *   scheduled_at: string (ISO datetime),
 *   duration_minutes?: number,
 *   notes?: string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAstrologer();

    const limit = checkRateLimit(`astro-booking:${user.id}`, 20, 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: `Too many booking requests. Try again in ${limit.retryAfterSeconds} seconds.` },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }

    const payload = await req.json().catch(() => ({}));

    const {
      customer_id,
      service_type,
      consultation_mode,
      scheduled_at,
      duration_minutes = 30,
      notes,
    } = (payload ?? {}) as Record<string, unknown>;

    if (!customer_id || !service_type || !consultation_mode || !scheduled_at) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (typeof customer_id !== "string" || !isValidUUID(customer_id)) {
      return NextResponse.json({ error: "Invalid customer_id" }, { status: 400 });
    }

    const serviceType = String(service_type).trim();
    if (serviceType.length === 0 || serviceType.length > 120) {
      return NextResponse.json({ error: "Invalid service type" }, { status: 400 });
    }
    const noteText = notes ? String(notes).trim() : "";
    if (noteText.length > 2000) {
      return NextResponse.json({ error: "Notes must not exceed 2000 characters." }, { status: 400 });
    }

    // Normalize consultation mode: 'Voice' -> 'Call' per database check constraint
    const mode = consultation_mode === "Voice" ? "Call" : String(consultation_mode);
    if (!["Chat", "Call", "Video"].includes(mode)) {
      return NextResponse.json(
        { error: "Invalid consultation mode. Must be Video, Call, or Chat." },
        { status: 400 }
      );
    }

    const duration = Number(duration_minutes);
    if (!Number.isInteger(duration) || duration < 10 || duration > 180) {
      return NextResponse.json(
        { error: "Duration must be a whole number between 10 and 180 minutes." },
        { status: 400 }
      );
    }

    const scheduledDate = parseSchedulingDateTime(String(scheduled_at));
    if (!scheduledDate || isNaN(scheduledDate.getTime())) {
      return NextResponse.json({ error: "Invalid scheduled_at date" }, { status: 400 });
    }
    if (scheduledDate.getTime() <= Date.now() + MIN_LEAD_TIME_MS) {
      return NextResponse.json(
        { error: "Booking slot must be scheduled at least 5 minutes in advance." },
        { status: 400 }
      );
    }

    const adminClient = await createAdminClient("main");

    // 1. Verify customer exists in public.profiles with role = 'customer'
    const { data: customerProfile, error: custErr } = await adminClient
      .from("profiles")
      .select("id, role")
      .eq("id", customer_id)
      .maybeSingle();

    if (custErr || !customerProfile || customerProfile.role !== "customer") {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    // 2. Verify astrologer profile and approval status
    const { data: astrologerProfile, error: astroErr } = await adminClient
      .from("astrologer_profiles")
      .select("id, approval_status, consultation_fee")
      .eq("user_id", user.id)
      .maybeSingle();

    if (astroErr || !astrologerProfile) {
      return NextResponse.json({ error: "Astrologer profile not found" }, { status: 403 });
    }

    if (astrologerProfile.approval_status !== "approved") {
      return NextResponse.json(
        { error: "Astrologer account must be approved to schedule consultations" },
        { status: 403 }
      );
    }

    // 3. Relationship check: only customers who enquired with / were assigned to / booked this astrologer
    const [leadCheck, bookingCheck, assignmentCheck] = await Promise.all([
      adminClient
        .from("leads")
        .select("id")
        .eq("customer_id", customerProfile.id)
        .eq("astrologer_id", astrologerProfile.id)
        .limit(1),
      adminClient
        .from("customer_bookings")
        .select("id")
        .eq("customer_id", customerProfile.id)
        .eq("astrologer_id", astrologerProfile.id)
        .limit(1),
      adminClient
        .from("lead_assignments")
        .select("id, leads!inner(customer_id)")
        .eq("astrologer_id", astrologerProfile.id)
        .eq("leads.customer_id", customerProfile.id)
        .limit(1),
    ]);

    const hasRelationship =
      (leadCheck.data?.length ?? 0) > 0 ||
      (bookingCheck.data?.length ?? 0) > 0 ||
      (assignmentCheck.data?.length ?? 0) > 0;

    if (!hasRelationship) {
      return NextResponse.json(
        { error: "You can only schedule consultations for customers who have enquired with you." },
        { status: 403 }
      );
    }

    // 3b. Respect the astrologer's own configured working hours, breaks and time off
    const availability = await assertAstrologerAvailable(astrologerProfile.id, scheduledDate, duration);
    if (!availability.available) {
      return NextResponse.json({ error: availability.reason }, { status: 409 });
    }

    // 4. Create the booking atomically (price derived from the astrologer's fee, never the client)
    const rpcArgs = {
      p_astrologer_id: astrologerProfile.id,
      p_customer_id: customerProfile.id,
      p_service_type: serviceType,
      p_consultation_mode: mode,
      p_scheduled_at: scheduledDate.toISOString(),
      p_duration_minutes: duration,
      p_notes: noteText || null,
    };

    let booking: Record<string, unknown> | null = null;
    const rpc = await adminClient.rpc("create_booking_for_customer", rpcArgs);

    if (!rpc.error && rpc.data) {
      booking = rpc.data as Record<string, unknown>;
    } else if (rpc.error && isMissingFunctionError(rpc.error)) {
      // Migration 025 not applied yet: best-effort overlap check + insert
      const newEnd = new Date(scheduledDate.getTime() + duration * 60_000);
      const { data: existing, error: overlapErr } = await adminClient
        .from("customer_bookings")
        .select("scheduled_at, duration_minutes")
        .eq("astrologer_id", astrologerProfile.id)
        .in("status", ["pending", "confirmed"])
        .gte("scheduled_at", new Date(scheduledDate.getTime() - 181 * 60_000).toISOString())
        .lt("scheduled_at", newEnd.toISOString());

      if (overlapErr) {
        return NextResponse.json({ error: "Unable to verify slot availability." }, { status: 500 });
      }

      const overlaps = (existing ?? []).some((b) => {
        const start = new Date(b.scheduled_at as string).getTime();
        const end = start + ((b.duration_minutes as number) || 30) * 60_000;
        return start < newEnd.getTime() && end > scheduledDate.getTime();
      });
      if (overlaps) {
        return NextResponse.json(
          { error: "This time slot is no longer available. Please select another slot." },
          { status: 409 }
        );
      }

      const { data: inserted, error: insertErr } = await adminClient
        .from("customer_bookings")
        .insert([
          {
            astrologer_id: astrologerProfile.id,
            customer_id: customerProfile.id,
            service_type: serviceType,
            consultation_mode: mode,
            scheduled_at: scheduledDate.toISOString(),
            duration_minutes: duration,
            price: Number(astrologerProfile.consultation_fee) || 0.0,
            notes: noteText || null,
            status: "confirmed",
            payment_mode: "platform_gateway",
          },
        ])
        .select()
        .single();

      if (insertErr || !inserted) {
        console.error("[astrologer/create-booking] insert failed:", insertErr?.message);
        return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
      }
      booking = inserted as Record<string, unknown>;
    } else {
      const message = rpc.error?.message ?? "";
      // Slot / validation errors raised by the RPC are safe, user-facing messages
      if (rpc.error?.code === "23505") {
        return NextResponse.json({ error: message }, { status: 409 });
      }
      if (rpc.error?.code === "22000" || rpc.error?.code === "P0002" || rpc.error?.code === "42501") {
        return NextResponse.json({ error: message }, { status: 400 });
      }
      console.error("[astrologer/create-booking] rpc failed:", rpc.error?.message);
      return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
    }

    // Notify the customer with the precise appointment time (failure is logged, not fatal)
    const formattedSlot = formatExactDateTime(scheduledDate);
    const { error: notifErr } = await adminClient.from("customer_notifications").insert({
      customer_id: customerProfile.id,
      title: "New Consultation Scheduled",
      message: `Your astrologer scheduled a ${mode} consultation with you for ${formattedSlot}.`,
      link_url: "/customer/bookings",
      event_type: "booking_confirmed",
      is_read: false,
      created_at: new Date().toISOString(),
    });
    if (notifErr) {
      console.warn("[create-booking] customer notification failed:", notifErr.message);
    }

    // Revalidate relevant pages and portal layouts
    revalidatePath("/astrologer/bookings", "page");
    revalidatePath("/astrologer/dashboard", "page");
    revalidatePath("/astrologer/earnings", "page");
    revalidatePath("/astrologer", "layout");
    revalidatePath("/customer/bookings", "page");
    revalidatePath("/customer", "layout");

    return NextResponse.json({ success: true, booking }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (err instanceof ForbiddenRoleError) {
      return NextResponse.json({ error: "Astrologer account required" }, { status: 403 });
    }
    console.error("[astrologer/create-booking] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function isMissingFunctionError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /could not find the function/i.test(error.message ?? "")
  );
}
