"use server";

import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function getSuperAdminPujaBookings() {
  try {
    await requireSuperAdmin();
    const admin = await createAdminClient("main");
    const { data, error } = await admin
      .from("puja_bookings")
      .select("*, puja:puja_catalog(*), customer:profiles!customer_id(id, full_name, email, phone_number), astrologer:astrologer_profiles!astrologer_id(id, display_name, profile_photo_url)")
      .order("created_at", { ascending: false });

    if (error) return { success: false, error: error.message, data: [] };
    return { success: true, data: data || [] };
  } catch (err: any) {
    return { success: false, error: err.message, data: [] };
  }
}

/**
 * FEATURE-05: PANDIT ASSIGNMENT
 * Retrieves list of approved, active astrologers/priests eligible to conduct sacred Pujas.
 */
export async function getEligiblePandits() {
  try {
    await requireSuperAdmin();
    const admin = await createAdminClient("main");
    const { data, error } = await admin
      .from("astrologer_profiles")
      .select("id, display_name, profile_photo_url, specializations, languages, approval_status")
      .eq("approval_status", "approved")
      .order("display_name", { ascending: true });

    if (error) return { success: false, error: error.message, data: [] };
    return { success: true, data: data || [] };
  } catch (err: any) {
    return { success: false, error: err.message, data: [] };
  }
}

/**
 * Assigns or reassigns an approved Pandit to a Puja booking.
 */
export async function assignPanditToBooking(params: {
  bookingId: string;
  astrologerId: string;
}) {
  try {
    const { user } = await requireSuperAdmin();
    const admin = await createAdminClient("main");

    // Verify pandit is approved
    const { data: pandit } = await admin
      .from("astrologer_profiles")
      .select("id, display_name, approval_status")
      .eq("id", params.astrologerId)
      .maybeSingle();

    if (!pandit || pandit.approval_status !== "approved") {
      return { success: false, error: "Only approved Pandits can be assigned to ritual bookings." };
    }

    const { error: updateErr } = await admin
      .from("puja_bookings")
      .update({
        astrologer_id: params.astrologerId,
        status: "confirmed",
        fulfilment_status: "assigned",
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.bookingId);

    if (updateErr) return { success: false, error: updateErr.message };

    // Audit log
    try {
      await admin.from("audit_logs").insert({
        actor_id: user.id,
        action: "puja_booking.assign_priest",
        target_type: "puja_booking",
        target_id: params.bookingId,
        details: { astrologer_id: params.astrologerId, pandit_name: pandit.display_name },
      });
    } catch {}

    revalidatePath("/super-admin/puja-bookings");
    revalidatePath("/customer/puja");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * FEATURE-13 & FEATURE-16: FULFILMENT MILESTONES & COMPLETION VERIFICATION
 */
export async function updatePujaBookingStatus(
  bookingId: string,
  status: "pending" | "confirmed" | "completed" | "cancelled",
  adminNotes?: string,
  fulfilmentStatus?: string
) {
  try {
    const { user } = await requireSuperAdmin();
    const admin = await createAdminClient("main");

    const updatePayload: any = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (fulfilmentStatus) {
      updatePayload.fulfilment_status = fulfilmentStatus;
    } else if (status === "completed") {
      updatePayload.fulfilment_status = "completed";
      updatePayload.completed_at = new Date().toISOString();
      updatePayload.verified_by = user.id;
      updatePayload.verified_at = new Date().toISOString();
    } else if (status === "cancelled") {
      updatePayload.fulfilment_status = "cancelled";
    }

    if (adminNotes !== undefined) {
      updatePayload.admin_notes = adminNotes;
    }

    const { error } = await admin
      .from("puja_bookings")
      .update(updatePayload)
      .eq("id", bookingId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/super-admin/puja-bookings");
    revalidatePath("/customer/puja");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update booking status." };
  }
}

/**
 * FEATURE-15: UPLOAD & ATTACH PUJA COMPLETION MEDIA EVIDENCE
 */
export async function attachPujaEvidence(params: {
  bookingId: string;
  evidencePhotos: string[];
  evidenceVideoUrl?: string;
  completionNotes?: string;
}) {
  try {
    const { user } = await requireSuperAdmin();
    const admin = await createAdminClient("main");

    const nowIso = new Date().toISOString();
    const { error } = await admin
      .from("puja_bookings")
      .update({
        evidence_photos: params.evidencePhotos,
        evidence_video_url: params.evidenceVideoUrl || null,
        completion_notes: params.completionNotes || null,
        status: "completed",
        fulfilment_status: "completed",
        completed_at: nowIso,
        verified_by: user.id,
        verified_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", params.bookingId);

    if (error) return { success: false, error: error.message };

    // Notify customer that their sacred Puja evidence is ready
    const { data: booking } = await admin
      .from("puja_bookings")
      .select("customer_id, puja:puja_catalog(title)")
      .eq("id", params.bookingId)
      .maybeSingle();

    if (booking?.customer_id) {
      const pujaTitle = Array.isArray(booking.puja) ? booking.puja[0]?.title : (booking.puja as any)?.title;
      try {
        await admin.from("customer_notifications").insert({
          customer_id: booking.customer_id,
          title: `🌸 Sacred Puja Completed`,
          message: `The consecration of ${pujaTitle || "your sacred Puja"} has completed. Consecration photos and video evidence are now available in your portal.`,
          link_url: `/customer/puja`,
          event_type: "puja_completed",
          metadata: { booking_id: params.bookingId },
        });
      } catch {}
    }

    revalidatePath("/super-admin/puja-bookings");
    revalidatePath("/customer/puja");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
