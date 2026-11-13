"use server";

import { createPublicServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { AccessToken } from "livekit-server-sdk";
import { getLiveKitConfig } from "@/lib/consultation/token";

export interface PujaItem {
  id: string;
  title: string;
  slug: string;
  deity: string;
  description: string;
  benefits: string;
  duration_minutes: number;
  category?: string;
  base_price?: number;
  image_url?: string | null;
  samagri_details?: string | null;
  preparation_instructions?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PujaBookingRecord {
  id: string;
  customer_id: string;
  puja_id: string;
  astrologer_id?: string | null;
  preferred_date: string;
  time_slot: string;
  sankalp_name: string;
  gotra: string;
  special_instructions?: string | null;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  fulfilment_status?:
    | "booking_received"
    | "awaiting_assignment"
    | "assigned"
    | "assignment_accepted"
    | "scheduled"
    | "preparation"
    | "in_progress"
    | "completed"
    | "cancelled";
  darshan_room_name?: string | null;
  evidence_photos?: string[] | null;
  evidence_video_url?: string | null;
  completion_notes?: string | null;
  completed_at?: string | null;
  rating?: number | null;
  review_feedback?: string | null;
  created_at: string;
  puja?: PujaItem;
  astrologer?: {
    id: string;
    display_name: string;
    profile_photo_url?: string | null;
  } | null;
}

export interface SubmitPujaBookingInput {
  pujaId: string;
  preferredDate: string;
  timeSlot: string;
  sankalpName: string;
  gotra?: string;
  specialInstructions?: string;
  idempotencyKey?: string;
}

const VALID_PUJA_TIME_SLOTS = [
  "Brahma Muhurat (04:30 AM - 06:00 AM)",
  "Morning (07:00 AM - 10:00 AM)",
  "Abhijit Muhurat (11:45 AM - 12:35 PM)",
  "Evening Pradosh (05:30 PM - 07:30 PM)",
];

export async function getValidPujaTimeSlots(): Promise<string[]> {
  return [
    "Brahma Muhurat (04:30 AM - 06:00 AM)",
    "Morning (07:00 AM - 10:00 AM)",
    "Abhijit Muhurat (11:45 AM - 12:35 PM)",
    "Evening Pradosh (05:30 PM - 07:30 PM)",
  ];
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Fetch active Pujas from the database.
 */
export async function getPujaCatalog(): Promise<{
  success: boolean;
  data: PujaItem[];
  error?: string;
}> {
  try {
    const admin = await createAdminClient("main");
    const { data, error } = await admin
      .from("puja_catalog")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (error) {
      return { success: false, data: [], error: "Unable to load Pujas right now. Please try again later." };
    }

    return { success: true, data: data || [] };
  } catch {
    return { success: false, data: [], error: "Unable to load Pujas right now. Please try again later." };
  }
}

/**
 * Fetch authenticated customer's own Puja bookings with priest details.
 */
export async function getCustomerPujaBookings(): Promise<{
  success: boolean;
  data: PujaBookingRecord[];
  error?: string;
}> {
  try {
    const supabase = await createPublicServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, data: [], error: "Authentication required" };
    }

    const admin = await createAdminClient("main");
    const { data, error } = await admin
      .from("puja_bookings")
      .select("*, puja:puja_catalog(*), astrologer:astrologer_profiles(id, display_name, profile_photo_url)")
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return { success: false, data: [], error: error.message };
    }

    return { success: true, data: (data as PujaBookingRecord[]) || [] };
  } catch (err: any) {
    return { success: false, data: [], error: err.message || "Failed to load bookings" };
  }
}

/**
 * FEATURE-01 & FEATURE-08: RELIABLE PUJA BOOKING CREATION WITH IDEMPOTENCY
 */
export async function submitPujaBookingRequest(params: SubmitPujaBookingInput): Promise<{
  success: boolean;
  booking?: PujaBookingRecord;
  message?: string;
  error?: string;
}> {
  try {
    // 1. Authenticate customer
    const supabase = await createPublicServerClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return { success: false, error: "Authentication required. Please log in to book a Puja." };
    }

    // 2. Validate input fields
    const pujaId = (params.pujaId || "").trim();
    if (!pujaId || !UUID_REGEX.test(pujaId)) {
      return { success: false, error: "Please select a valid Puja from the catalog." };
    }

    const preferredDate = (params.preferredDate || "").trim();
    if (!preferredDate) {
      return { success: false, error: "Preferred date is required." };
    }

    const selectedDateObj = new Date(preferredDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (isNaN(selectedDateObj.getTime()) || selectedDateObj < today) {
      return { success: false, error: "Preferred date must be today or in the future." };
    }

    const timeSlot = (params.timeSlot || "").trim();
    if (!timeSlot || !VALID_PUJA_TIME_SLOTS.includes(timeSlot)) {
      return { success: false, error: "Please select a valid auspicious time slot." };
    }

    const sankalpName = (params.sankalpName || "").trim();
    if (!sankalpName || sankalpName.length < 2) {
      return { success: false, error: "Sankalp name (devotee full name) is required." };
    }

    const gotra = (params.gotra || "Kashyap").trim() || "Kashyap";
    const specialInstructions = (params.specialInstructions || "").trim() || null;
    const idempotencyKey = params.idempotencyKey?.trim() || null;

    const admin = await createAdminClient("main");

    // Idempotency check: if caller provided key or repeated request detected
    if (idempotencyKey) {
      const { data: existingByKey } = await admin
        .from("puja_bookings")
        .select("*, puja:puja_catalog(*)")
        .eq("customer_id", user.id)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (existingByKey) {
        return {
          success: true,
          booking: existingByKey as PujaBookingRecord,
          message: `Booking already exists (Reference #${existingByKey.id.slice(0, 8).toUpperCase()}).`,
        };
      }
    }

    // 3. Verify that the requested Puja exists and is active in the database
    const { data: existingPuja, error: pujaFetchErr } = await admin
      .from("puja_catalog")
      .select("id, title, is_active")
      .eq("id", pujaId)
      .maybeSingle();

    if (pujaFetchErr || !existingPuja) {
      return { success: false, error: "Selected Puja is no longer available in the catalog." };
    }

    if (!existingPuja.is_active) {
      return { success: false, error: `The ${existingPuja.title} is currently inactive.` };
    }

    // 4. Check for duplicate pending booking on the exact same date & time slot for this customer
    const { data: duplicate } = await admin
      .from("puja_bookings")
      .select("*, puja:puja_catalog(*)")
      .eq("customer_id", user.id)
      .eq("puja_id", pujaId)
      .eq("preferred_date", preferredDate)
      .eq("time_slot", timeSlot)
      .in("status", ["pending", "confirmed"])
      .maybeSingle();

    if (duplicate) {
      return {
        success: true,
        booking: duplicate as PujaBookingRecord,
        message: `Existing booking found for this Puja on the selected date and time slot (Reference #${duplicate.id.slice(0, 8).toUpperCase()}).`,
      };
    }

    // Generate dedicated LiveKit darshan room name
    const darshanRoom = `puja_darshan_${user.id.slice(0, 8)}_${Date.now()}`;

    // 5. Insert booking with strict column mapping (puja_id, time_slot, fulfilment_status)
    const { data: insertedBooking, error: insertErr } = await admin
      .from("puja_bookings")
      .insert({
        customer_id: user.id,
        puja_id: pujaId,
        preferred_date: preferredDate,
        time_slot: timeSlot,
        sankalp_name: sankalpName,
        gotra: gotra,
        special_instructions: specialInstructions,
        status: "pending",
        fulfilment_status: "booking_received",
        darshan_room_name: darshanRoom,
        idempotency_key: idempotencyKey,
      })
      .select("*, puja:puja_catalog(*)")
      .single();

    // 6. Strict error verification
    if (insertErr || !insertedBooking || !insertedBooking.id) {
      return {
        success: false,
        error: "Unable to create Puja booking at this moment. Please try again.",
      };
    }

    // FEATURE-12: NOTIFY CUSTOMER & COORDINATORS
    try {
      await admin.from("customer_notifications").insert({
        customer_id: user.id,
        title: `🪔 Puja Booking Received`,
        message: `Your booking for ${existingPuja.title} on ${preferredDate} (${timeSlot}) has been registered with Reference #${insertedBooking.id.slice(0, 8).toUpperCase()}. A consecrated priest will be assigned shortly.`,
        link_url: `/customer/puja`,
        event_type: "puja_booking",
        metadata: { booking_id: insertedBooking.id },
      });
    } catch {}

    revalidatePath("/customer/puja");
    revalidatePath("/super-admin/puja-bookings");

    return {
      success: true,
      booking: insertedBooking as PujaBookingRecord,
      message: `Your sacred ${existingPuja.title} booking request has been submitted successfully (Reference #${insertedBooking.id.slice(0, 8).toUpperCase()}). Our temple coordinator will confirm the priest schedule shortly.`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return {
      success: false,
      error: msg || "An unexpected error occurred while processing your booking.",
    };
  }
}

/**
 * FEATURE-11: CUSTOMER CANCELLATION & RESCHEDULING
 */
export async function reschedulePujaBooking(params: {
  bookingId: string;
  newDate: string;
  newTimeSlot: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createPublicServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Authentication required." };

    const newDateObj = new Date(params.newDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (isNaN(newDateObj.getTime()) || newDateObj < today) {
      return { success: false, error: "New date must be in the future." };
    }

    if (!VALID_PUJA_TIME_SLOTS.includes(params.newTimeSlot)) {
      return { success: false, error: "Invalid time slot selected." };
    }

    const admin = await createAdminClient("main");

    const { data: booking } = await admin
      .from("puja_bookings")
      .select("id, customer_id, status, fulfilment_status")
      .eq("id", params.bookingId)
      .maybeSingle();

    if (!booking) return { success: false, error: "Booking not found." };
    if (booking.customer_id !== user.id) return { success: false, error: "Unauthorized." };

    if (booking.status === "completed" || booking.status === "cancelled") {
      return { success: false, error: `Cannot reschedule a ${booking.status} booking.` };
    }

    const { error: updateErr } = await admin
      .from("puja_bookings")
      .update({
        preferred_date: params.newDate,
        time_slot: params.newTimeSlot,
        fulfilment_status: "scheduled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.bookingId);

    if (updateErr) return { success: false, error: updateErr.message };

    revalidatePath("/customer/puja");
    revalidatePath("/super-admin/puja-bookings");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function cancelPujaBooking(bookingId: string, reason?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createPublicServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Authentication required." };

    const admin = await createAdminClient("main");
    const { data: booking } = await admin
      .from("puja_bookings")
      .select("id, customer_id, status")
      .eq("id", bookingId)
      .maybeSingle();

    if (!booking) return { success: false, error: "Booking not found." };
    if (booking.customer_id !== user.id) return { success: false, error: "Unauthorized." };

    if (booking.status === "completed") {
      return { success: false, error: "Completed Pujas cannot be cancelled." };
    }

    await admin
      .from("puja_bookings")
      .update({
        status: "cancelled",
        fulfilment_status: "cancelled",
        admin_notes: reason ? `Cancelled by seeker: ${reason}` : "Cancelled by seeker",
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingId);

    revalidatePath("/customer/puja");
    revalidatePath("/super-admin/puja-bookings");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * FEATURE-14: LIVE VIDEO DARSHAN TOKEN ISSUANCE
 * Mints secure LiveKit tokens for customers and assigned Pandits.
 */
export async function getPujaDarshanToken(bookingId: string): Promise<{
  success: boolean;
  tokenResult?: {
    token: string;
    serverUrl: string;
    roomName: string;
    isHost: boolean;
  };
  error?: string;
}> {
  try {
    const supabase = await createPublicServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Authentication required." };

    const admin = await createAdminClient("main");
    const { data: booking } = await admin
      .from("puja_bookings")
      .select("id, customer_id, astrologer_id, darshan_room_name, status, fulfilment_status")
      .eq("id", bookingId)
      .maybeSingle();

    if (!booking) return { success: false, error: "Booking not found." };

    // Check if user is the devotee or assigned astrologer
    const { data: astroProfile } = await admin
      .from("astrologer_profiles")
      .select("id, display_name")
      .eq("user_id", user.id)
      .maybeSingle();

    const isCustomer = booking.customer_id === user.id;
    const isAssignedPriest = Boolean(astroProfile && astroProfile.id === booking.astrologer_id);

    const { data: userProfile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const isSuperAdmin = userProfile?.role === "super_admin";

    if (!isCustomer && !isAssignedPriest && !isSuperAdmin) {
      return { success: false, error: "Unauthorized access to this sacred Darshan session." };
    }

    const roomName = booking.darshan_room_name || `puja_${booking.id.slice(0, 8)}`;
    const config = getLiveKitConfig();

    const isHost = isAssignedPriest || isSuperAdmin;
    const participantId = isHost ? `priest_${user.id}` : `devotee_${user.id}`;
    const participantName = isHost ? (astroProfile?.display_name || "Pandit Ji") : (user.user_metadata?.full_name || "Devotee");

    const at = new AccessToken(config.apiKey, config.apiSecret, {
      identity: participantId,
      name: participantName,
      ttl: "7200s",
      metadata: JSON.stringify({
        role: isHost ? "host" : "viewer",
        bookingId: booking.id,
      }),
    });

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: isHost, // Priest publishes ritual video/audio
      canPublishData: true,
      canSubscribe: true, // Devotee receives sacred Darshan
    });

    const token = await at.toJwt();

    return {
      success: true,
      tokenResult: {
        token,
        serverUrl: config.wsUrl,
        roomName,
        isHost,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to generate Darshan token." };
  }
}

/**
 * FEATURE-17: CUSTOMER PUJA FEEDBACK & RATINGS
 */
export async function submitPujaReview(params: {
  bookingId: string;
  rating: number;
  reviewText: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createPublicServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Authentication required." };

    const rating = Math.min(5, Math.max(1, Math.round(params.rating)));
    const reviewText = (params.reviewText || "").trim();

    if (!reviewText) return { success: false, error: "Please provide review feedback." };

    const admin = await createAdminClient("main");
    const { data: booking } = await admin
      .from("puja_bookings")
      .select("id, customer_id, puja_id, status, fulfilment_status")
      .eq("id", params.bookingId)
      .maybeSingle();

    if (!booking) return { success: false, error: "Booking not found." };
    if (booking.customer_id !== user.id) return { success: false, error: "Unauthorized." };

    if (booking.status !== "completed" && booking.fulfilment_status !== "completed") {
      return { success: false, error: "Reviews can only be submitted after the Puja is consecrated and completed." };
    }

    // Insert review
    await admin.from("puja_reviews").upsert(
      {
        booking_id: booking.id,
        puja_id: booking.puja_id,
        customer_id: user.id,
        rating,
        review_text: reviewText,
        is_approved: true,
      },
      { onConflict: "booking_id" }
    );

    // Update booking row
    await admin
      .from("puja_bookings")
      .update({
        rating,
        review_feedback: reviewText,
        review_submitted_at: new Date().toISOString(),
      })
      .eq("id", booking.id);

    revalidatePath("/customer/puja");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to submit review." };
  }
}
