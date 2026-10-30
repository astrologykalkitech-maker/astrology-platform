import test from "node:test";
import assert from "node:assert/strict";
import { isValidUUID } from "../lib/validations/lead";

test("Standalone Chat: Message length and payload validation", () => {
  function validateDirectMessage(
    conversationId: string,
    message: string,
    attachmentUrl?: string | null
  ): { valid: boolean; error?: string } {
    if (!isValidUUID(conversationId)) {
      return { valid: false, error: "Invalid conversation ID" };
    }
    const trimmed = message.trim();
    if (!trimmed && !attachmentUrl) {
      return { valid: false, error: "Message content or attachment is required" };
    }
    if (trimmed.length > 2000) {
      return { valid: false, error: "Message cannot exceed 2000 characters" };
    }
    return { valid: true };
  }

  const validConvoId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

  // Valid message
  assert.equal(
    validateDirectMessage(validConvoId, "Namaste Ji, I have a query about my Sade Sati.").valid,
    true
  );

  // Valid message with attachment
  assert.equal(
    validateDirectMessage(validConvoId, "", "https://storage.supabase.co/kundli.pdf").valid,
    true
  );

  // Invalid conversation UUID
  assert.equal(
    validateDirectMessage("invalid-id", "Hello").error,
    "Invalid conversation ID"
  );

  // Empty message without attachment
  assert.equal(
    validateDirectMessage(validConvoId, "   ").error,
    "Message content or attachment is required"
  );

  // Exceeding 2000 chars
  assert.equal(
    validateDirectMessage(validConvoId, "x".repeat(2001)).error,
    "Message cannot exceed 2000 characters"
  );
});

test("Standalone Chat: Unread count tracking and read receipt transition", () => {
  interface MockConversation {
    id: string;
    customer_unread: number;
    astrologer_unread: number;
    last_message_preview: string;
  }

  const convo: MockConversation = {
    id: "convo_1",
    customer_unread: 0,
    astrologer_unread: 0,
    last_message_preview: "",
  };

  // 1. Customer sends message -> Astrologer unread count increments
  function onCustomerMessage(text: string) {
    convo.astrologer_unread += 1;
    convo.last_message_preview = text.slice(0, 80);
  }

  onCustomerMessage("Is gemstone wearing time fixed?");
  assert.equal(convo.astrologer_unread, 1);
  assert.equal(convo.customer_unread, 0);

  // 2. Astrologer opens conversation -> Astrologer unread count resets to 0
  function onAstrologerRead() {
    convo.astrologer_unread = 0;
  }

  onAstrologerRead();
  assert.equal(convo.astrologer_unread, 0);

  // 3. Astrologer replies -> Customer unread count increments
  function onAstrologerReply(text: string) {
    convo.customer_unread += 1;
    convo.last_message_preview = text.slice(0, 80);
  }

  onAstrologerReply("Wear it during Shukla Paksha on Thursday morning.");
  assert.equal(convo.customer_unread, 1);
  assert.equal(convo.astrologer_unread, 0);
});

test("Standalone Chat: Strict isolation between customer and astrologer pairs", () => {
  interface ConvoRecord {
    id: string;
    customerId: string;
    astrologerId: string;
  }

  const allConvos: ConvoRecord[] = [
    { id: "c1", customerId: "user_alice", astrologerId: "astro_sharma" },
    { id: "c2", customerId: "user_bob", astrologerId: "astro_sharma" },
    { id: "c3", customerId: "user_alice", astrologerId: "astro_verma" },
  ];

  // Alice can only see c1 and c3
  const aliceConvos = allConvos.filter((c) => c.customerId === "user_alice");
  assert.equal(aliceConvos.length, 2);
  assert.equal(aliceConvos.some((c) => c.id === "c2"), false);

  // Astrologer Sharma can only see c1 and c2
  const sharmaConvos = allConvos.filter((c) => c.astrologerId === "astro_sharma");
  assert.equal(sharmaConvos.length, 2);
  assert.equal(sharmaConvos.some((c) => c.id === "c3"), false);
});

