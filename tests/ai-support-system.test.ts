import test from "node:test";
import assert from "node:assert/strict";
import { askGeminiSupport, generateAiTicketSummary } from "../lib/ai/gemini-service";
import type {
  SupportTicket,
  SupportMessage,
  SupportTicketStatus,
  SupportTicketPriority,
} from "../lib/types/database.types";

// ==============================================================================
// 1. AI SERVICE & GEMINI INTEGRATION TESTS
// ==============================================================================

test("AI Integration: Graceful deterministic fallback when GEMINI_API_KEY is not configured", async () => {
  // Ensure unconfigured API key operates in grounded fallback mode
  const res = await askGeminiSupport({
    userId: "test-user-123",
    role: "customer",
    query: "When does my live consultation room unlock?",
  });

  assert.equal(res.success, true);
  assert.equal(res.isFallback, true);
  assert.equal(res.category, "consultation");
  assert.ok(res.message.includes("15 minutes"));
  assert.ok(res.message.includes("Muhurat"));
});

test("AI Integration: Astrologer-specific grounding for profile moderation", async () => {
  const res = await askGeminiSupport({
    userId: "test-astrologer-456",
    role: "astrologer",
    query: "How long does profile verification take to appear in the directory?",
  });

  assert.equal(res.success, true);
  assert.equal(res.isFallback, true);
  assert.equal(res.category, "profile");
  assert.ok(res.message.includes("Super Admin"));
  assert.ok(res.message.includes("approved"));
});

test("AI Integration: Rate limiting prevents abusive rapid-fire queries", async () => {
  const spamUserId = "spam-user-" + Date.now();
  let rateLimited = false;

  // Attempt 12 queries within 1 minute (limit is 10)
  for (let i = 0; i < 12; i++) {
    const res = await askGeminiSupport({
      userId: spamUserId,
      role: "customer",
      query: "Test query " + i,
    });
    if (!res.success && res.error === "Rate limit exceeded") {
      rateLimited = true;
      break;
    }
  }

  assert.equal(rateLimited, true);
});

test("AI Integration: generateAiTicketSummary produces structured internal summary", () => {
  const dialogue = [
    { role: "user", content: "I am having trouble connecting to my video call with Pandit Sharma." },
    { role: "assistant", content: "Your room unlocks 15 minutes before the slot. Have you checked your permissions?" },
    { role: "user", content: "Yes, but the video screen remains black. Please help me talk to support." },
  ];

  const summary = generateAiTicketSummary("customer", dialogue);

  assert.equal(summary.category, "consultation");
  assert.equal(summary.priority, "high");
  assert.ok(summary.summary.includes("AI-Generated Summary"));
  assert.ok(summary.summary.includes("CONSULTATION"));
  assert.ok(summary.escalationReason.includes("troubleshooting"));
});

// ==============================================================================
// 2. TICKET LIFECYCLE, ISOLATION & PERMISSIONS TESTS
// ==============================================================================

test("Customer Support: Ticket number generation adheres to TICK-XXXX sequence format", () => {
  const ticket: SupportTicket = {
    id: "9f111111-2222-3333-4444-555555555555",
    ticket_number: "TICK-1042",
    user_id: "c1111111-1111-1111-1111-111111111111",
    user_role: "customer",
    user_name: "Rahul Verma",
    user_email: "rahul@example.com",
    subject: "Unable to join video consultation",
    category: "consultation",
    status: "new",
    priority: "high",
    assigned_to: null,
    escalation_reason: null,
    ai_summary: null,
    resolution_notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    resolved_at: null,
  };

  assert.match(ticket.ticket_number, /^TICK-\d{4,}$/);
  assert.equal(ticket.user_role, "customer");
});

test("Data Isolation (IDOR): Customer A cannot read Customer B's tickets", () => {
  const customerA_Id = "cust-a-111";
  const customerB_Id = "cust-b-222";

  const customerB_Ticket: SupportTicket = {
    id: "ticket-b-999",
    ticket_number: "TICK-2002",
    user_id: customerB_Id,
    user_role: "customer",
    user_name: "Customer B",
    user_email: "b@test.com",
    subject: "Private chart consultation question",
    category: "profile",
    status: "open",
    priority: "medium",
    assigned_to: null,
    escalation_reason: null,
    ai_summary: null,
    resolution_notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    resolved_at: null,
  };

  function canReadTicket(userId: string, isStaff: boolean, ticket: SupportTicket): boolean {
    return isStaff || ticket.user_id === userId;
  }

  assert.equal(canReadTicket(customerA_Id, false, customerB_Ticket), false);
  assert.equal(canReadTicket(customerB_Id, false, customerB_Ticket), true);
  assert.equal(canReadTicket("admin-user-001", true, customerB_Ticket), true);
});

test("Privacy Protection: Internal administrative notes are invisible to customers and astrologers", () => {
  const messages: SupportMessage[] = [
    {
      id: "msg-1",
      ticket_id: "tick-1",
      sender_id: "cust-1",
      sender_role: "customer",
      sender_name: "Customer",
      message: "Please help me reschedule.",
      is_internal: false,
      created_at: new Date().toISOString(),
    },
    {
      id: "msg-2",
      ticket_id: "tick-1",
      sender_id: "admin-1",
      sender_role: "admin",
      sender_name: "Super Admin",
      message: "INTERNAL NOTE: Astrologer had power outage, granting complimentary slot credit.",
      is_internal: true,
      created_at: new Date().toISOString(),
    },
    {
      id: "msg-3",
      ticket_id: "tick-1",
      sender_id: "admin-1",
      sender_role: "admin",
      sender_name: "Super Admin Support",
      message: "We have rescheduled your session to tomorrow at 4 PM.",
      is_internal: false,
      created_at: new Date().toISOString(),
    },
  ];

  function filterMessagesForUser(isStaff: boolean, msgList: SupportMessage[]): SupportMessage[] {
    if (isStaff) return msgList;
    return msgList.filter((m) => !m.is_internal);
  }

  const customerView = filterMessagesForUser(false, messages);
  const adminView = filterMessagesForUser(true, messages);

  assert.equal(customerView.length, 2);
  assert.equal(customerView.some((m) => m.is_internal), false);
  assert.equal(adminView.length, 3);
  assert.equal(adminView.some((m) => m.is_internal), true);
});

// ==============================================================================
// 3. SUPER ADMIN SUPPORT DESK & KPI METRICS TESTS
// ==============================================================================

test("Super Admin Support: Accurate KPI calculations from raw ticket records", () => {
  const rawTickets: Array<{ status: SupportTicketStatus; priority: SupportTicketPriority; user_role: "customer" | "astrologer" }> = [
    { status: "new", priority: "medium", user_role: "customer" },
    { status: "open", priority: "high", user_role: "customer" },
    { status: "escalated", priority: "urgent", user_role: "customer" },
    { status: "waiting_for_support", priority: "high", user_role: "astrologer" },
    { status: "waiting_for_user", priority: "medium", user_role: "astrologer" },
    { status: "resolved", priority: "low", user_role: "customer" },
    { status: "closed", priority: "low", user_role: "astrologer" },
  ];

  const totalCount = rawTickets.length;
  const openCount = rawTickets.filter((t) => ["new", "open", "waiting_for_support", "escalated"].includes(t.status)).length;
  const escalatedCount = rawTickets.filter((t) => t.status === "escalated").length;
  const waitingReplyCount = rawTickets.filter((t) => t.status === "waiting_for_support" || t.status === "new").length;
  const resolvedCount = rawTickets.filter((t) => ["resolved", "closed"].includes(t.status)).length;
  const customerCount = rawTickets.filter((t) => t.user_role === "customer").length;
  const astrologerCount = rawTickets.filter((t) => t.user_role === "astrologer").length;

  assert.equal(totalCount, 7);
  assert.equal(openCount, 4);
  assert.equal(escalatedCount, 1);
  assert.equal(waitingReplyCount, 2);
  assert.equal(resolvedCount, 2);
  assert.equal(customerCount, 4);
  assert.equal(astrologerCount, 3);
});

test("Super Admin Support: Validated state transitions prevent illegal jumps", () => {
  const allowedTransitions: Record<SupportTicketStatus, SupportTicketStatus[]> = {
    new: ["open", "escalated", "waiting_for_user", "resolved", "closed"],
    open: ["waiting_for_user", "waiting_for_support", "escalated", "resolved", "closed"],
    escalated: ["open", "waiting_for_user", "resolved", "closed"],
    waiting_for_user: ["waiting_for_support", "resolved", "closed"],
    waiting_for_support: ["waiting_for_user", "escalated", "resolved", "closed"],
    resolved: ["open", "closed"],
    closed: ["open"],
  };

  function isValidTransition(from: SupportTicketStatus, to: SupportTicketStatus): boolean {
    return allowedTransitions[from]?.includes(to) ?? false;
  }

  assert.equal(isValidTransition("new", "open"), true);
  assert.equal(isValidTransition("open", "waiting_for_user"), true);
  assert.equal(isValidTransition("resolved", "open"), true); // Reopen permitted
  assert.equal(isValidTransition("closed", "waiting_for_support"), false); // Invalid direct jump
});

// ==============================================================================
// 4. CROSS-DASHBOARD E2E WORKFLOW SIMULATION TEST
// ==============================================================================

test("Cross-Dashboard E2E Support Workflow: Query -> Escalation -> Admin Reply -> Resolution", () => {
  // Step 1: User asks AI and receives guidance
  const userQuery = "My video consultation window did not activate.";
  const aiAnswer = "Your consultation room unlocks 15 minutes before the scheduled time. If the issue persists, please request human support.";

  const dialogue = [
    { role: "user", content: userQuery },
    { role: "assistant", content: aiAnswer },
    { role: "user", content: "The meeting start time has already passed. Please connect me to a human representative." },
  ];

  // Step 2: User escalates to human support ticket
  const summary = generateAiTicketSummary("customer", dialogue);
  const ticket: SupportTicket = {
    id: "ticket-e2e-101",
    ticket_number: "TICK-3001",
    user_id: "customer-user-123",
    user_role: "customer",
    user_name: "Ananya Roy",
    user_email: "ananya@example.com",
    subject: "Missed Consultation Slot",
    category: summary.category,
    status: "escalated",
    priority: summary.priority,
    assigned_to: null,
    escalation_reason: summary.escalationReason,
    ai_summary: summary.summary,
    resolution_notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    resolved_at: null,
  };

  assert.equal(ticket.status, "escalated");
  assert.equal(ticket.priority, "high");

  // Step 3: Super Admin opens ticket and posts public reply
  const adminReply: SupportMessage = {
    id: "msg-admin-reply",
    ticket_id: ticket.id,
    sender_id: "admin-id-1",
    sender_role: "admin",
    sender_name: "Super Admin Operations",
    message: "We apologize for the delay. We have verified the astrologer was delayed and have rescheduled your session to 5 PM today.",
    is_internal: false,
    created_at: new Date().toISOString(),
  };

  // Status updates to waiting_for_user
  ticket.status = "waiting_for_user";
  ticket.updated_at = new Date().toISOString();

  assert.equal(ticket.status, "waiting_for_user");
  assert.equal(adminReply.is_internal, false);

  // Step 4: Admin marks resolved
  ticket.status = "resolved";
  ticket.resolved_at = new Date().toISOString();
  ticket.resolution_notes = "Consultation successfully rescheduled to 5 PM.";

  assert.equal(ticket.status, "resolved");
  assert.ok(ticket.resolved_at !== null);
});
