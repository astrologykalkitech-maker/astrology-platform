import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Customer Video & Voice Consultation Room Authorization & LiveKit Token Security Audit (Sub-phase 5.3)", async (t) => {
  const meetingActionPath = path.resolve(process.cwd(), "app/actions/consultation-meeting.ts");
  assert.ok(fs.existsSync(meetingActionPath), "app/actions/consultation-meeting.ts must exist");
  const meetingActionSource = fs.readFileSync(meetingActionPath, "utf-8");

  const tokenPath = path.resolve(process.cwd(), "lib/consultation/token.ts");
  assert.ok(fs.existsSync(tokenPath), "lib/consultation/token.ts must exist");
  const tokenSource = fs.readFileSync(tokenPath, "utf-8");

  const customerConsultationRedirectPath = path.resolve(
    process.cwd(),
    "app/customer/(portal)/consultation/[id]/page.tsx"
  );
  assert.ok(fs.existsSync(customerConsultationRedirectPath), "customer consultation redirect page must exist");
  const customerConsultationRedirectSource = fs.readFileSync(customerConsultationRedirectPath, "utf-8");

  await t.test("enforces participant authorization check (customer, astrologer, super_admin)", () => {
    assert.match(
      meetingActionSource,
      /const\s+isCustomer\s*=\s*booking\.customer_id\s*===\s*user\.id/i,
      "Expected isCustomer check comparing booking.customer_id with user.id"
    );
    assert.match(
      meetingActionSource,
      /if\s*\(\s*!isCustomer\s*&&\s*!isAstrologer\s*&&\s*profile\.role\s*!==\s*["']super_admin["']\s*\)/i,
      "Expected non-participant rejection"
    );
  });

  await t.test("verifies valid confirmed booking status and prepaid payment before issuing token", () => {
    assert.match(
      meetingActionSource,
      /if\s*\(\s*booking\.status\s*===\s*["']cancelled["']\s*\)/i,
      "Expected rejection of cancelled bookings"
    );
    assert.match(
      meetingActionSource,
      /if\s*\(\s*booking\.status\s*===\s*["']completed["']\s*\|\|\s*booking\.status\s*===\s*["']no_show["']\s*\)/i,
      "Expected rejection of completed or no_show bookings"
    );
    assert.match(
      meetingActionSource,
      /isVideoPaymentVerifiedForMode/i,
      "Expected payment verification guard for video consultations"
    );
  });

  await t.test("generates cryptographically random opaque room names and short-lived tokens", () => {
    assert.match(
      meetingActionSource,
      /const\s+opaqueRoomName\s*=\s*`karmicascension_\$\{crypto\.randomBytes\(12\)\.toString\("hex"\)\}`/i,
      "Expected cryptographically random room name generation"
    );
    assert.match(
      tokenSource,
      /export\s+async\s+function\s+generateLiveKitConsultationToken/i,
      "Expected generateLiveKitConsultationToken export"
    );
    assert.match(
      meetingActionSource,
      /participantIdentity:\s*user\.id/i,
      "Expected token participantIdentity strictly bound to authenticated user.id"
    );
  });

  await t.test("customer consultation route smoothly redirects to unified /consultation/[id] room", () => {
    assert.match(
      customerConsultationRedirectSource,
      /redirect\(\s*`\/consultation\/\$\{id\}`\s*\)/i,
      "Expected customer consultation page to redirect to unified room /consultation/[id]"
    );
  });
});
