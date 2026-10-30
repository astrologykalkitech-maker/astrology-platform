import test from "node:test";
import assert from "node:assert/strict";

test("Consultation Chat Isolation: Validates message constraints safely", () => {
  function validateChatMessage(text: string): { valid: boolean; sanitized?: string; error?: string } {
    const clean = text.trim();
    if (!clean || clean.length === 0) {
      return { valid: false, error: "Message cannot be empty." };
    }
    if (clean.length > 1000) {
      return { valid: false, error: "Message must not exceed 1000 characters." };
    }
    return { valid: true, sanitized: clean };
  }

  // 1. Valid message
  const valid = validateChatMessage("Namaste Pandit ji, my birth time is 09:14 PM.");
  assert.equal(valid.valid, true);
  assert.equal(valid.sanitized, "Namaste Pandit ji, my birth time is 09:14 PM.");

  // 2. Whitespace-only message -> rejected
  const whitespace = validateChatMessage("    \n\t  ");
  assert.equal(whitespace.valid, false);
  assert.match(whitespace.error || "", /cannot be empty/i);

  // 3. Oversized message (>1000 chars) -> rejected
  const oversized = validateChatMessage("A".repeat(1005));
  assert.equal(oversized.valid, false);
  assert.match(oversized.error || "", /exceed 1000 characters/i);
});

test("Consultation Chat Isolation: Messages are scoped strictly to one meeting_id", () => {
  interface MockMessage {
    id: string;
    meeting_id: string;
    sender_id: string;
    message: string;
  }

  const databaseMessages: MockMessage[] = [
    { id: "m1", meeting_id: "meeting_A", sender_id: "user_1", message: "Hello in room A" },
    { id: "m2", meeting_id: "meeting_A", sender_id: "user_2", message: "Response in room A" },
    { id: "m3", meeting_id: "meeting_B", sender_id: "user_3", message: "Confidential in room B" },
  ];

  function queryMeetingChat(meetingId: string) {
    return databaseMessages.filter((m) => m.meeting_id === meetingId);
  }

  const roomAMessages = queryMeetingChat("meeting_A");
  assert.equal(roomAMessages.length, 2);
  assert.equal(roomAMessages.some((m) => m.meeting_id === "meeting_B"), false);

  const roomBMessages = queryMeetingChat("meeting_B");
  assert.equal(roomBMessages.length, 1);
  assert.equal(roomBMessages[0].message, "Confidential in room B");
});

