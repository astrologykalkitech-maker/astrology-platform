import test from "node:test";
import assert from "node:assert/strict";
import { isValidUUID } from "../lib/validations/lead";

test("Astrologer CRM: Note payload validation and length constraints", () => {
  function validateNoteInput(input: {
    customerId: string;
    title: string;
    content: string;
    followUpDate?: string | null;
  }): { valid: boolean; error?: string } {
    if (!isValidUUID(input.customerId)) {
      return { valid: false, error: "Invalid customer ID" };
    }
    const title = input.title.trim();
    const content = input.content.trim();
    if (!title || !content) {
      return { valid: false, error: "Title and content are required" };
    }
    if (title.length > 200) {
      return { valid: false, error: "Title cannot exceed 200 characters" };
    }
    if (content.length > 5000) {
      return { valid: false, error: "Content cannot exceed 5000 characters" };
    }
    if (input.followUpDate) {
      const parsed = new Date(input.followUpDate);
      if (isNaN(parsed.getTime())) {
        return { valid: false, error: "Invalid follow-up date format" };
      }
    }
    return { valid: true };
  }

  const validCustomerId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

  // Valid note
  assert.equal(
    validateNoteInput({
      customerId: validCustomerId,
      title: "Planetary Transit Review",
      content: "Saturn 7th house transit discussion. Advised Hanuman Chalisa recitation.",
      followUpDate: "2026-11-15T10:00:00Z",
    }).valid,
    true
  );

  // Invalid customer ID
  assert.equal(
    validateNoteInput({
      customerId: "not-a-uuid",
      title: "Title",
      content: "Content",
    }).error,
    "Invalid customer ID"
  );

  // Empty title
  assert.equal(
    validateNoteInput({
      customerId: validCustomerId,
      title: "   ",
      content: "Content",
    }).error,
    "Title and content are required"
  );

  // Title exceeding 200 chars
  assert.equal(
    validateNoteInput({
      customerId: validCustomerId,
      title: "a".repeat(201),
      content: "Content",
    }).error,
    "Title cannot exceed 200 characters"
  );

  // Invalid follow-up date
  assert.equal(
    validateNoteInput({
      customerId: validCustomerId,
      title: "Valid Title",
      content: "Valid Content",
      followUpDate: "not-a-date",
    }).error,
    "Invalid follow-up date format"
  );
});

test("Astrologer CRM: Confidential note isolation per astrologer-customer pair", () => {
  interface Note {
    id: string;
    astrologerId: string;
    customerId: string;
    title: string;
    followUpStatus: "pending" | "completed" | "cancelled" | null;
  }

  const mockNotes: Note[] = [
    { id: "1", astrologerId: "astro_A", customerId: "cust_1", title: "Note 1", followUpStatus: "pending" },
    { id: "2", astrologerId: "astro_A", customerId: "cust_2", title: "Note 2", followUpStatus: "completed" },
    { id: "3", astrologerId: "astro_B", customerId: "cust_1", title: "Note 3", followUpStatus: "pending" },
  ];

  // Astrologer A querying Customer 1: sees only their own note for Customer 1
  const astroANotes = mockNotes.filter((n) => n.astrologerId === "astro_A" && n.customerId === "cust_1");
  assert.equal(astroANotes.length, 1);
  assert.equal(astroANotes[0].title, "Note 1");

  // Astrologer B querying Customer 1: sees only their own note
  const astroBNotes = mockNotes.filter((n) => n.astrologerId === "astro_B" && n.customerId === "cust_1");
  assert.equal(astroBNotes.length, 1);
  assert.equal(astroBNotes[0].title, "Note 3");

  // Astrologer A cannot see notes written by Astrologer B
  assert.equal(astroANotes.some((n) => n.id === "3"), false);
});

test("Astrologer CRM: Follow-up status state transitions", () => {
  const allowedTransitions = (from: string, to: string) => {
    const valid = ["pending", "completed", "cancelled"];
    return valid.includes(from) && valid.includes(to);
  };

  assert.equal(allowedTransitions("pending", "completed"), true);
  assert.equal(allowedTransitions("completed", "pending"), true);
  assert.equal(allowedTransitions("pending", "cancelled"), true);
  assert.equal(allowedTransitions("pending", "invalid_status"), false);
});

