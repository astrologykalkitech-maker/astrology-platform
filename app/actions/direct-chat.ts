"use server";

import { requireAuth, requireAstrologer } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidUUID } from "@/lib/validations/lead";

export interface DirectMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_role: "customer" | "astrologer";
  message: string;
  attachment_url?: string | null;
  read_at?: string | null;
  created_at: string;
}

export interface ConversationSummary {
  id: string;
  customer_id: string;
  astrologer_id: string;
  customer_name?: string;
  customer_avatar?: string | null;
  astrologer_name?: string;
  astrologer_avatar?: string | null;
  last_message_at: string;
  last_message_preview?: string | null;
  unread_count: number;
}

export async function getOrCreateConversationAction(
  astrologerId: string
): Promise<{ success: boolean; conversationId?: string; error?: string }> {
  try {
    const { user } = await requireAuth();

    if (!isValidUUID(astrologerId)) {
      return { success: false, error: "Invalid astrologer ID" };
    }

    const admin = await createAdminClient("main");

    // Check if conversation exists
    const { data: existing } = await admin
      .from("conversations")
      .select("id")
      .eq("customer_id", user.id)
      .eq("astrologer_id", astrologerId)
      .maybeSingle();

    if (existing) {
      return { success: true, conversationId: existing.id };
    }

    // Verify astrologer exists
    const { data: astro } = await admin
      .from("astrologer_profiles")
      .select("id")
      .eq("id", astrologerId)
      .maybeSingle();

    if (!astro) {
      return { success: false, error: "Astrologer not found" };
    }

    // Create new conversation
    const { data: created, error } = await admin
      .from("conversations")
      .insert({
        customer_id: user.id,
        astrologer_id: astrologerId,
      })
      .select("id")
      .single();

    if (error || !created) {
      return { success: false, error: error?.message || "Failed to create conversation" };
    }

    return { success: true, conversationId: created.id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error initializing conversation";
    return { success: false, error: msg };
  }
}

export async function getAstrologerConversationsAction(): Promise<{
  success: boolean;
  data?: ConversationSummary[];
  error?: string;
}> {
  try {
    const { user } = await requireAstrologer();
    const admin = await createAdminClient("main");

    const { data: astroProfile } = await admin
      .from("astrologer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!astroProfile) {
      return { success: false, error: "Astrologer profile not found" };
    }

    const { data, error } = await admin
      .from("conversations")
      .select(`
        id,
        customer_id,
        astrologer_id,
        last_message_at,
        last_message_preview,
        astrologer_unread_count,
        profiles:customer_id (
          full_name,
          avatar_url
        )
      `)
      .eq("astrologer_id", astroProfile.id)
      .order("last_message_at", { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    type ConvoQueryRow = {
      id: string;
      customer_id: string;
      astrologer_id: string;
      last_message_at: string;
      last_message_preview: string | null;
      astrologer_unread_count: number;
      profiles: { full_name: string | null; avatar_url: string | null } | { full_name: string | null; avatar_url: string | null }[] | null;
    };

    const summaries: ConversationSummary[] = ((data as unknown as ConvoQueryRow[]) || []).map((row) => {
      const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        id: row.id,
        customer_id: row.customer_id,
        astrologer_id: row.astrologer_id,
        customer_name: p?.full_name || "Seeker",
        customer_avatar: p?.avatar_url || null,
        last_message_at: row.last_message_at,
        last_message_preview: row.last_message_preview,
        unread_count: row.astrologer_unread_count || 0,
      };
    });

    return { success: true, data: summaries };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load conversations";
    return { success: false, error: msg };
  }
}

export async function getConversationMessagesAction(
  conversationId: string,
  limit = 50
): Promise<{ success: boolean; data?: DirectMessage[]; error?: string }> {
  try {
    const { user } = await requireAuth();

    if (!isValidUUID(conversationId)) {
      return { success: false, error: "Invalid conversation ID" };
    }

    const admin = await createAdminClient("main");

    // Verify user is participant
    const { data: convo } = await admin
      .from("conversations")
      .select("id, customer_id, astrologer_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (!convo) {
      return { success: false, error: "Conversation not found" };
    }

    const { data: astroProfile } = await admin
      .from("astrologer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const isCustomer = convo.customer_id === user.id;
    const isAstrologer = astroProfile && convo.astrologer_id === astroProfile.id;

    if (!isCustomer && !isAstrologer) {
      return { success: false, error: "Unauthorized access to this conversation" };
    }

    const safeLimit = Math.min(Math.max(1, limit), 100);

    const { data, error } = await admin
      .from("direct_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(safeLimit);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: (data as DirectMessage[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load messages";
    return { success: false, error: msg };
  }
}

export async function sendDirectMessageAction(
  conversationId: string,
  message: string,
  attachmentUrl?: string | null
): Promise<{ success: boolean; data?: DirectMessage; error?: string }> {
  try {
    const { user } = await requireAuth();

    if (!isValidUUID(conversationId)) {
      return { success: false, error: "Invalid conversation ID" };
    }

    const trimmed = message.trim();
    if (!trimmed && !attachmentUrl) {
      return { success: false, error: "Message content or attachment is required" };
    }

    if (trimmed.length > 2000) {
      return { success: false, error: "Message cannot exceed 2000 characters" };
    }

    const admin = await createAdminClient("main");

    // Verify membership and determine role
    const { data: convo } = await admin
      .from("conversations")
      .select("id, customer_id, astrologer_id, customer_unread_count, astrologer_unread_count")
      .eq("id", conversationId)
      .maybeSingle();

    if (!convo) {
      return { success: false, error: "Conversation not found" };
    }

    const { data: astroProfile } = await admin
      .from("astrologer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    let senderRole: "customer" | "astrologer";
    if (convo.customer_id === user.id) {
      senderRole = "customer";
    } else if (astroProfile && convo.astrologer_id === astroProfile.id) {
      senderRole = "astrologer";
    } else {
      return { success: false, error: "Unauthorized to send message in this conversation" };
    }

    // Insert message
    const { data: newMsg, error: insertErr } = await admin
      .from("direct_messages")
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        sender_role: senderRole,
        message: trimmed,
        attachment_url: attachmentUrl || null,
      })
      .select()
      .single();

    if (insertErr || !newMsg) {
      return { success: false, error: insertErr?.message || "Failed to deliver message" };
    }

    // Update conversation summary & recipient unread count
    const preview = trimmed.slice(0, 80);
    const nowIso = new Date().toISOString();

    if (senderRole === "customer") {
      await admin
        .from("conversations")
        .update({
          last_message_at: nowIso,
          last_message_preview: preview,
          astrologer_unread_count: (convo.astrologer_unread_count || 0) + 1,
          updated_at: nowIso,
        })
        .eq("id", conversationId);
    } else {
      await admin
        .from("conversations")
        .update({
          last_message_at: nowIso,
          last_message_preview: preview,
          customer_unread_count: (convo.customer_unread_count || 0) + 1,
          updated_at: nowIso,
        })
        .eq("id", conversationId);
    }

    return { success: true, data: newMsg as DirectMessage };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to send message";
    return { success: false, error: msg };
  }
}

export async function markConversationReadAction(
  conversationId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { user } = await requireAuth();

    if (!isValidUUID(conversationId)) {
      return { success: false, error: "Invalid conversation ID" };
    }

    const admin = await createAdminClient("main");

    const { data: convo } = await admin
      .from("conversations")
      .select("id, customer_id, astrologer_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (!convo) {
      return { success: false, error: "Conversation not found" };
    }

    const { data: astroProfile } = await admin
      .from("astrologer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const isCustomer = convo.customer_id === user.id;
    const isAstrologer = astroProfile && convo.astrologer_id === astroProfile.id;

    if (!isCustomer && !isAstrologer) {
      return { success: false, error: "Unauthorized" };
    }

    const nowIso = new Date().toISOString();

    if (isCustomer) {
      await admin
        .from("conversations")
        .update({ customer_unread_count: 0, updated_at: nowIso })
        .eq("id", conversationId);

      await admin
        .from("direct_messages")
        .update({ read_at: nowIso })
        .eq("conversation_id", conversationId)
        .eq("sender_role", "astrologer")
        .is("read_at", null);
    } else {
      await admin
        .from("conversations")
        .update({ astrologer_unread_count: 0, updated_at: nowIso })
        .eq("id", conversationId);

      await admin
        .from("direct_messages")
        .update({ read_at: nowIso })
        .eq("conversation_id", conversationId)
        .eq("sender_role", "customer")
        .is("read_at", null);
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to mark read";
    return { success: false, error: msg };
  }
}
