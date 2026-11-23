import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 1.10: Support Ticket Privacy & Customer Authorization", () => {
  const supportPath = path.resolve(process.cwd(), "app/actions/support.ts");
  const content = fs.readFileSync(supportPath, "utf-8");

  it("enforces authentication and customer role verification in support user guard", () => {
    assert.match(
      content,
      /async function requireSupportUser\(\)[\s\S]*?const user = await getCurrentUser\(\);[\s\S]*?if \(!user\) \{\s*throw new AuthRequiredError/
    );
  });

  it("binds created support ticket user_id strictly to authenticated user.id", () => {
    assert.match(
      content,
      /export async function createSupportTicketAction\([\s\S]*?\.from\("support_tickets"\)[\s\S]*?\.insert\(\{[\s\S]*?user_id:\s*user\.id,/,
      "createSupportTicketAction must assign user_id: user.id"
    );
  });

  it("scopes user ticket listing strictly to user_id = user.id", () => {
    assert.match(
      content,
      /export async function getUserSupportTicketsAction\(\)[\s\S]*?\.from\("support_tickets"\)[\s\S]*?\.select\("\*"\)[\s\S]*?\.eq\("user_id",\s*user\.id\)/,
      "getUserSupportTicketsAction must query support_tickets strictly filtered by user_id = user.id"
    );
  });

  it("enforces strict ticket ownership authorization on ticket details access", () => {
    assert.match(
      content,
      /if \(!isStaff && ticket\.user_id !== user\.id\) \{\s*return \{ success: false, error: "Unauthorized access to this support ticket\." \};/,
      "getSupportTicketDetailsAction must reject any user who is neither staff nor the ticket owner"
    );
  });

  it("hides internal staff notes from customer view in ticket timeline", () => {
    assert.match(
      content,
      /if \(!isStaff\) \{\s*msgQuery = msgQuery\.eq\("is_internal", false\);\s*\}/,
      "Internal staff notes must be filtered out for non-staff viewers"
    );
  });

  it("enforces ticket ownership check before inserting follow-up customer message", () => {
    assert.match(
      content,
      /export async function addSupportTicketMessageAction\([\s\S]*?if \(ticket\.user_id !== user\.id\) \{\s*return \{ success: false, error: "Unauthorized to post on this ticket\." \};/,
      "addSupportTicketMessageAction must check ticket.user_id === user.id"
    );
  });
});
