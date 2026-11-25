export interface DirectMessageAttachment {
  url: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

export interface DirectMessageReply {
  id: string;
  sender_role: "customer" | "astrologer";
  message: string;
  sender_name?: string;
}

export interface DirectMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_role: "customer" | "astrologer";
  message: string;
  attachment_url?: string | null;
  read_at?: string | null;
  created_at: string;

  // Rich messaging capabilities (Phase 3 & Phase 4)
  client_message_id?: string | null;
  status?: "sending" | "sent" | "delivered" | "read" | "failed";
  delivered_at?: string | null;
  reply_to?: DirectMessageReply | null;
  reply_to_message_id?: string | null;
  is_edited?: boolean;
  edited_at?: string | null;
  deleted_for_all?: boolean;
  deleted_for_users?: string[];
  reactions?: Record<string, string[]>; // { "👍": ["userId1", "userId2"] }
  attachments?: DirectMessageAttachment[];
  is_pinned?: boolean;
  pinned_at?: string | null;
  pinned_by?: string | null;
}

export interface DirectMessageMetaPayload {
  __dm_meta: true;
  client_message_id?: string | null;
  status?: "sending" | "sent" | "delivered" | "read" | "failed";
  delivered_at?: string | null;
  reply_to?: DirectMessageReply | null;
  is_edited?: boolean;
  edited_at?: string | null;
  deleted_for_all?: boolean;
  deleted_for_users?: string[];
  reactions?: Record<string, string[]>;
  attachments?: DirectMessageAttachment[];
  is_pinned?: boolean;
  pinned_at?: string | null;
  pinned_by?: string | null;
  legacy_url?: string | null;
}

export function parseDirectMessageRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row: any,
  currentUserId?: string
): DirectMessage | null {
  if (!row) return null;

  let meta: Partial<DirectMessageMetaPayload> = {};

  if (row.attachment_url && typeof row.attachment_url === "string") {
    if (row.attachment_url.startsWith('{"__dm_meta":')) {
      try {
        meta = JSON.parse(row.attachment_url);
      } catch {
        meta = { legacy_url: row.attachment_url };
      }
    } else {
      meta = { legacy_url: row.attachment_url };
    }
  }

  // Check if caller hid message with "Delete for me"
  const deletedForUsers = row.deleted_for_users || meta.deleted_for_users || [];
  if (currentUserId && deletedForUsers.includes(currentUserId)) {
    return null; // Do not display to this user
  }

  const isDeletedForAll = Boolean(row.deleted_for_all || meta.deleted_for_all);
  const displayMessage = isDeletedForAll ? "This message was deleted" : row.message;

  const rawAttachments = row.attachments || meta.attachments || [];
  const attachments: DirectMessageAttachment[] = Array.isArray(rawAttachments)
    ? rawAttachments
    : [];

  // Legacy attachment_url fallback
  if (meta.legacy_url && attachments.length === 0) {
    attachments.push({
      url: meta.legacy_url,
      fileName: "Attachment",
      fileType: "image/jpeg",
      fileSize: 0,
    });
  }

  const status: "sending" | "sent" | "delivered" | "read" | "failed" =
    row.read_at ? "read" : row.status || meta.status || "sent";

  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id,
    sender_role: row.sender_role,
    message: displayMessage,
    attachment_url: meta.legacy_url || (attachments[0]?.url ?? null),
    read_at: row.read_at || null,
    created_at: row.created_at,

    client_message_id: row.client_message_id || meta.client_message_id || null,
    status,
    delivered_at: row.delivered_at || meta.delivered_at || null,
    reply_to: meta.reply_to || null,
    reply_to_message_id: row.reply_to_message_id || meta.reply_to?.id || null,
    is_edited: Boolean(row.is_edited || meta.is_edited),
    edited_at: row.edited_at || meta.edited_at || null,
    deleted_for_all: isDeletedForAll,
    deleted_for_users: deletedForUsers,
    reactions: row.reactions || meta.reactions || {},
    attachments,
    is_pinned: Boolean(row.is_pinned || meta.is_pinned),
    pinned_at: row.pinned_at || meta.pinned_at || null,
    pinned_by: row.pinned_by || meta.pinned_by || null,
  };
}

export function encodeDirectMessageMeta(meta: Partial<DirectMessageMetaPayload>): string {
  return JSON.stringify({
    __dm_meta: true,
    ...meta,
  });
}

/**
 * Safely parses a UTC/ISO timestamp into a Date, returning null if invalid.
 */
export function parseSafeChatDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Returns a local-timezone calendar day key (YYYY-MM-DD) for grouping messages by day.
 */
export function getChatCalendarDayKey(iso: string | null | undefined): string {
  const d = parseSafeChatDate(iso);
  if (!d) return "unknown";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Formats a date separator label ("TODAY", "YESTERDAY", or "24 November 2026")
 * in the viewer's local timezone.
 */
export function formatChatDateSeparator(
  iso: string | null | undefined,
  now: Date = new Date()
): string {
  const d = parseSafeChatDate(iso);
  if (!d) return "TODAY";

  const msgKey = getChatCalendarDayKey(d.toISOString());
  const todayKey = getChatCalendarDayKey(now.toISOString());
  if (msgKey === todayKey) return "TODAY";

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayKey = getChatCalendarDayKey(yesterday.toISOString());
  if (msgKey === yesterdayKey) return "YESTERDAY";

  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Formats an individual message timestamp in the viewer's local timezone (e.g. "10:35 AM").
 */
export function formatChatMessageTime(iso: string | null | undefined): string {
  const d = parseSafeChatDate(iso);
  if (!d) return "--:--";
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Merges incoming persisted messages into an existing list, reconciling optimistic
 * temp- messages by client_message_id, deduplicating by id, and sorting chronologically.
 */
export function mergeDirectMessages(
  existing: DirectMessage[],
  incoming: DirectMessage[]
): DirectMessage[] {
  const next = [...existing];
  for (const msg of incoming) {
    if (!msg) continue;
    if (msg.client_message_id) {
      const idx = next.findIndex(
        (m) => m.client_message_id === msg.client_message_id || m.id === msg.id
      );
      if (idx !== -1) {
        next[idx] = msg;
        continue;
      }
    }
    const idIdx = next.findIndex((m) => m.id === msg.id);
    if (idIdx !== -1) {
      next[idIdx] = msg;
      continue;
    }
    next.push(msg);
  }
  next.sort((a, b) => {
    const tA = parseSafeChatDate(a.created_at)?.getTime() ?? 0;
    const tB = parseSafeChatDate(b.created_at)?.getTime() ?? 0;
    if (tA !== tB) return tA - tB;
    return a.id.localeCompare(b.id);
  });
  return next;
}

