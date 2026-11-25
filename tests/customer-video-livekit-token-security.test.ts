import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 1.8: Video/Voice Consultation Authorization & LiveKit Token Security", () => {
  const meetingPath = path.resolve(process.cwd(), "app/actions/consultation-meeting.ts");
  const tokenPath = path.resolve(process.cwd(), "lib/consultation/token.ts");

  const meetingContent = fs.readFileSync(meetingPath, "utf-8");
  const tokenContent = fs.readFileSync(tokenPath, "utf-8");

  it("enforces strict participant authorization for video/voice consultation meeting access", () => {
    assert.match(
      meetingContent,
      /const isCustomer = booking\.customer_id === user\.id;\s*const isAstrologer = astroObj\?\.user_id === user\.id;\s*if \(!isCustomer && !isAstrologer && profile\.role !== "super_admin"\) \{\s*return \{\s*success: false,\s*error: "Unauthorized: You are not an assigned participant in this consultation\.",\s*\};/m,
      "Must reject anyone other than the booking customer, assigned astrologer, or super_admin"
    );
  });

  it("verifies booking status before issuing LiveKit tokens", () => {
    assert.match(
      meetingContent,
      /if \(booking\.status === "cancelled"\)/,
      "Must reject cancelled bookings"
    );
    assert.match(
      meetingContent,
      /if \(booking\.status === "completed" \|\| booking\.status === "no_show"\)/,
      "Must reject completed or no_show bookings"
    );
    assert.match(
      meetingContent,
      /if \(booking\.status === "pending"\)/,
      "Must reject unconfirmed pending bookings"
    );
  });

  it("verifies video payment status prior to token generation (case-insensitive)", () => {
    assert.match(
      meetingContent,
      /const isVideoConsultation = \(booking\.consultation_mode \|\| ""\)\.toLowerCase\(\) === "video";\s*if \(isVideoConsultation && booking\.payment_mode !== "pay_at_drop"\)/,
      "Must inspect payment for video consultations with case-normalization"
    );
    assert.match(
      meetingContent,
      /if \(!isVideoPaymentVerifiedForMode\(\{[\s\S]*?\}\)\) \{\s*return \{\s*success: false,\s*error: "A verified payment is required before joining this prepaid video consultation\.",\s*\};/,
      "Must reject prepaid video consultations without verified payment"
    );
  });

  it("enforces active scheduling time window check", () => {
    assert.match(
      meetingContent,
      /const windowCheck = isMeetingWindowActive\(booking\.scheduled_at, booking\.duration_minutes\);\s*if \(!windowCheck\.allowed\) \{\s*return \{ success: false, error: windowCheck\.reason \};\s*\}/,
      "Must prevent joining outside scheduled consultation window"
    );
  });

  it("generates opaque room names and short-lived tokens with secure participant identity", () => {
    assert.match(
      meetingContent,
      /const opaqueRoomName = `karmicascension_(?:consultation_)?\$\{crypto\.randomBytes\(12\)\.toString\("hex"\)\}`;/,
      "Room names must be opaque cryptographically random hex strings"
    );
    assert.match(
      tokenContent,
      /export async function generateLiveKitConsultationToken\(\s*options:\s*GenerateConsultationTokenOptions\s*\)/,
      "generateLiveKitConsultationToken must exist and enforce parameters"
    );
    assert.match(
      meetingContent,
      /generateLiveKitConsultationToken\(\{[\s\S]*?participantIdentity:\s*user\.id,[\s\S]*?role:\s*isHost \? "host" : "customer",/,
      "LiveKit token identity must bind strictly to user.id"
    );
  });
});
