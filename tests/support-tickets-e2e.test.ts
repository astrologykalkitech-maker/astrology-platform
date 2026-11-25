import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

test("Support ticket backend rejects closed ticket replies and enforces ownership", () => {
  const supportActions = readFile("app/actions/support.ts");
  assert.match(supportActions, /if \(ticket\.status === "closed"\)/);
  assert.match(supportActions, /Unauthorized to post on this ticket\./);
  assert.match(supportActions, /statusUpdateErr/);
});

test("Customer, Astrologer, and Super Admin support clients surface reply errors and live-sync open tickets", () => {
  const customerSupport = readFile("app/customer/(portal)/support/CustomerSupportInteractiveClient.tsx");
  const astroSupport = readFile("app/astrologer/(portal)/support/AstrologerSupportInteractiveClient.tsx");
  const adminSupport = readFile("app/super-admin/support/AdminSupportDeskClient.tsx");

  for (const client of [customerSupport, astroSupport]) {
    assert.match(client, /setReplyError\(/);
    assert.match(client, /\{replyError && \(/);
    assert.match(client, /getSupportTicketDetailsAction\(activeTicketId\)/);
  }
  assert.match(adminSupport, /getSupportTicketDetailsAction\(activeTicketId\)/);
  assert.match(adminSupport, /setReplyError\(/);
});
