"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile, getCurrentUser, AuthRequiredError } from "@/lib/auth/session";
import { requireAdminAccess } from "@/lib/auth/admin-guard";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { askGeminiSupport, generateAiTicketSummary } from "@/lib/ai/gemini-service";
import type {
  SupportTicket,
  SupportMessage,
  SupportTicketCategory,
  SupportTicketStatus,
  SupportTicketPriority,
} from "@/lib/types/database.types";

export interface SupportActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Ensures authenticated user context and resolves role strictly
 */
async function requireSupportUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthRequiredError("Please log in to access support.");
  }

  const profile = await getCurrentProfile();
  const role: "customer" | "astrologer" =
    profile?.role === "astrologer" ? "astrologer" : "customer";

  return {
    user,
    profile,
    role,
    name: profile?.full_name || user.user_metadata?.full_name || "User",
    email: user.email || null,
  };
}

/**
 * Ask Gemini AI support assistant
 */
export async function askSupportAiAction(payload: {
  query: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<SupportActionResult<{
  message: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  suggestedAction?: "continue" | "escalate" | "self_service";
  isFallback: boolean;
  modelUsed: string;
}>> {
  try {
    const { user, role } = await requireSupportUser();
    const query = (payload.query || "").trim();

    if (!query) {
      return { success: false, error: "Please enter your support question." };
    }
    if (query.length > 2000) {
      return { success: false, error: "Query exceeds maximum limit of 2,000 characters." };
    }

    const response = await askGeminiSupport({
      userId: user.id,
      role,
      query,
      history: payload.history,
    });

    if (!response.success && response.error) {
      return { success: false, error: response.message };
    }

    return {
      success: true,
      data: {
        message: response.message,
        category: response.category,
        priority: response.priority,
        suggestedAction: response.suggestedAction,
        isFallback: response.isFallback,
        modelUsed: response.modelUsed,
      },
    };
  } catch (err: unknown) {
    const errorMsg = (err as Error)?.message || "Support AI assistant is temporarily unavailable.";
    return { success: false, error: errorMsg };
  }
}

/**
 * Create a new support ticket (direct or escalated from AI)
 */
export async function createSupportTicketAction(payload: {
  subject: string;
  category?: SupportTicketCategory;
  priority?: SupportTicketPriority;
  message: string;
  aiHistory?: Array<{ role: string; content: string }>;
  isEscalation?: boolean;
}): Promise<SupportActionResult<SupportTicket>> {
  try {
    const { user, role, name, email } = await requireSupportUser();

    // 1. Rate limiting: max 5 tickets per 10 minutes
    const rateLimit = checkRateLimit(`ticket:create:${user.id}`, 5, 600_000);
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: `Ticket submission limit reached. Please wait ${rateLimit.retryAfterSeconds} seconds before submitting again.`,
      };
    }

    const subject = (payload.subject || "").trim();
    const message = (payload.message || "").trim();

    if (!subject || subject.length > 200) {
      return { success: false, error: "Subject is required (max 200 characters)." };
    }
    if (!message || message.length > 5000) {
      return { success: false, error: "Detailed description is required (max 5,000 characters)." };
    }

    const category: SupportTicketCategory = payload.category || "general";
    const priority: SupportTicketPriority = payload.priority || "medium";

    let aiSummary: string | null = null;
    let escalationReason: string | null = null;

    if (payload.isEscalation && payload.aiHistory && payload.aiHistory.length > 0) {
      const summaryData = generateAiTicketSummary(role, payload.aiHistory);
      aiSummary = summaryData.summary;
      escalationReason = summaryData.escalationReason;
    }

    const initialStatus: SupportTicketStatus = payload.isEscalation ? "escalated" : "new";

    // 2. Persist ticket in DB1 (main platform database)
    const adminSupabase = await createAdminClient("main");

    const { data: ticket, error: ticketErr } = await adminSupabase
      .from("support_tickets")
      .insert({
        user_id: user.id,
        user_role: role,
        user_name: name,
        user_email: email,
        subject,
        category,
        status: initialStatus,
        priority,
        escalation_reason: escalationReason,
        ai_summary: aiSummary,
      })
      .select()
      .single();

    if (ticketErr || !ticket) {
      console.error("[Create Support Ticket Error]", ticketErr);
      return { success: false, error: "Failed to create support ticket. Please try again." };
    }

    // 3. Persist initial user message
    const { error: msgErr } = await adminSupabase.from("support_messages").insert({
      ticket_id: ticket.id,
      sender_id: user.id,
      sender_role: role,
      sender_name: name,
      message,
      is_internal: false,
    });

    if (msgErr) {
      console.warn("[Initial Support Message Insert Warning]", msgErr);
    }

    // 4. If escalated from AI dialogue, archive previous AI assistance context
    if (payload.aiHistory && payload.aiHistory.length > 0) {
      const recentDialog = payload.aiHistory.slice(-4);
      for (const item of recentDialog) {
        if (item.content.trim()) {
          await adminSupabase.from("support_messages").insert({
            ticket_id: ticket.id,
            sender_id: item.role === "user" ? user.id : null,
            sender_role: item.role === "user" ? role : "ai",
            sender_name: item.role === "user" ? name : "Gemini AI Assistant",
            message: item.content,
            is_internal: false,
          });
        }
      }
    }

    // 5. Record immutable ticket event
    await adminSupabase.from("support_ticket_events").insert({
      ticket_id: ticket.id,
      actor_id: user.id,
      actor_role: role,
      action: payload.isEscalation ? "escalated" : "created",
      details: {
        category,
        priority,
        isEscalation: !!payload.isEscalation,
      },
    });

    return { success: true, data: ticket as SupportTicket };
  } catch (err: unknown) {
    const errorMsg = (err as Error)?.message || "Failed to create support ticket.";
    return { success: false, error: errorMsg };
  }
}

/**
 * Fetch all tickets owned by authenticated user (Customer or Astrologer)
 */
export async function getUserSupportTicketsAction(): Promise<SupportActionResult<SupportTicket[]>> {
  try {
    const { user } = await requireSupportUser();
    const adminSupabase = await createAdminClient("main");

    const { data: tickets, error } = await adminSupabase
      .from("support_tickets")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Get User Tickets Error]", error);
      return { success: false, error: "Failed to load support tickets." };
    }

    return { success: true, data: (tickets || []) as SupportTicket[] };
  } catch (err: unknown) {
    const errorMsg = (err as Error)?.message || "Failed to load support tickets.";
    return { success: false, error: errorMsg };
  }
}

/**
 * Get ticket details and conversation timeline
 */
export async function getSupportTicketDetailsAction(ticketId: string): Promise<
  SupportActionResult<{
    ticket: SupportTicket;
    messages: SupportMessage[];
  }>
> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new AuthRequiredError();
    }

    const adminSupabase = await createAdminClient("main");

    // Fetch ticket
    const { data: ticket, error: ticketErr } = await adminSupabase
      .from("support_tickets")
      .select("*")
      .eq("id", ticketId)
      .maybeSingle();

    if (ticketErr || !ticket) {
      return { success: false, error: "Support ticket not found." };
    }

    // Check authorization: must be ticket owner OR have admin access
    let isStaff = false;
    try {
      await requireAdminAccess();
      isStaff = true;
    } catch {
      isStaff = false;
    }

    if (!isStaff && ticket.user_id !== user.id) {
      return { success: false, error: "Unauthorized access to this support ticket." };
    }

    // Query messages: hide internal notes from non-staff
    let msgQuery = adminSupabase
      .from("support_messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    if (!isStaff) {
      msgQuery = msgQuery.eq("is_internal", false);
    }

    const { data: messages, error: msgErr } = await msgQuery;

    if (msgErr) {
      console.error("[Get Ticket Messages Error]", msgErr);
      return { success: false, error: "Failed to load ticket conversation." };
    }

    return {
      success: true,
      data: {
        ticket: ticket as SupportTicket,
        messages: (messages || []) as SupportMessage[],
      },
    };
  } catch (err: unknown) {
    const errorMsg = (err as Error)?.message || "Failed to load ticket details.";
    return { success: false, error: errorMsg };
  }
}

/**
 * Add a follow-up message to an existing support ticket
 */
export async function addSupportTicketMessageAction(payload: {
  ticketId: string;
  message: string;
}): Promise<SupportActionResult<SupportMessage>> {
  try {
    const { user, role, name } = await requireSupportUser();
    const message = (payload.message || "").trim();

    if (!message) {
      return { success: false, error: "Message cannot be empty." };
    }
    if (message.length > 5000) {
      return { success: false, error: "Message exceeds maximum length of 5,000 characters." };
    }

    const adminSupabase = await createAdminClient("main");

    // Verify ticket exists and belongs to user
    const { data: ticket, error: fetchErr } = await adminSupabase
      .from("support_tickets")
      .select("id, user_id, status")
      .eq("id", payload.ticketId)
      .maybeSingle();

    if (fetchErr || !ticket) {
      return { success: false, error: "Support ticket not found." };
    }

    if (ticket.user_id !== user.id) {
      return { success: false, error: "Unauthorized to post on this ticket." };
    }

    // Insert user message
    const { data: newMsg, error: msgErr } = await adminSupabase
      .from("support_messages")
      .insert({
        ticket_id: ticket.id,
        sender_id: user.id,
        sender_role: role,
        sender_name: name,
        message,
        is_internal: false,
      })
      .select()
      .single();

    if (msgErr || !newMsg) {
      console.error("[Insert Support Message Error]", msgErr);
      return { success: false, error: "Failed to send message." };
    }

    // Update ticket status to waiting_for_support and touch updated_at
    await adminSupabase
      .from("support_tickets")
      .update({
        status: "waiting_for_support",
        updated_at: new Date().toISOString(),
      })
      .eq("id", ticket.id);

    return { success: true, data: newMsg as SupportMessage };
  } catch (err: unknown) {
    const errorMsg = (err as Error)?.message || "Failed to post message.";
    return { success: false, error: errorMsg };
  }
}

// ==============================================================================
// SUPER ADMIN SUPPORT MANAGEMENT SERVER ACTIONS
// ==============================================================================

export interface AdminSupportMetrics {
  totalCount: number;
  openCount: number;
  escalatedCount: number;
  waitingReplyCount: number;
  resolvedCount: number;
  customerCount: number;
  astrologerCount: number;
}

/**
 * Super Admin: Fetch all tickets with live KPIs and multi-criteria filters
 */
export async function getAdminSupportTicketsAction(filters?: {
  status?: string;
  priority?: string;
  role?: string;
  category?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<
  SupportActionResult<{
    tickets: SupportTicket[];
    metrics: AdminSupportMetrics;
    totalCount: number;
  }>
> {
  try {
    await requireAdminAccess();
    const adminSupabase = await createAdminClient("main");

    // 1. Compute aggregate live metrics
    const { data: allTickets, error: countErr } = await adminSupabase
      .from("support_tickets")
      .select("status, priority, user_role, category");

    if (countErr) {
      console.error("[Admin Support Metrics Error]", countErr);
    }

    const ticketsList = allTickets || [];
    const metrics: AdminSupportMetrics = {
      totalCount: ticketsList.length,
      openCount: ticketsList.filter((t) => ["new", "open", "waiting_for_support", "escalated"].includes(t.status)).length,
      escalatedCount: ticketsList.filter((t) => t.status === "escalated").length,
      waitingReplyCount: ticketsList.filter((t) => t.status === "waiting_for_support" || t.status === "new").length,
      resolvedCount: ticketsList.filter((t) => ["resolved", "closed"].includes(t.status)).length,
      customerCount: ticketsList.filter((t) => t.user_role === "customer").length,
      astrologerCount: ticketsList.filter((t) => t.user_role === "astrologer").length,
    };

    // 2. Build filtered query
    let query = adminSupabase.from("support_tickets").select("*", { count: "exact" });

    if (filters?.status && filters.status !== "all") {
      query = query.eq("status", filters.status);
    }
    if (filters?.priority && filters.priority !== "all") {
      query = query.eq("priority", filters.priority);
    }
    if (filters?.role && filters.role !== "all") {
      query = query.eq("user_role", filters.role);
    }
    if (filters?.category && filters.category !== "all") {
      query = query.eq("category", filters.category);
    }
    if (filters?.search && filters.search.trim()) {
      const s = filters.search.trim();
      query = query.or(`ticket_number.ilike.%${s}%,subject.ilike.%${s}%,user_name.ilike.%${s}%,user_email.ilike.%${s}%`);
    }

    const page = Math.max(1, filters?.page || 1);
    const limit = Math.min(50, filters?.limit || 20);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query.order("created_at", { ascending: false }).range(from, to);

    const { data: pagedTickets, count, error: fetchErr } = await query;

    if (fetchErr) {
      console.error("[Admin Support Fetch Error]", fetchErr);
      return { success: false, error: "Failed to load support tickets." };
    }

    return {
      success: true,
      data: {
        tickets: (pagedTickets || []) as SupportTicket[],
        metrics,
        totalCount: count || 0,
      },
    };
  } catch (err: unknown) {
    const errorMsg = (err as Error)?.message || "Failed to load admin support management queue.";
    return { success: false, error: errorMsg };
  }
}

/**
 * Super Admin: Reply to user or save private internal note
 */
export async function adminReplySupportTicketAction(payload: {
  ticketId: string;
  message: string;
  isInternal?: boolean;
}): Promise<SupportActionResult<SupportMessage>> {
  try {
    const { user, profile } = await requireAdminAccess();
    const message = (payload.message || "").trim();

    if (!message) {
      return { success: false, error: "Reply message cannot be empty." };
    }

    const adminSupabase = await createAdminClient("main");

    // Fetch ticket to get user_id and subject
    const { data: ticket, error: ticketErr } = await adminSupabase
      .from("support_tickets")
      .select("id, user_id, ticket_number, subject")
      .eq("id", payload.ticketId)
      .single();

    if (ticketErr || !ticket) {
      return { success: false, error: "Support ticket not found." };
    }

    const isInternal = !!payload.isInternal;
    const senderName = profile?.full_name || "Super Admin Support";

    // 1. Insert message
    const { data: newMsg, error: msgErr } = await adminSupabase
      .from("support_messages")
      .insert({
        ticket_id: ticket.id,
        sender_id: user.id,
        sender_role: "admin",
        sender_name: senderName,
        message,
        is_internal: isInternal,
      })
      .select()
      .single();

    if (msgErr || !newMsg) {
      console.error("[Admin Support Message Error]", msgErr);
      return { success: false, error: "Failed to post administrator message." };
    }

    // 2. If public response, update ticket status to waiting_for_user and dispatch notification
    if (!isInternal) {
      await adminSupabase
        .from("support_tickets")
        .update({
          status: "waiting_for_user",
          updated_at: new Date().toISOString(),
        })
        .eq("id", ticket.id);

      // Dispatch customer/astrologer notification
      await adminSupabase.from("customer_notifications").insert({
        customer_id: ticket.user_id,
        title: `Reply on Support Ticket [${ticket.ticket_number}]`,
        message: `Our administrative support team has responded to your ticket: "${message.slice(0, 100)}..."`,
        event_type: "support_reply",
        link_url: `/customer/support`,
      });

      // Record audit event
      await adminSupabase.from("support_ticket_events").insert({
        ticket_id: ticket.id,
        actor_id: user.id,
        actor_role: "admin",
        action: "admin_reply",
        details: { messageSnippet: message.slice(0, 150) },
      });
    } else {
      // Record internal note event
      await adminSupabase.from("support_ticket_events").insert({
        ticket_id: ticket.id,
        actor_id: user.id,
        actor_role: "admin",
        action: "internal_note",
        details: { noteSnippet: message.slice(0, 150) },
      });
    }

    return { success: true, data: newMsg as SupportMessage };
  } catch (err: unknown) {
    const errorMsg = (err as Error)?.message || "Failed to submit administrator reply.";
    return { success: false, error: errorMsg };
  }
}

/**
 * Super Admin: Update ticket status, priority, or assignment
 */
export async function adminUpdateTicketStatusAction(payload: {
  ticketId: string;
  status: SupportTicketStatus;
  priority?: SupportTicketPriority;
  assignedTo?: string | null;
  resolutionNotes?: string;
}): Promise<SupportActionResult<SupportTicket>> {
  try {
    const { user } = await requireAdminAccess();
    const adminSupabase = await createAdminClient("main");

    const updatePayload: Record<string, unknown> = {
      status: payload.status,
      updated_at: new Date().toISOString(),
    };

    if (payload.priority) {
      updatePayload.priority = payload.priority;
    }
    if (payload.assignedTo !== undefined) {
      updatePayload.assigned_to = payload.assignedTo;
    }
    if (payload.resolutionNotes !== undefined) {
      updatePayload.resolution_notes = payload.resolutionNotes;
    }
    if (payload.status === "resolved" || payload.status === "closed") {
      updatePayload.resolved_at = new Date().toISOString();
    }

    const { data: updatedTicket, error: updateErr } = await adminSupabase
      .from("support_tickets")
      .update(updatePayload)
      .eq("id", payload.ticketId)
      .select()
      .single();

    if (updateErr || !updatedTicket) {
      console.error("[Admin Ticket Update Error]", updateErr);
      return { success: false, error: "Failed to update ticket status." };
    }

    // Record audit event
    await adminSupabase.from("support_ticket_events").insert({
      ticket_id: payload.ticketId,
      actor_id: user.id,
      actor_role: "admin",
      action: "status_changed",
      details: {
        newStatus: payload.status,
        priority: payload.priority,
        assignedTo: payload.assignedTo,
      },
    });

    // Notify user if resolved
    if (payload.status === "resolved") {
      await adminSupabase.from("customer_notifications").insert({
        customer_id: updatedTicket.user_id,
        title: `Support Ticket [${updatedTicket.ticket_number}] Resolved`,
        message: `Your ticket "${updatedTicket.subject}" has been marked as resolved by our support team.`,
        event_type: "support_resolved",
        link_url: `/customer/support`,
      });
    }

    return { success: true, data: updatedTicket as SupportTicket };
  } catch (err: unknown) {
    const errorMsg = (err as Error)?.message || "Failed to update support ticket.";
    return { success: false, error: errorMsg };
  }
}
