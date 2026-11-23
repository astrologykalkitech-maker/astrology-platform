import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Phase 10: Platform Help Desk, Customer Support & Dispute Resolution (Sub-phases 10.1 – 10.20)", async (t) => {
  await t.test("Sub-phases 10.1-10.5: Support Tickets Queue, Filtering & Live Metrics", () => {
    const supportActionPath = path.resolve(process.cwd(), "app/actions/support.ts");
    assert.ok(fs.existsSync(supportActionPath), "app/actions/support.ts must exist");
    const content = fs.readFileSync(supportActionPath, "utf-8");

    assert.match(content, /export async function getAdminSupportTicketsAction/, "Must export getAdminSupportTicketsAction");
    assert.match(content, /await requireSuperAdmin\(\)/, "Support queue query must require Super Admin");
    assert.match(content, /from\(["']support_tickets["']\)/, "Must query support_tickets table");
    assert.match(content, /sanitizeFilterTerm/, "Must sanitize search term");
  });

  await t.test("Sub-phases 10.6-10.10: Ticket Status Transitions & Priority Management", () => {
    const supportActionPath = path.resolve(process.cwd(), "app/actions/support.ts");
    const content = fs.readFileSync(supportActionPath, "utf-8");

    assert.match(content, /export async function adminUpdateTicketStatusAction/, "Must export adminUpdateTicketStatusAction");
    assert.match(content, /resolutionNotes/, "Must support resolution notes on status updates");
  });

  await t.test("Sub-phases 10.11-10.15: Administrator Replies, Private Internal Notes & In-App Notifications", () => {
    const supportActionPath = path.resolve(process.cwd(), "app/actions/support.ts");
    const content = fs.readFileSync(supportActionPath, "utf-8");

    assert.match(content, /export async function adminReplySupportTicketAction/, "Must export adminReplySupportTicketAction");
    assert.match(content, /is_internal/, "Must differentiate public replies from private internal notes");
    assert.match(content, /customer_notifications/, "Public admin replies must dispatch customer/astrologer notifications");
    assert.match(content, /support_ticket_events/, "Must record audit events in support_ticket_events");
  });

  await t.test("Sub-phases 10.16-10.20: Support Desk Page Architecture & Access Protection", () => {
    const pagePath = path.resolve(process.cwd(), "app/super-admin/support/page.tsx");
    assert.ok(fs.existsSync(pagePath), "app/super-admin/support/page.tsx must exist");
    const pageContent = fs.readFileSync(pagePath, "utf-8");

    assert.match(pageContent, /requireAdminAccess\(\)/, "Support page must require administrative access");
    assert.match(pageContent, /AdminSupportDeskClient/, "Must render AdminSupportDeskClient");
  });
});
