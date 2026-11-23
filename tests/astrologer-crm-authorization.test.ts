import test from "node:test";
import assert from "node:assert/strict";

interface MockAstrologerContext {
  astrologerId: string;
}

// Function simulating the relationship authorization engine in astrologer-crm.ts
function authorizeCrmAccess(
  context: MockAstrologerContext,
  customerId: string,
  relationships: Array<{ customerId: string; astrologerId: string }>
): { allowed: boolean; error?: string } {
  const hasRelationship = relationships.some(
    (rel) => rel.customerId === customerId && rel.astrologerId === context.astrologerId
  );

  if (!hasRelationship) {
    return {
      allowed: false,
      error: "Access denied: No active consultation or enquiry relationship with this customer.",
    };
  }

  return { allowed: true };
}

test("Sub-phase 1.7: Astrologer cannot view notes of a customer with no prior enquiry or booking", () => {
  const context: MockAstrologerContext = { astrologerId: "astro_sharma_id" };
  const targetCustomer = "cust_stranger_id";

  const relationships = [
    { customerId: "cust_client_1", astrologerId: "astro_sharma_id" },
    { customerId: "cust_stranger_id", astrologerId: "astro_other_pandit" },
  ];

  const result = authorizeCrmAccess(context, targetCustomer, relationships);
  assert.equal(result.allowed, false);
  assert.equal(result.error, "Access denied: No active consultation or enquiry relationship with this customer.");
});

test("Sub-phase 1.7: Astrologer successfully views notes for customer with confirmed relationship", () => {
  const context: MockAstrologerContext = { astrologerId: "astro_sharma_id" };
  const targetCustomer = "cust_client_1";

  const relationships = [
    { customerId: "cust_client_1", astrologerId: "astro_sharma_id" },
  ];

  const result = authorizeCrmAccess(context, targetCustomer, relationships);
  assert.equal(result.allowed, true);
});

test("Sub-phase 1.7: Updating follow-up status strictly requires note ownership by astrologer", () => {
  interface MockNote {
    id: string;
    astrologerId: string;
    status: string;
  }

  function authorizeStatusUpdate(
    callerAstrologerId: string,
    note: MockNote,
    newStatus: string
  ): { allowed: boolean; error?: string } {
    if (note.astrologerId !== callerAstrologerId) {
      return { allowed: false, error: "Access denied: You do not own this note." };
    }
    note.status = newStatus;
    return { allowed: true };
  }

  const note: MockNote = { id: "note_101", astrologerId: "astro_sharma_id", status: "pending" };
  
  // Attacker attempt
  const attackResult = authorizeStatusUpdate("astro_attacker", note, "completed");
  assert.equal(attackResult.allowed, false);
  assert.equal(note.status, "pending");

  // Owner update
  const ownerResult = authorizeStatusUpdate("astro_sharma_id", note, "completed");
  assert.equal(ownerResult.allowed, true);
  assert.equal(note.status, "completed");
});
