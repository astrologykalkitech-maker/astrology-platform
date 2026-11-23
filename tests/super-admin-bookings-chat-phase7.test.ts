import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Phase 7: Bookings, Consultations & Real-Time Communications Desk (Sub-phases 7.1 – 7.20)", async (t) => {
  await t.test("Sub-phases 7.1-7.5: Consultation Appointments Desk & Status Workflow", () => {
    const bookingsActionPath = path.resolve(process.cwd(), "app/actions/admin-bookings.ts");
    assert.ok(fs.existsSync(bookingsActionPath), "admin-bookings.ts must exist");
    const content = fs.readFileSync(bookingsActionPath, "utf-8");

    assert.match(content, /export async function getAdminBookings/, "Must export getAdminBookings");
    assert.match(content, /requireSuperAdmin\(\)/, "Must strictly enforce requireSuperAdmin");
    assert.match(content, /from\(["']customer_bookings["']\)/, "Must query customer_bookings");
    assert.match(content, /export async function updateAdminBookingStatus/, "Must export updateAdminBookingStatus");
    assert.match(content, /logAdminAction/, "Status updates must write immutable audit log");
  });

  await t.test("Sub-phases 7.6-7.10: Live Consultation Oversight & Interventions", () => {
    const pagePath = path.resolve(process.cwd(), "app/super-admin/bookings/page.tsx");
    assert.ok(fs.existsSync(pagePath), "app/super-admin/bookings/page.tsx must exist");
    const content = fs.readFileSync(pagePath, "utf-8");

    assert.match(content, /getAdminBookings/, "Must fetch bookings");
    assert.match(content, /updateAdminBookingStatus/, "Must support administrative status transitions");
  });

  await t.test("Sub-phases 7.11-7.15: Direct Chat Oversight & Moderation", () => {
    const chatActionPath = path.resolve(process.cwd(), "app/actions/direct-chat.ts");
    assert.ok(fs.existsSync(chatActionPath), "direct-chat.ts must exist");
    const content = fs.readFileSync(chatActionPath, "utf-8");

    assert.match(content, /export async function getSuperAdminChatOverviewAction/, "Must export getSuperAdminChatOverviewAction");
    assert.match(content, /requireSuperAdmin\(\)/, "Chat overview must require Super Admin");
    assert.match(content, /from\(["']conversations["']\)/, "Must query conversations");
    assert.match(content, /from\(["']direct_messages["']\)/, "Must query direct_messages");
    assert.match(content, /pendingAbuseReports/, "Must aggregate pending abuse reports");
  });

  await t.test("Sub-phases 7.16-7.20: Dispute Auditing, Abuse Reports & Resolution", () => {
    const chatActionPath = path.resolve(process.cwd(), "app/actions/direct-chat.ts");
    const content = fs.readFileSync(chatActionPath, "utf-8");

    assert.match(content, /reportChatAbuseAction/, "Must export reportChatAbuseAction");
    assert.match(content, /chat_abuse_reports/, "Must persist abuse reports to chat_abuse_reports");
  });
});
