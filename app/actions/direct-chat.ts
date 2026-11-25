"use server";

import { requireAuth, requireAstrologer, requireCustomer } from "@/lib/auth/session";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidUUID } from "@/lib/validations/lead";
import { checkRateLimit } from "@/lib/security/rate-limit";
import {
  type DirectMessageAttachment,
  type DirectMessageReply,
  type DirectMessage,
  type DirectMessageMetaPayload,
  parseDirectMessageRow,
  encodeDirectMessageMeta,
} from "@/lib/chat/meta";

export type {
  DirectMessageAttachment,
  DirectMessageReply,
  DirectMessage,
  DirectMessageMetaPayload,
};

export interface ConversationSummary {
  id: string;
  customer_id: string;
  astrologer_id: string;
  customer_name?: string;
  customer_avatar?: string | null;
  astrologer_name?: string;
  astrologer_user_id?: string;
  astrologer_avatar?: string | null;
  last_message_at: string;
  last_message_preview?: string | null;
  unread_count: number;
  is_muted?: boolean;
  is_archived?: boolean;
  booking_id?: string | null;
}

export interface EligibleSeeker {
  id: string;
  full_name: string;
  avatar_url: string | null;
  created_at: string;
  conversation_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  has_active_conversation: boolean;
}

export interface EligibleAstrologer {
  id: string;
  user_id: string;
  display_name: string;
  profile_photo_url: string | null;
  specializations: string[];
  consultation_fee: number;
  experience_years: number;
  conversation_id: string | null;
  has_active_conversation: boolean;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
}

// ============================================================================
// DIRECTORY ACTIONS (SEEKERS & ASTROLOGERS)
// ============================================================================

export async function getEligibleSeekersAction(): Promise<{
  success: boolean;
  data?: EligibleSeeker[];
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

    // 1. Fetch all registered customer profiles from DB1 (excluding consultant/admin accounts and self)
    const { data: rawCustomers, error: custErr } = await admin
      .from("profiles")
      .select("id, full_name, avatar_url, created_at, role")
      .neq("id", user.id)
      .order("created_at", { ascending: false });

    if (custErr) {
      return { success: false, error: custErr.message };
    }

    const nonSeekerRoles = new Set(["consultant_admin", "super_admin", "admin"]);
    const customers = (rawCustomers || []).filter(
      (p) => !p.role || !nonSeekerRoles.has(p.role)
    );

    // 2. Fetch existing conversations for this astrologer
    const { data: convos, error: convoErr } = await admin
      .from("conversations")
      .select("id, customer_id, last_message_at, last_message_preview, astrologer_unread_count")
      .eq("astrologer_id", astroProfile.id);

    if (convoErr) {
      return { success: false, error: convoErr.message };
    }

    type ConvoMapItem = {
      id: string;
      last_message_at: string | null;
      last_message_preview: string | null;
      astrologer_unread_count: number;
    };
    const convoMap = new Map<string, ConvoMapItem>();
    (convos || []).forEach((c) => {
      convoMap.set(c.customer_id, {
        id: c.id,
        last_message_at: c.last_message_at,
        last_message_preview: c.last_message_preview,
        astrologer_unread_count: c.astrologer_unread_count || 0,
      });
    });

    const seekers: EligibleSeeker[] = customers.map((c) => {
      const existingConvo = convoMap.get(c.id);
      const name = c.full_name?.trim() || `Seeker #${c.id.slice(0, 5)}`;
      return {
        id: c.id,
        full_name: name,
        avatar_url: c.avatar_url || null,
        created_at: c.created_at,
        conversation_id: existingConvo ? existingConvo.id : null,
        last_message_at: existingConvo ? existingConvo.last_message_at : null,
        last_message_preview: existingConvo ? existingConvo.last_message_preview : null,
        unread_count: existingConvo ? existingConvo.astrologer_unread_count : 0,
        has_active_conversation: Boolean(existingConvo),
      };
    });

    // Sort: Seekers with active conversations first, then newest seekers
    seekers.sort((a, b) => {
      if (a.last_message_at && b.last_message_at) {
        return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
      }
      if (a.last_message_at) return -1;
      if (b.last_message_at) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return { success: true, data: seekers };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load seekers directory";
    return { success: false, error: msg };
  }
}

export async function getEligibleAstrologersAction(): Promise<{
  success: boolean;
  data?: EligibleAstrologer[];
  error?: string;
}> {
  try {
    const { user } = await requireCustomer();
    const admin = await createAdminClient("main");

    // 1. Fetch approved astrologer profiles
    const { data: astros, error: astroErr } = await admin
      .from("astrologer_profiles")
      .select("id, user_id, display_name, specializations, consultation_fee, experience_years, profile_photo_url")
      .eq("approval_status", "approved")
      .order("display_name", { ascending: true });

    if (astroErr) {
      return { success: false, error: astroErr.message };
    }

    // 2. Fetch existing conversations for this customer
    const { data: convos, error: convoErr } = await admin
      .from("conversations")
      .select("id, astrologer_id, last_message_at, last_message_preview, customer_unread_count")
      .eq("customer_id", user.id);

    if (convoErr) {
      return { success: false, error: convoErr.message };
    }

    type ConvoMapItem = {
      id: string;
      last_message_at: string | null;
      last_message_preview: string | null;
      customer_unread_count: number;
    };
    const convoMap = new Map<string, ConvoMapItem>();
    (convos || []).forEach((c) => {
      convoMap.set(c.astrologer_id, {
        id: c.id,
        last_message_at: c.last_message_at,
        last_message_preview: c.last_message_preview,
        customer_unread_count: c.customer_unread_count || 0,
      });
    });

    const results: EligibleAstrologer[] = (astros || []).map((a) => {
      const existing = convoMap.get(a.id);
      return {
        id: a.id,
        user_id: a.user_id,
        display_name: a.display_name || "Vedic Astrologer",
        profile_photo_url: a.profile_photo_url || null,
        specializations: a.specializations || [],
        consultation_fee: Number(a.consultation_fee) || 500,
        experience_years: a.experience_years || 5,
        conversation_id: existing ? existing.id : null,
        has_active_conversation: Boolean(existing),
        last_message_at: existing ? existing.last_message_at : null,
        last_message_preview: existing ? existing.last_message_preview : null,
        unread_count: existing ? existing.customer_unread_count : 0,
      };
    });

    results.sort((a, b) => {
      if (a.has_active_conversation && !b.has_active_conversation) return -1;
      if (!a.has_active_conversation && b.has_active_conversation) return 1;
      return a.display_name.localeCompare(b.display_name);
    });

    return { success: true, data: results };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load astrologers directory";
    return { success: false, error: msg };
  }
}

// ============================================================================
// CONVERSATION INITIALIZATION & RETRIEVAL
// ============================================================================

export async function startConversationWithSeekerAction(
  seekerId: string
): Promise<{ success: boolean; conversationId?: string; error?: string }> {
  try {
    const { user } = await requireAstrologer();

    if (!isValidUUID(seekerId)) {
      return { success: false, error: "Invalid seeker ID" };
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

    const { data: seeker } = await admin
      .from("profiles")
      .select("id, role")
      .eq("id", seekerId)
      .maybeSingle();

    const nonSeekerRoles = new Set(["consultant_admin", "super_admin", "admin"]);
    if (!seeker || (seeker.role && nonSeekerRoles.has(seeker.role))) {
      return { success: false, error: "Seeker not found or ineligible" };
    }

    const { data: existing } = await admin
      .from("conversations")
      .select("id")
      .eq("customer_id", seekerId)
      .eq("astrologer_id", astroProfile.id)
      .maybeSingle();

    if (existing) {
      return { success: true, conversationId: existing.id };
    }

    const { data: created, error } = await admin
      .from("conversations")
      .insert({
        customer_id: seekerId,
        astrologer_id: astroProfile.id,
      })
      .select("id")
      .single();

    if (error || !created) {
      return { success: false, error: error?.message || "Failed to initialize conversation" };
    }

    return { success: true, conversationId: created.id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error initializing conversation";
    return { success: false, error: msg };
  }
}

export async function startConversationWithAstrologerAction(
  astrologerId: string
): Promise<{ success: boolean; conversationId?: string; error?: string }> {
  try {
    const { user } = await requireCustomer();

    if (!isValidUUID(astrologerId)) {
      return { success: false, error: "Invalid astrologer ID" };
    }

    const admin = await createAdminClient("main");

    const { data: astro } = await admin
      .from("astrologer_profiles")
      .select("id")
      .eq("id", astrologerId)
      .maybeSingle();

    if (!astro) {
      return { success: false, error: "Astrologer profile not found" };
    }

    const { data: existing } = await admin
      .from("conversations")
      .select("id")
      .eq("customer_id", user.id)
      .eq("astrologer_id", astrologerId)
      .maybeSingle();

    if (existing) {
      return { success: true, conversationId: existing.id };
    }

    const { data: created, error } = await admin
      .from("conversations")
      .insert({
        customer_id: user.id,
        astrologer_id: astrologerId,
      })
      .select("id")
      .single();

    if (error || !created) {
      return { success: false, error: error?.message || "Failed to start conversation" };
    }

    return { success: true, conversationId: created.id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to start conversation";
    return { success: false, error: msg };
  }
}

export async function getOrCreateBookingConversationAction(
  bookingId: string
): Promise<{ success: boolean; conversationId?: string; error?: string }> {
  try {
    const { user, profile } = await requireAuth();

    if (!isValidUUID(bookingId)) {
      return { success: false, error: "Invalid booking ID" };
    }

    const admin = await createAdminClient("main");

    const { data: booking, error: bookingErr } = await admin
      .from("customer_bookings")
      .select("id, customer_id, astrologer_id, status, consultation_mode")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingErr || !booking) {
      return { success: false, error: "Booking not found" };
    }

    const { data: astroProfile } = await admin
      .from("astrologer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const isCustomer = booking.customer_id === user.id;
    const isAstrologer = Boolean(astroProfile && booking.astrologer_id === astroProfile.id);

    if (!isCustomer && !isAstrologer && profile.role !== "super_admin") {
      return { success: false, error: "Unauthorized access to this booking consultation" };
    }

    // 1. Check for conversation explicitly linked to this booking_id
    const { data: bookingConvo } = await admin
      .from("conversations")
      .select("id")
      .eq("booking_id", bookingId)
      .limit(1)
      .maybeSingle();

    if (bookingConvo) {
      return { success: true, conversationId: bookingConvo.id };
    }

    // 2. Check for conversation between this customer and astrologer
    const { data: participantConvo } = await admin
      .from("conversations")
      .select("id, booking_id")
      .eq("customer_id", booking.customer_id)
      .eq("astrologer_id", booking.astrologer_id)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (participantConvo) {
      // Always rebind conversation to the current booking if it points to an older/different booking
      if (participantConvo.booking_id !== bookingId) {
        await admin
          .from("conversations")
          .update({ booking_id: bookingId })
          .eq("id", participantConvo.id);
      }
      return { success: true, conversationId: participantConvo.id };
    }

    // 3. Create new conversation explicitly tied to this booking
    const { data: created, error: createErr } = await admin
      .from("conversations")
      .insert({
        customer_id: booking.customer_id,
        astrologer_id: booking.astrologer_id,
        booking_id: bookingId,
      })
      .select("id")
      .single();

    if (createErr || !created) {
      // Handle concurrent creation race (unique_conversation_pair) idempotently
      if (createErr?.code === "23505") {
        const { data: raceWinner } = await admin
          .from("conversations")
          .select("id")
          .eq("customer_id", booking.customer_id)
          .eq("astrologer_id", booking.astrologer_id)
          .limit(1)
          .maybeSingle();
        if (raceWinner) {
          return { success: true, conversationId: raceWinner.id };
        }
      }
      return { success: false, error: createErr?.message || "Failed to initialize booking chat" };
    }

    return { success: true, conversationId: created.id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error resolving booking conversation";
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
        astrologer_unread_count
      `)
      .eq("astrologer_id", astroProfile.id)
      .order("last_message_at", { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    const customerIds = Array.from(new Set((data || []).map((c) => c.customer_id)));
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", customerIds.length > 0 ? customerIds : ["00000000-0000-0000-0000-000000000000"]);

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

    const summaries: ConversationSummary[] = (data || []).map((row) => {
      const p = profileMap.get(row.customer_id);
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

export async function getCustomerConversationsAction(): Promise<{
  success: boolean;
  data?: (ConversationSummary & {
    astrologer_name?: string;
    astrologer_photo?: string | null;
    astrologer_user_id?: string;
  })[];
  error?: string;
}> {
  try {
    const { user } = await requireCustomer();
    const admin = await createAdminClient("main");

    const { data, error } = await admin
      .from("conversations")
      .select(`
        id,
        customer_id,
        astrologer_id,
        last_message_at,
        last_message_preview,
        customer_unread_count,
        astrologer_profiles:astrologer_id (
          user_id,
          display_name,
          profile_photo_url
        )
      `)
      .eq("customer_id", user.id)
      .order("last_message_at", { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    type CustConvoRow = {
      id: string;
      customer_id: string;
      astrologer_id: string;
      last_message_at: string;
      last_message_preview: string | null;
      customer_unread_count: number;
      astrologer_profiles: { user_id: string; display_name: string | null; profile_photo_url: string | null } | { user_id: string; display_name: string | null; profile_photo_url: string | null }[] | null;
    };

    const summaries = ((data as unknown as CustConvoRow[]) || []).map((row) => {
      const a = Array.isArray(row.astrologer_profiles) ? row.astrologer_profiles[0] : row.astrologer_profiles;
      return {
        id: row.id,
        customer_id: row.customer_id,
        astrologer_id: row.astrologer_id,
        customer_name: a?.display_name || "Vedic Astrologer",
        astrologer_name: a?.display_name || "Vedic Astrologer",
        astrologer_user_id: a?.user_id,
        astrologer_photo: a?.profile_photo_url || null,
        last_message_at: row.last_message_at,
        last_message_preview: row.last_message_preview,
        unread_count: row.customer_unread_count || 0,
      };
    });

    return { success: true, data: summaries };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load conversations";
    return { success: false, error: msg };
  }
}

// ============================================================================
// CORE MESSAGING: CURSOR PAGINATION, DELTA FETCH & SEND
// ============================================================================

export async function getConversationMessagesAction(
  conversationId: string,
  cursor?: string | null,
  limit = 50
): Promise<{
  success: boolean;
  data?: DirectMessage[];
  hasMore?: boolean;
  oldestCursor?: string | null;
  error?: string;
}> {
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
    const isAstrologer = Boolean(
      (astroProfile && convo.astrologer_id === astroProfile.id) || convo.astrologer_id === user.id
    );

    if (!isCustomer && !isAstrologer) {
      return { success: false, error: "Unauthorized access to this conversation" };
    }

    const safeLimit = Math.min(Math.max(1, limit), 100);

    let query = admin
      .from("direct_messages")
      .select("*")
      .eq("conversation_id", conversationId);

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    // Fetch in descending order to get the most recent messages up to cursor
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(safeLimit + 1);

    if (error) {
      return { success: false, error: error.message };
    }

    const rows = data || [];
    const hasMore = rows.length > safeLimit;
    const slicedRows = hasMore ? rows.slice(0, safeLimit) : rows;

    // Reverse to chronological order (ascending)
    slicedRows.reverse();

    const parsedMessages: DirectMessage[] = slicedRows
      .map((row) => parseDirectMessageRow(row, user.id))
      .filter((m): m is DirectMessage => m !== null);

    const oldestCursor = slicedRows.length > 0 ? slicedRows[0].created_at : null;

    return {
      success: true,
      data: parsedMessages,
      hasMore,
      oldestCursor,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load messages";
    return { success: false, error: msg };
  }
}

export async function getLatestMessagesDeltaAction(
  conversationId: string,
  afterTimestamp?: string | null,
  afterId?: string | null
): Promise<{ success: boolean; data?: DirectMessage[]; error?: string }> {
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
    const isAstrologer = Boolean(
      (astroProfile && convo.astrologer_id === astroProfile.id) || convo.astrologer_id === user.id
    );

    if (!isCustomer && !isAstrologer) {
      return { success: false, error: "Unauthorized access to this conversation" };
    }

    let query = admin
      .from("direct_messages")
      .select("*")
      .eq("conversation_id", conversationId);

    if (afterTimestamp) {
      if (afterId && isValidUUID(afterId)) {
        // Composite tie-breaker cursor so messages sharing the exact same millisecond are never skipped
        query = query.or(
          `created_at.gt.${afterTimestamp},and(created_at.eq.${afterTimestamp},id.gt.${afterId})`
        );
      } else {
        query = query.gt("created_at", afterTimestamp);
      }
    }

    const { data, error } = await query
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(100);

    if (error) {
      return { success: false, error: error.message };
    }

    const parsed = (data || [])
      .map((row) => parseDirectMessageRow(row, user.id))
      .filter((m): m is DirectMessage => m !== null);

    return { success: true, data: parsed };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load messages delta";
    return { success: false, error: msg };
  }
}

export async function sendDirectMessageAction(
  conversationId: string,
  message: string,
  options?: {
    clientMessageId?: string;
    replyToMessageId?: string;
    attachments?: DirectMessageAttachment[];
  }
): Promise<{ success: boolean; data?: DirectMessage; error?: string }> {
  try {
    const { user } = await requireAuth();

    // Rate Limiting: 60 messages per minute per authenticated user to prevent chat spamming
    const chatLimit = checkRateLimit(`chat-msg:${user.id}`, 60, 60_000);
    if (!chatLimit.allowed) {
      return {
        success: false,
        error: `You are sending messages too quickly. Please wait ${chatLimit.retryAfterSeconds} seconds.`,
      };
    }

    if (!isValidUUID(conversationId)) {
      return { success: false, error: "Invalid conversation ID" };
    }

    const trimmed = (message || "").trim();
    const attachments = options?.attachments || [];

    if (!trimmed && attachments.length === 0) {
      return { success: false, error: "Message content or attachment is required" };
    }

    if (trimmed.length > 5000) {
      return { success: false, error: "Message cannot exceed 5000 characters" };
    }

    const admin = await createAdminClient("main");

    let convo: {
      id: string;
      customer_id: string;
      astrologer_id: string;
      booking_id?: string | null;
      customer_unread_count?: number | null;
      astrologer_unread_count?: number | null;
    } | null = null;

    // ── 1. Admin (service-role) lookup – bypasses RLS ──────────────────────
    const fullConvoRes = await admin
      .from("conversations")
      .select("id, customer_id, astrologer_id, booking_id, customer_unread_count, astrologer_unread_count")
      .eq("id", conversationId)
      .maybeSingle();

    if (!fullConvoRes.error) {
      convo = fullConvoRes.data;
    } else if (/does not exist|schema cache|column/i.test(fullConvoRes.error.message)) {
      const baseConvoRes = await admin
        .from("conversations")
        .select("id, customer_id, astrologer_id, customer_unread_count, astrologer_unread_count")
        .eq("id", conversationId)
        .maybeSingle();

      if (!baseConvoRes.error) {
        convo = baseConvoRes.data;
      } else if (/does not exist|schema cache|column/i.test(baseConvoRes.error.message)) {
        const minConvoRes = await admin
          .from("conversations")
          .select("id, customer_id, astrologer_id")
          .eq("id", conversationId)
          .maybeSingle();
        if (minConvoRes.error) {
          return { success: false, error: minConvoRes.error.message };
        }
        convo = minConvoRes.data;
      } else {
        return { success: false, error: baseConvoRes.error.message };
      }
    } else {
      return { success: false, error: fullConvoRes.error.message };
    }

    // ── 2. User-scoped fallback: if admin query returned no row, try via
    //       the participant's own authenticated client (honours RLS).
    //       This covers the case where the service-role key is misconfigured
    //       or the conversation was created on a different DB replica.
    if (!convo) {
      console.warn(
        "[sendDirectMessageAction] Admin lookup returned null for conversationId=%s user=%s — trying user-scoped fallback",
        conversationId,
        user.id
      );
      try {
        const { createClient: createServerSupabase } = await import("@/lib/supabase/server");
        const userClient = await createServerSupabase("main");
        const fallbackRes = await userClient
          .from("conversations")
          .select("id, customer_id, astrologer_id, booking_id, customer_unread_count, astrologer_unread_count")
          .eq("id", conversationId)
          .maybeSingle();
        if (!fallbackRes.error && fallbackRes.data) {
          convo = fallbackRes.data;
        } else {
          console.error(
            "[sendDirectMessageAction] User-scoped fallback also failed: %s | data=%j",
            fallbackRes.error?.message ?? "no data",
            fallbackRes.data
          );
        }
      } catch (fallbackErr) {
        console.error("[sendDirectMessageAction] User-scoped fallback threw:", fallbackErr);
      }
    }

    if (!convo) {
      console.error(
        "[sendDirectMessageAction] Conversation not found after all lookups. conversationId=%s user=%s",
        conversationId,
        user.id
      );
      return { success: false, error: "Conversation not found. Please refresh the page and try again." };
    }

    const { data: astroProfile } = await admin
      .from("astrologer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    let senderRole: "customer" | "astrologer";
    if (convo.customer_id === user.id) {
      senderRole = "customer";
    } else if ((astroProfile && convo.astrologer_id === astroProfile.id) || convo.astrologer_id === user.id) {
      senderRole = "astrologer";
    } else {
      return { success: false, error: "Unauthorized to send message in this conversation" };
    }

    // Consultation lifecycle & payment verification guard:
    // - Cancelled bookings cannot accept new messages.
    // - Video consultations require upfront payment before messaging/joining.
    // - Chat & Voice/Call consultations deduct from the customer's wallet after completion.
    let bookingForGuard: {
      id: string;
      status: string;
      price: number;
      payment_mode: string | null;
      direct_payment_status: string | null;
      consultation_mode: string | null;
    } | null = null;

    if (convo.booking_id) {
      const { data: booking } = await admin
        .from("customer_bookings")
        .select("id, status, price, payment_mode, direct_payment_status, consultation_mode")
        .eq("id", convo.booking_id)
        .maybeSingle();

      if (booking?.status === "cancelled") {
        // Check if a newer active booking exists between the same pair before blocking
        const { data: activeReplacement } = await admin
          .from("customer_bookings")
          .select("id, status, price, payment_mode, direct_payment_status, consultation_mode")
          .eq("customer_id", convo.customer_id)
          .eq("astrologer_id", convo.astrologer_id)
          .in("status", ["confirmed", "pending"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (activeReplacement) {
          await admin
            .from("conversations")
            .update({ booking_id: activeReplacement.id })
            .eq("id", convo.id);
          bookingForGuard = activeReplacement;
        } else {
          return {
            success: false,
            error: "This consultation booking has been cancelled.",
          };
        }
      } else {
        bookingForGuard = booking;
      }
    }

    if (senderRole === "customer" && convo.booking_id) {
      const booking = bookingForGuard;
      const isVideoConsultation = booking?.consultation_mode === "Video";
      if (
        booking &&
        isVideoConsultation &&
        Number(booking.price) > 0 &&
        booking.payment_mode !== "pay_at_drop"
      ) {
        const [directPayRes, orderRes, intentRes] = await Promise.all([
          admin
            .from("direct_consultation_payments")
            .select("id, status")
            .eq("booking_id", booking.id)
            .eq("status", "verified")
            .maybeSingle(),
          admin
            .from("payment_orders")
            .select("id, status")
            .eq("entity_type", "consultation")
            .eq("entity_id", booking.id)
            .eq("status", "successful")
            .maybeSingle(),
          admin
            .from("payment_intents")
            .select("id, status")
            .eq("entity_type", "consultation")
            .eq("booking_id", booking.id)
            .eq("status", "succeeded")
            .maybeSingle(),
        ]);

        const isPaid =
          booking.direct_payment_status === "paid" ||
          booking.direct_payment_status === "confirmed" ||
          !!directPayRes.data ||
          !!orderRes.data ||
          !!intentRes.data;

        if (!isPaid) {
          return {
            success: false,
            error: "Payment required before sending consultation messages. Please complete checkout.",
          };
        }
      }
    }

    // 1. Idempotency Check: prevent duplicate messages from rapid retries or HTTP fallback
    const clientMessageId = options?.clientMessageId || null;
    if (clientMessageId) {
      const { data: existingMsg } = await admin
        .from("direct_messages")
        .select()
        .eq("conversation_id", conversationId)
        .eq("sender_id", user.id)
        .eq("client_message_id", clientMessageId)
        .maybeSingle();

      if (existingMsg) {
        // Return existing message idempotently
        const parsedExisting = parseDirectMessageRow(existingMsg, user.id);
        return { success: true, data: parsedExisting || undefined };
      }
    }

    // 2. Resolve Reply Context if replying to a parent message
    let replySnippet: DirectMessageReply | null = null;
    if (options?.replyToMessageId && isValidUUID(options.replyToMessageId)) {
      const { data: parentMsg } = await admin
        .from("direct_messages")
        .select("id, sender_role, message, attachment_url")
        .eq("id", options.replyToMessageId)
        .eq("conversation_id", conversationId)
        .maybeSingle();

      if (parentMsg) {
        replySnippet = {
          id: parentMsg.id,
          sender_role: parentMsg.sender_role as "customer" | "astrologer",
          message: parentMsg.message.slice(0, 100),
          sender_name: parentMsg.sender_role === "customer" ? "Seeker" : "Astrologer",
        };
      }
    }

    // 3. Encode rich metadata
    const metaPayload: Partial<DirectMessageMetaPayload> = {
      client_message_id: clientMessageId,
      status: "sent",
      reply_to: replySnippet,
      attachments,
      reactions: {},
      is_pinned: false,
    };
    const encodedAttachmentMeta = encodeDirectMessageMeta(metaPayload);

    const messageBody = trimmed || (attachments.length > 0 ? `Sent ${attachments.length} attachment(s)` : "");
    const preview = trimmed.slice(0, 80) || (attachments.length > 0 ? "Attachment" : "");

    // 4. Prefer atomic single-transaction RPC (migration 097) for insert + unread counter
    let newMsg: Record<string, unknown> | null = null;
    const atomicRpc = await admin.rpc("send_direct_message_atomic", {
      p_conversation_id: conversationId,
      p_sender_id: user.id,
      p_sender_role: senderRole,
      p_message: messageBody,
      p_attachment_url: encodedAttachmentMeta,
      p_client_message_id: clientMessageId,
      p_preview: preview,
    });

    if (!atomicRpc.error && atomicRpc.data) {
      newMsg = atomicRpc.data as Record<string, unknown>;
    } else {
      // Fallback if migration 097 has not yet been applied to the target DB
      let { data: insertedMsg, error: insertErr } = await admin
        .from("direct_messages")
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          sender_role: senderRole,
          message: messageBody,
          attachment_url: encodedAttachmentMeta,
          client_message_id: clientMessageId,
        })
        .select()
        .single();

      if (insertErr && /client_message_id|does not exist|schema cache/i.test(insertErr.message)) {
        const legacyInsert = await admin
          .from("direct_messages")
          .insert({
            conversation_id: conversationId,
            sender_id: user.id,
            sender_role: senderRole,
            message: messageBody,
            attachment_url: encodedAttachmentMeta,
          })
          .select()
          .single();
        insertedMsg = legacyInsert.data;
        insertErr = legacyInsert.error;
      }

      if (insertErr || !insertedMsg) {
        if (insertErr?.code === "23505" && clientMessageId) {
          const { data: conflictMsg } = await admin
            .from("direct_messages")
            .select()
            .eq("conversation_id", conversationId)
            .eq("sender_id", user.id)
            .eq("client_message_id", clientMessageId)
            .maybeSingle();

          if (conflictMsg) {
            const parsedConflict = parseDirectMessageRow(conflictMsg, user.id);
            return { success: true, data: parsedConflict || undefined };
          }
        }
        console.error("[sendDirectMessageAction] direct_messages insert failed:", insertErr?.message);
        return { success: false, error: insertErr?.message || "Failed to deliver message" };
      }

      newMsg = insertedMsg;
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
    }

    // 5. Stamp actual_started_at on the linked booking on first real message exchange (chat-first billing anchor)
    if (convo.booking_id && newMsg) {
      try {
        await admin
          .from("customer_bookings")
          .update({
            actual_started_at: (newMsg.created_at as string) || new Date().toISOString(),
          })
          .eq("id", convo.booking_id)
          .is("actual_started_at", null);
      } catch {
        // Non-blocking if actual_started_at column is not present
      }
    }

    const parsed = parseDirectMessageRow(newMsg, user.id);
    return { success: true, data: parsed || undefined };
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
    const isAstrologer = Boolean(astroProfile && convo.astrologer_id === astroProfile.id);

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

// ============================================================================
// RICH FEATURES: EDITING, DELETION, REACTIONS, PINNING & SEARCH
// ============================================================================

export async function editDirectMessageAction(
  messageId: string,
  newContent: string
): Promise<{ success: boolean; data?: DirectMessage; error?: string }> {
  try {
    const { user } = await requireAuth();

    if (!isValidUUID(messageId)) {
      return { success: false, error: "Invalid message ID" };
    }

    const trimmed = (newContent || "").trim();
    if (!trimmed) {
      return { success: false, error: "Message content cannot be empty" };
    }

    if (trimmed.length > 5000) {
      return { success: false, error: "Message cannot exceed 5000 characters" };
    }

    const admin = await createAdminClient("main");

    const { data: msg } = await admin
      .from("direct_messages")
      .select("*")
      .eq("id", messageId)
      .maybeSingle();

    if (!msg) {
      return { success: false, error: "Message not found" };
    }

    if (msg.sender_id !== user.id) {
      return { success: false, error: "Only the author can edit their message" };
    }

    // Decode existing metadata
    let meta: Partial<DirectMessageMetaPayload> = {};
    if (msg.attachment_url && msg.attachment_url.startsWith('{"__dm_meta":')) {
      try {
        meta = JSON.parse(msg.attachment_url);
      } catch {
        meta = {};
      }
    }

    if (meta.deleted_for_all) {
      return { success: false, error: "Cannot edit a deleted message" };
    }

    const nowIso = new Date().toISOString();
    meta.is_edited = true;
    meta.edited_at = nowIso;

    const { data: updatedMsg, error: updateErr } = await admin
      .from("direct_messages")
      .update({
        message: trimmed,
        attachment_url: encodeDirectMessageMeta(meta),
      })
      .eq("id", messageId)
      .select()
      .single();

    if (updateErr || !updatedMsg) {
      return { success: false, error: updateErr?.message || "Failed to update message" };
    }

    const parsed = parseDirectMessageRow(updatedMsg, user.id);
    return { success: true, data: parsed || undefined };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to edit message";
    return { success: false, error: msg };
  }
}

export async function deleteDirectMessageAction(
  messageId: string,
  deleteType: "for_me" | "for_everyone"
): Promise<{ success: boolean; messageId: string; deleteType: string; error?: string }> {
  try {
    const { user } = await requireAuth();

    if (!isValidUUID(messageId)) {
      return { success: false, messageId, deleteType, error: "Invalid message ID" };
    }

    const admin = await createAdminClient("main");

    const { data: msg } = await admin
      .from("direct_messages")
      .select("*")
      .eq("id", messageId)
      .maybeSingle();

    if (!msg) {
      return { success: false, messageId, deleteType, error: "Message not found" };
    }

    // Verify caller is participant
    const { data: convo } = await admin
      .from("conversations")
      .select("id, customer_id, astrologer_id")
      .eq("id", msg.conversation_id)
      .maybeSingle();

    if (!convo) {
      return { success: false, messageId, deleteType, error: "Conversation not found" };
    }

    const { data: astroProfile } = await admin
      .from("astrologer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const isCustomer = convo.customer_id === user.id;
    const isAstrologer = Boolean(astroProfile && convo.astrologer_id === astroProfile.id);

    if (!isCustomer && !isAstrologer) {
      return { success: false, messageId, deleteType, error: "Unauthorized" };
    }

    let meta: Partial<DirectMessageMetaPayload> = {};
    if (msg.attachment_url && msg.attachment_url.startsWith('{"__dm_meta":')) {
      try {
        meta = JSON.parse(msg.attachment_url);
      } catch {
        meta = {};
      }
    }

    if (deleteType === "for_everyone") {
      if (msg.sender_id !== user.id) {
        return { success: false, messageId, deleteType, error: "Only the sender can delete for everyone" };
      }
      meta.deleted_for_all = true;
      meta.attachments = [];

      await admin
        .from("direct_messages")
        .update({
          message: "This message was deleted",
          attachment_url: encodeDirectMessageMeta(meta),
        })
        .eq("id", messageId);
    } else {
      // Delete for me
      const currentList = meta.deleted_for_users || [];
      if (!currentList.includes(user.id)) {
        currentList.push(user.id);
      }
      meta.deleted_for_users = currentList;

      await admin
        .from("direct_messages")
        .update({
          attachment_url: encodeDirectMessageMeta(meta),
        })
        .eq("id", messageId);
    }

    return { success: true, messageId, deleteType };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to delete message";
    return { success: false, messageId, deleteType, error: msg };
  }
}

export async function toggleMessageReactionAction(
  messageId: string,
  emoji: string
): Promise<{ success: boolean; messageId: string; reactions?: Record<string, string[]>; error?: string }> {
  try {
    const { user } = await requireAuth();

    const allowedEmojis = new Set(["👍", "❤️", "😂", "😮", "😢", "🙏"]);
    if (!allowedEmojis.has(emoji)) {
      return { success: false, messageId, error: "Invalid reaction emoji" };
    }

    if (!isValidUUID(messageId)) {
      return { success: false, messageId, error: "Invalid message ID" };
    }

    const admin = await createAdminClient("main");

    const { data: msg } = await admin
      .from("direct_messages")
      .select("*")
      .eq("id", messageId)
      .maybeSingle();

    if (!msg) {
      return { success: false, messageId, error: "Message not found" };
    }

    let meta: Partial<DirectMessageMetaPayload> = {};
    if (msg.attachment_url && msg.attachment_url.startsWith('{"__dm_meta":')) {
      try {
        meta = JSON.parse(msg.attachment_url);
      } catch {
        meta = {};
      }
    }

    const reactions = meta.reactions || {};
    const currentUsers = reactions[emoji] || [];

    if (currentUsers.includes(user.id)) {
      reactions[emoji] = currentUsers.filter((id) => id !== user.id);
      if (reactions[emoji].length === 0) {
        delete reactions[emoji];
      }
    } else {
      reactions[emoji] = [...currentUsers, user.id];
    }

    meta.reactions = reactions;

    await admin
      .from("direct_messages")
      .update({
        attachment_url: encodeDirectMessageMeta(meta),
      })
      .eq("id", messageId);

    return { success: true, messageId, reactions };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to toggle reaction";
    return { success: false, messageId, error: msg };
  }
}

export async function togglePinMessageAction(
  messageId: string
): Promise<{ success: boolean; messageId: string; is_pinned?: boolean; error?: string }> {
  try {
    const { user } = await requireAuth();

    if (!isValidUUID(messageId)) {
      return { success: false, messageId, error: "Invalid message ID" };
    }

    const admin = await createAdminClient("main");

    const { data: msg } = await admin
      .from("direct_messages")
      .select("*")
      .eq("id", messageId)
      .maybeSingle();

    if (!msg) {
      return { success: false, messageId, error: "Message not found" };
    }

    let meta: Partial<DirectMessageMetaPayload> = {};
    if (msg.attachment_url && msg.attachment_url.startsWith('{"__dm_meta":')) {
      try {
        meta = JSON.parse(msg.attachment_url);
      } catch {
        meta = {};
      }
    }

    const currentPin = Boolean(meta.is_pinned);
    const nextPin = !currentPin;
    const nowIso = new Date().toISOString();

    meta.is_pinned = nextPin;
    meta.pinned_at = nextPin ? nowIso : null;
    meta.pinned_by = nextPin ? user.id : null;

    await admin
      .from("direct_messages")
      .update({
        attachment_url: encodeDirectMessageMeta(meta),
      })
      .eq("id", messageId);

    return { success: true, messageId, is_pinned: nextPin };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to toggle pin";
    return { success: false, messageId, error: msg };
  }
}

export async function searchConversationMessagesAction(
  conversationId: string,
  query: string
): Promise<{ success: boolean; data?: DirectMessage[]; error?: string }> {
  try {
    const { user } = await requireAuth();

    if (!isValidUUID(conversationId)) {
      return { success: false, error: "Invalid conversation ID" };
    }

    const trimmed = (query || "").trim();
    if (!trimmed) {
      return { success: true, data: [] };
    }

    const admin = await createAdminClient("main");

    const { data, error } = await admin
      .from("direct_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .ilike("message", `%${trimmed}%`)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return { success: false, error: error.message };
    }

    const parsed = (data || [])
      .map((row) => parseDirectMessageRow(row, user.id))
      .filter((m): m is DirectMessage => m !== null && !m.deleted_for_all);

    return { success: true, data: parsed };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Search failed";
    return { success: false, error: msg };
  }
}

// ============================================================================
// ATTACHMENT UPLOAD & STORAGE ENGINE
// ============================================================================

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

export async function uploadChatAttachmentAction(
  formData: FormData
): Promise<{ success: boolean; attachment?: DirectMessageAttachment; error?: string }> {
  try {
    const { user } = await requireAuth();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return { success: false, error: "No file provided" };
    }

    if (file.size > MAX_ATTACHMENT_SIZE) {
      return { success: false, error: "File exceeds 10MB limit" };
    }

    const mime = file.type || "application/octet-stream";
    if (!ALLOWED_MIME_TYPES.has(mime)) {
      return { success: false, error: "File type not supported. Allowed: PNG, JPG, WEBP, GIF, PDF" };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const admin = await createAdminClient("main");

    const ext = file.name.split(".").pop() || "bin";
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `chat/${user.id}-${Date.now()}-${cleanFileName}`;

    let attachmentUrl: string;

    try {
      const { data: buckets } = await admin.storage.listBuckets();
      const hasBucket = buckets?.some((b) => b.name === "chat-attachments");
      if (!hasBucket) {
        await admin.storage.createBucket("chat-attachments", {
          public: false, // Private bucket for confidential customer charts & documents
          fileSizeLimit: MAX_ATTACHMENT_SIZE,
          allowedMimeTypes: Array.from(ALLOWED_MIME_TYPES),
        });
      }

      const { error: uploadError } = await admin.storage
        .from("chat-attachments")
        .upload(storagePath, buffer, {
          contentType: mime,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Generate time-limited signed URL (60 minutes) for private retrieval
      const { data: signedData, error: signedError } = await admin.storage
        .from("chat-attachments")
        .createSignedUrl(storagePath, 3600);

      if (signedError || !signedData?.signedUrl) {
        const { data: urlData } = admin.storage.from("chat-attachments").getPublicUrl(storagePath);
        attachmentUrl = urlData.publicUrl;
      } else {
        attachmentUrl = signedData.signedUrl;
      }
    } catch {
      // Inline base64 fallback for dev/resilience
      attachmentUrl = `data:${mime};base64,${buffer.toString("base64")}`;
    }

    const attachment: DirectMessageAttachment = {
      url: attachmentUrl,
      fileName: file.name,
      fileType: mime,
      fileSize: file.size,
    };

    return { success: true, attachment };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to upload attachment";
    return { success: false, error: msg };
  }
}

// ============================================================================
// SUPER ADMIN MONITORING & ABUSE REPORTING
// ============================================================================

export async function reportChatAbuseAction(
  conversationId: string,
  messageId: string | null,
  reason: string
): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const { user } = await requireAuth();

    if (!isValidUUID(conversationId)) {
      return { success: false, message: "", error: "Invalid conversation ID" };
    }

    const trimmed = (reason || "").trim();
    if (!trimmed) {
      return { success: false, message: "", error: "Reason for reporting is required" };
    }

    const admin = await createAdminClient("main");

    // Attempt insert into chat_abuse_reports
    const { error } = await admin.from("chat_abuse_reports").insert({
      conversation_id: conversationId,
      message_id: messageId && isValidUUID(messageId) ? messageId : null,
      reported_by: user.id,
      reason: trimmed,
    });

    if (error) {
      // If table not present yet, log safely without throwing
      console.warn("[reportChatAbuseAction] Logged:", { conversationId, messageId, userId: user.id, reason });
    }

    return { success: true, message: "Thank you. Your report has been submitted for moderation review." };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to submit report";
    return { success: false, message: "", error: msg };
  }
}

export async function getSuperAdminChatOverviewAction(): Promise<{
  success: boolean;
  data?: {
    totalConversations: number;
    activeConversations24h: number;
    totalMessages: number;
    pendingAbuseReports: number;
  };
  error?: string;
}> {
  try {
    await requireSuperAdmin();
    const admin = await createAdminClient("main");

    const [convosRes, msgsRes] = await Promise.all([
      admin.from("conversations").select("id, last_message_at", { count: "exact" }),
      admin.from("direct_messages").select("id", { count: "exact", head: true }),
    ]);

    const totalConversations = convosRes.count || 0;
    const totalMessages = msgsRes.count || 0;

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const activeConversations24h = (convosRes.data || []).filter(
      (c) => c.last_message_at && c.last_message_at >= oneDayAgo
    ).length;

    let pendingAbuseReports = 0;
    try {
      const { count } = await admin
        .from("chat_abuse_reports")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      pendingAbuseReports = count || 0;
    } catch {
      pendingAbuseReports = 0;
    }

    return {
      success: true,
      data: {
        totalConversations,
        activeConversations24h,
        totalMessages,
        pendingAbuseReports,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load chat overview";
    return { success: false, error: msg };
  }
}
