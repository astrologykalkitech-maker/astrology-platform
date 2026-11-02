"use server";

import { requireAstrologer } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidUUID } from "@/lib/validations/lead";

export interface AstrologerCustomerNote {
  id: string;
  astrologer_id: string;
  customer_id: string;
  booking_id: string | null;
  title: string;
  content: string;
  follow_up_date: string | null;
  follow_up_status: "pending" | "completed" | "cancelled" | null;
  created_at: string;
  updated_at: string;
}

export type CreateNoteInput = {
  customerId: string;
  bookingId?: string | null;
  title: string;
  content: string;
  followUpDate?: string | null;
};

export async function getAstrologerCustomerNotesAction(
  customerId: string
): Promise<{ success: boolean; data?: AstrologerCustomerNote[]; error?: string }> {
  try {
    const { user } = await requireAstrologer();

    if (!isValidUUID(customerId)) {
      return { success: false, error: "Invalid customer ID" };
    }

    const admin = await createAdminClient("main");

    // Resolve astrologer profile
    const { data: astroProfile, error: astroErr } = await admin
      .from("astrologer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (astroErr || !astroProfile) {
      return { success: false, error: "Astrologer profile not found" };
    }

    const { data, error } = await admin
      .from("astrologer_customer_notes")
      .select("*")
      .eq("astrologer_id", astroProfile.id)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: (data as AstrologerCustomerNote[]) || [] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load notes";
    return { success: false, error: message };
  }
}

export async function createAstrologerNoteAction(
  input: CreateNoteInput
): Promise<{ success: boolean; data?: AstrologerCustomerNote; error?: string }> {
  try {
    const { user } = await requireAstrologer();

    if (!isValidUUID(input.customerId)) {
      return { success: false, error: "Invalid customer ID" };
    }

    const title = input.title.trim();
    const content = input.content.trim();

    if (!title || !content) {
      return { success: false, error: "Title and content are required" };
    }

    if (title.length > 200) {
      return { success: false, error: "Title cannot exceed 200 characters" };
    }

    if (content.length > 5000) {
      return { success: false, error: "Content cannot exceed 5000 characters" };
    }

    let parsedFollowUpDate: string | null = null;
    if (input.followUpDate) {
      const dateVal = new Date(input.followUpDate);
      if (isNaN(dateVal.getTime())) {
        return { success: false, error: "Invalid follow-up date format" };
      }
      parsedFollowUpDate = dateVal.toISOString();
    }

    const admin = await createAdminClient("main");

    const { data: astroProfile, error: astroErr } = await admin
      .from("astrologer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (astroErr || !astroProfile) {
      return { success: false, error: "Astrologer profile not found" };
    }

    const { data, error } = await admin
      .from("astrologer_customer_notes")
      .insert({
        astrologer_id: astroProfile.id,
        customer_id: input.customerId,
        booking_id: input.bookingId || null,
        title,
        content,
        follow_up_date: parsedFollowUpDate,
        follow_up_status: parsedFollowUpDate ? "pending" : null,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as AstrologerCustomerNote };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create note";
    return { success: false, error: message };
  }
}

export async function updateFollowUpStatusAction(
  noteId: string,
  status: "pending" | "completed" | "cancelled"
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user } = await requireAstrologer();

    if (!isValidUUID(noteId)) {
      return { success: false, error: "Invalid note ID" };
    }

    const admin = await createAdminClient("main");

    const { data: astroProfile } = await admin
      .from("astrologer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!astroProfile) {
      return { success: false, error: "Astrologer profile not found" };
    }

    const { error } = await admin
      .from("astrologer_customer_notes")
      .update({
        follow_up_status: status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId)
      .eq("astrologer_id", astroProfile.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update status";
    return { success: false, error: message };
  }
}

