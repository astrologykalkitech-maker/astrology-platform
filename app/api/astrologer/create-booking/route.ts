import { NextRequest, NextResponse } from "next/server";
import { requireAstrologer } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

/**
 * POST /api/astrologer/create-booking
 * Allows an authenticated astrologer to schedule a booking for a specific customer.
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

    // Normalize consultation mode: 'Voice' -> 'Call' per database check constraint
    const mode = consultation_mode === "Voice" ? "Call" : String(consultation_mode);
    if (!["Chat", "Call", "Video"].includes(mode)) {
      return NextResponse.json(
        { error: "Invalid consultation mode. Must be Video, Call, or Chat." },
        { status: 400 }
      );
    }

    const duration = Number(duration_minutes);
    if (isNaN(duration) || duration < 10 || duration > 180) {
      return NextResponse.json(
        { error: "Duration must be between 10 and 180 minutes." },
        { status: 400 }
      );
    }

    const scheduledDate = new Date(String(scheduled_at));
    if (isNaN(scheduledDate.getTime())) {
      return NextResponse.json({ error: "Invalid scheduled_at date" }, { status: 400 });
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

    // 3. Derive consultation price securely from astrologer's profile fee schedule
    const price = Number(astrologerProfile.consultation_fee) || 0.0;

    // 4. Insert booking via adminClient to satisfy trg_guard_booking_direct_insert
    const { data: booking, error: insertErr } = await adminClient
      .from("customer_bookings")
      .insert([
        {
          astrologer_id: astrologerProfile.id,
          customer_id: customerProfile.id,
          service_type: String(service_type).trim(),
          consultation_mode: mode,
          scheduled_at: scheduledDate.toISOString(),
          duration_minutes: duration,
          price,
          notes: notes ? String(notes).trim() : null,
          status: "confirmed",
        },
      ])
      .select()
      .single();

    if (insertErr || !booking) {
      return NextResponse.json(
        { error: insertErr?.message || "Failed to create booking" },
        { status: 500 }
      );
    }

    // Revalidate relevant pages
    revalidatePath("/astrologer/bookings", "page");
    revalidatePath("/customer/bookings", "page");

    return NextResponse.json({ success: true, booking }, { status: 201 });
  } catch (err) {
    console.error("[astrologer/create-booking] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
