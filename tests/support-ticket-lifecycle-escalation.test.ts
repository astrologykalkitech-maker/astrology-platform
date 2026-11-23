import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Sub-phase 9.3: Support Ticket Lifecycle & In-app Chat Escalation", async (t) => {
  const supportActionPath = path.resolve(process.cwd(), "app/actions/support.ts");
  assert.ok(fs.existsSync(supportActionPath), "support.ts must exist");
  const code = fs.readFileSync(supportActionPath, "utf-8").replace(/\r\n/g, "\n");

  await t.test("1. Ticket creation enforces authentication, rate limiting, and input validation", () => {
    assert.ok(
      code.includes("const { user, role, name, email } = await requireSupportUser();"),
      "createSupportTicketAction must enforce requireSupportUser"
    );
    assert.ok(
      code.includes("checkRateLimit(`ticket:create:${user.id}`, 5, 600_000)"),
      "Must enforce ticket submission rate limit (max 5 per 10 mins)"
    );
    assert.ok(
      code.includes("!subject || subject.length > 200"),
      "Must validate subject presence and max length 200"
    );
    assert.ok(
      code.includes("!message || message.length > 5000"),
      "Must validate description presence and max length 5,000"
    );
  });

  await t.test("2. AI dialogue escalation archives dialog history and sets escalated status", () => {
    assert.ok(
      code.includes('const initialStatus: SupportTicketStatus = payload.isEscalation ? "escalated" : "new";'),
      "Escalated tickets must initialize with status 'escalated'"
    );
    assert.ok(
      code.includes("generateAiTicketSummary(role, payload.aiHistory)"),
      "Escalated tickets must generate automated AI summary"
    );
    assert.ok(
      code.includes('sender_role: item.role === "user" ? role : "ai"'),
      "AI conversation turns must be archived as support_messages"
    );
    assert.ok(
      code.includes(".update({ escalated_to_ticket: true })"),
      "Escalation must link and flag ai_interaction_logs"
    );
  });

  await t.test("3. Super Admin queue and replies maintain audit events and notifications", () => {
    assert.ok(
      code.includes("await requireSuperAdmin()"),
      "Admin actions must enforce requireSuperAdmin"
    );
    assert.ok(
      code.includes('sender_role: "admin"'),
      "Admin replies must be authored with sender_role admin"
    );
    assert.ok(
      code.includes('status: "waiting_for_user"'),
      "Public admin replies must transition status to waiting_for_user"
    );
    assert.ok(
      code.includes('.from("customer_notifications").insert({'),
      "Admin replies must dispatch in-app notification to ticket owner"
    );
    assert.ok(
      code.includes('.from("support_ticket_events").insert({'),
      "Admin replies and status updates must write to support_ticket_events"
    );
  });

  await t.test("4. Status updates to resolved trigger learning engine and user notification", () => {
    assert.ok(
      code.includes('if (payload.status === "resolved" || payload.status === "closed")') &&
      code.includes("updatePayload.resolved_at = new Date().toISOString();"),
      "Resolution must stamp resolved_at timestamp"
    );
    assert.ok(
      code.includes("learnFromResolvedTicket(payload.ticketId)"),
      "Ticket resolution must invoke AI learning engine asynchronously"
    );
    assert.ok(
      code.includes('event_type: "support_resolved"'),
      "Ticket resolution must notify customer/astrologer with support_resolved event"
    );
  });
});
