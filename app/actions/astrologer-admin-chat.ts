"use server";

import { requireAstrologer } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AuthResult } from "@/lib/types/auth.types";

export interface SuperAdminAstrologerMessage {
  id: string;
  title: string;
  message: string;
  eventType: string;
  createdAt: string;
  isRead: boolean;
  metadata?: Record<string, any>;
  replies: Array<{
    id: string;
    senderRole: "super_admin" | "astrologer";
    senderName: string;
    message: string;
    createdAt: string;
  }>;
}

/**
 * Loads administrative messages, broadcasts, and support communications sent to the astrologer.
 */
export async function getAstrologerAdminCommunicationsAction(): Promise<
  AuthResult<{ messages: SuperAdminAstrologerMessage[] }>
> {
  try {
    const { user } = await requireAstrologer();
    const admin = await createAdminClient("main");

    // 1. Fetch direct announcements / messages sent to this astrologer
    const { data: notifications, error } = await admin
      .from("customer_notifications")
      .select("*")
      .eq("customer_id", user.id)
      .in("event_type", [
        "admin_broadcast_announcement",
        "super_admin_direct_message",
        "platform_compliance_notice",
        "support_reply",
        "support_resolved",
        "listing_approval_update",
      ])
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return { success: false, error: error.message };
    }

    // 2. Fetch any support ticket messages linked to this user for full conversational timeline
    const { data: tickets } = await admin
      .from("support_tickets")
      .select("id, ticket_number, subject, status, created_at, support_messages(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    const messageList: SuperAdminAstrologerMessage[] = [];

    // Map direct notifications
    for (const n of notifications || []) {
      messageList.push({
        id: n.id,
        title: n.title,
        message: n.message,
        eventType: n.event_type,
        createdAt: n.created_at,
        isRead: n.is_read,
        metadata: (n.metadata as Record<string, any>) || {},
        replies: [],
      });
    }

    // Map support ticket dialogues
    for (const t of tickets || []) {
      const msgs = (t.support_messages || []).sort(
        (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      const firstMsg = msgs[0];
      const replies = msgs.slice(1).map((m: any) => ({
        id: m.id,
        senderRole: (m.sender_role || "super_admin") as "super_admin" | "astrologer",
        senderName: m.sender_name || (m.sender_role === "super_admin" ? "Super Admin Team" : "You"),
        message: m.message,
        createdAt: m.created_at,
      }));

      messageList.push({
        id: t.id,
        title: `[Ticket #${t.ticket_number}] ${t.subject}`,
        message: firstMsg?.message || t.subject,
        eventType: "support_dialogue",
        createdAt: t.created_at,
        isRead: t.status !== "waiting_for_user",
        metadata: { ticketId: t.id, status: t.status },
        replies,
      });
    }

    // Sort combined feed by timestamp descending
    messageList.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return { success: true, data: { messages: messageList } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load administrative communications.",
    };
  }
}

/**
 * Sends a direct reply from the astrologer back to the Super Admin on a communication thread.
 */
export async function sendAstrologerReplyToAdminAction(
  threadId: string,
  replyMessage: string
): Promise<AuthResult<{ success: boolean }>> {
  try {
    const { user, profile } = await requireAstrologer();
    const text = replyMessage.trim();
    if (!text) return { success: false, error: "Reply message cannot be empty." };

    const admin = await createAdminClient("main");

    // Check if threadId corresponds to an existing support ticket
    const { data: ticket } = await admin
      .from("support_tickets")
      .select("id, ticket_number, subject")
      .eq("id", threadId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (ticket) {
      await admin.from("support_messages").insert({
        ticket_id: ticket.id,
        sender_id: user.id,
        sender_name: profile.full_name || "Vedic Astrologer",
        sender_role: "astrologer",
        message: text,
      });

      await admin
        .from("support_tickets")
        .update({
          status: "in_progress",
          updated_at: new Date().toISOString(),
        })
        .eq("id", ticket.id);

      return { success: true, data: { success: true } };
    }

    // If it was a broadcast/direct notification, create a linked support ticket for two-way communication
    const { data: notif } = await admin
      .from("customer_notifications")
      .select("id, title, message")
      .eq("id", threadId)
      .eq("customer_id", user.id)
      .maybeSingle();

    const ticketNumber = `ADM-${Math.floor(100000 + Math.random() * 900000)}`;
    const { data: newTicket, error: tErr } = await admin
      .from("support_tickets")
      .insert({
        user_id: user.id,
        user_role: "astrologer",
        ticket_number: ticketNumber,
        subject: notif ? `Re: ${notif.title}` : "Reply to Super Admin Broadcast",
        category: "general",
        priority: "high",
        status: "in_progress",
        source: "admin_broadcast_reply",
      })
      .select("id")
      .single();

    if (tErr || !newTicket) {
      return { success: false, error: tErr?.message || "Failed to create reply thread." };
    }

    await admin.from("support_messages").insert({
      ticket_id: newTicket.id,
      sender_id: user.id,
      sender_name: profile.full_name || "Vedic Astrologer",
      sender_role: "astrologer",
      message: text,
    });

    return { success: true, data: { success: true } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to deliver reply.",
    };
  }
}
