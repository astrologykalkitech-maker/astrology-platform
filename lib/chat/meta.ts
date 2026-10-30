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

