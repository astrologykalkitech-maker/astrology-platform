"use server";

import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function getSuperAdminPujaBookings() {
  try {
    await requireSuperAdmin();
    const admin = await createAdminClient("main");
    const { data: bookings, error } = await admin
      .from("puja_bookings")
      .select("*, puja:puja_catalog(*), astrologer:astrologer_profiles!astrologer_id(id, display_name, profile_photo_url)")
      .order("created_at", { ascending: false });

    if (error) return { success: false, error: error.message, data: [] };
    if (!bookings || bookings.length === 0) return { success: true, data: [] };

    // Fetch customer profiles in a safe secondary lookup without failing on missing FK hints
    const customerIds = [...new Set(bookings.map((b) => b.customer_id).filter(Boolean))];
    let profilesMap: Record<string, { id: string; full_name: string | null; email?: string | null; phone?: string | null }> = {};

    if (customerIds.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", customerIds);

      if (profiles) {
        profiles.forEach((p) => {
          profilesMap[p.id] = p;
        });
      }
    }

    const hydrated = bookings.map((b) => ({
      ...b,
      customer: profilesMap[b.customer_id] || { id: b.customer_id, full_name: b.sankalp_name || "Seeker", phone: null },
    }));

    return { success: true, data: hydrated };
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

    // Fetch booking details to notify customer of priest assignment/reassignment
    const { data: booking } = await admin
      .from("puja_bookings")
      .select("customer_id, preferred_date, time_slot, puja:puja_catalog(title)")
      .eq("id", params.bookingId)
      .maybeSingle();

    if (booking?.customer_id) {
      const pujaTitle = Array.isArray(booking.puja) ? booking.puja[0]?.title : (booking.puja as any)?.title;
      try {
        await admin.from("customer_notifications").insert({
          customer_id: booking.customer_id,
          title: `🪔 Consecrated Priest Assigned`,
          message: `Pandit ${pandit.display_name} has been assigned as your presiding priest for ${pujaTitle || "your sacred Puja"} on ${booking.preferred_date} (${booking.time_slot}).`,
          link_url: `/customer/puja`,
          event_type: "puja_priest_assigned",
          metadata: { booking_id: params.bookingId, astrologer_id: params.astrologerId, pandit_name: pandit.display_name },
        });
      } catch {}
    }

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
    revalidatePath("/astrologer/pujas");
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

    // Fetch booking details to notify customer if cancelled or confirmed
    const { data: booking } = await admin
      .from("puja_bookings")
      .select("customer_id, preferred_date, time_slot, puja:puja_catalog(title)")
      .eq("id", bookingId)
      .maybeSingle();

    if (booking?.customer_id) {
      const pujaTitle = Array.isArray(booking.puja) ? booking.puja[0]?.title : (booking.puja as any)?.title;
      try {
        if (status === "cancelled") {
          await admin.from("customer_notifications").insert({
            customer_id: booking.customer_id,
            title: `❌ Puja Booking Cancelled`,
            message: `Your booking for ${pujaTitle || "your sacred Puja"} on ${booking.preferred_date} has been cancelled by temple administration.${adminNotes ? ` Reason: ${adminNotes}` : ""}`,
            link_url: `/customer/puja`,
            event_type: "puja_cancelled",
            metadata: { booking_id: bookingId, admin_notes: adminNotes },
          });
        } else if (status === "confirmed") {
          await admin.from("customer_notifications").insert({
            customer_id: booking.customer_id,
            title: `✨ Puja Booking Confirmed`,
            message: `Your sacred Puja booking for ${pujaTitle || "sacred ceremony"} on ${booking.preferred_date} has been confirmed.`,
            link_url: `/customer/puja`,
            event_type: "puja_confirmed",
            metadata: { booking_id: bookingId },
          });
        }
      } catch {}
    }

    revalidatePath("/super-admin/puja-bookings");
    revalidatePath("/astrologer/pujas");
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
    revalidatePath("/astrologer/pujas");
    revalidatePath("/customer/puja");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Super Admin modifies a Puja booking's schedule (date, time slot, sankalp name, gotra, special instructions).
 * Directly updates records and notifies customer in real-time.
 */
export async function modifyPujaBookingSchedule(params: {
  bookingId: string;
  preferredDate: string;
  timeSlot: string;
  sankalpName?: string;
  gotra?: string;
  specialInstructions?: string;
  adminNotes?: string;
}) {
  try {
    const { user } = await requireSuperAdmin();
    const admin = await createAdminClient("main");

    const preferredDate = (params.preferredDate || "").trim();
    if (!preferredDate) {
      return { success: false, error: "Scheduled date is required." };
    }

    const timeSlot = (params.timeSlot || "").trim();
    if (!timeSlot) {
      return { success: false, error: "Time slot is required." };
    }

    const updatePayload: Record<string, any> = {
      preferred_date: preferredDate,
      time_slot: timeSlot,
      updated_at: new Date().toISOString(),
    };

    if (params.sankalpName?.trim()) {
      updatePayload.sankalp_name = params.sankalpName.trim();
    }
    if (params.gotra?.trim()) {
      updatePayload.gotra = params.gotra.trim();
    }
    if (params.specialInstructions !== undefined) {
      updatePayload.special_instructions = params.specialInstructions?.trim() || null;
    }
    if (params.adminNotes !== undefined) {
      updatePayload.admin_notes = params.adminNotes?.trim() || null;
    }

    const { error: updateErr } = await admin
      .from("puja_bookings")
      .update(updatePayload)
      .eq("id", params.bookingId);

    if (updateErr) return { success: false, error: updateErr.message };

    // Fetch booking details to notify customer
    const { data: booking } = await admin
      .from("puja_bookings")
      .select("customer_id, puja:puja_catalog(title), astrologer:astrologer_profiles(display_name)")
      .eq("id", params.bookingId)
      .maybeSingle();

    if (booking?.customer_id) {
      const pujaTitle = Array.isArray(booking.puja) ? booking.puja[0]?.title : (booking.puja as any)?.title;
      const formattedDate = new Date(preferredDate).toLocaleDateString("en-IN", { dateStyle: "medium" });

      try {
        await admin.from("customer_notifications").insert({
          customer_id: booking.customer_id,
          title: `🗓️ Puja Schedule Updated`,
          message: `The schedule for ${pujaTitle || "your sacred Puja"} has been updated to ${formattedDate} during ${timeSlot}.${params.adminNotes ? ` Note: ${params.adminNotes}` : ""}`,
          link_url: `/customer/puja`,
          event_type: "puja_rescheduled",
          metadata: {
            booking_id: params.bookingId,
            new_date: preferredDate,
            new_slot: timeSlot,
            admin_notes: params.adminNotes,
          },
        });
      } catch {}
    }

    // Audit log
    try {
      await admin.from("audit_logs").insert({
        actor_id: user.id,
        action: "puja_booking.modify_schedule",
        target_type: "puja_booking",
        target_id: params.bookingId,
        details: { preferred_date: preferredDate, time_slot: timeSlot, notes: params.adminNotes },
      });
    } catch {}

    revalidatePath("/super-admin/puja-bookings");
    revalidatePath("/astrologer/pujas");
    revalidatePath("/customer/puja");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update puja schedule." };
  }
}
