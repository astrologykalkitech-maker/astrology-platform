import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VALID_LEAD_STATUSES,
  VALID_LEAD_PRIORITIES,
  VALID_QUALIFICATION_STATUSES,
  validateLeadAssignmentInput,
} from "../lib/validations/admin";
import {
  isValidUUID,
  validateStatusTransition,
} from "../lib/validations/lead";
import {
  getAdminLeads,
  getLeadDetailsWithHistory,
  assignLead,
  batchAssignLeads,
  updateLeadQualification,
  addLeadInternalNote,
} from "../app/actions/admin-leads";

test("Phase 12: Lead Status & Lifecycle Definitions", () => {
  // Check valid statuses
  assert.equal(VALID_LEAD_STATUSES.has("new"), true);
  assert.equal(VALID_LEAD_STATUSES.has("assigned"), true);
  assert.equal(VALID_LEAD_STATUSES.has("contacted"), true);
  assert.equal(VALID_LEAD_STATUSES.has("qualified"), true);
  assert.equal(VALID_LEAD_STATUSES.has("converted"), true);
  assert.equal(VALID_LEAD_STATUSES.has("closed"), true);
  assert.equal(VALID_LEAD_STATUSES.has("invalid"), true);
  assert.equal(VALID_LEAD_STATUSES.has("duplicate"), true);

  // Check valid qualification statuses
  assert.equal(VALID_QUALIFICATION_STATUSES.has("unqualified"), true);
  assert.equal(VALID_QUALIFICATION_STATUSES.has("qualified"), true);
  assert.equal(VALID_QUALIFICATION_STATUSES.has("duplicate"), true);
  assert.equal(VALID_QUALIFICATION_STATUSES.has("invalid"), true);

  // Check valid priorities
  assert.equal(VALID_LEAD_PRIORITIES.has("low"), true);
  assert.equal(VALID_LEAD_PRIORITIES.has("medium"), true);
  assert.equal(VALID_LEAD_PRIORITIES.has("high"), true);
  assert.equal(VALID_LEAD_PRIORITIES.has("urgent"), true);
});

test("Phase 12: Lead Assignment Validation", () => {
  const validUUID1 = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
  const validUUID2 = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";

  // Invalid payload
  const res1 = validateLeadAssignmentInput(null);
  assert.equal(res1.valid, false);

  // Invalid leadId
  const res2 = validateLeadAssignmentInput({ leadId: "not-a-uuid", astrologerId: validUUID2 });
  assert.equal(res2.valid, false);
  assert.match(res2.error!, /A valid lead UUID is required/);

  // Valid assignment
  const res3 = validateLeadAssignmentInput({
    leadId: validUUID1,
    astrologerId: validUUID2,
    reason: "VIP routing",
  });
  assert.equal(res3.valid, true);
  if (res3.valid) {
    assert.equal(res3.data.leadId, validUUID1);
    assert.equal(res3.data.astrologerId, validUUID2);
    assert.equal(res3.data.reason, "VIP routing");
  }

  // Valid unassignment (astrologerId === null)
  const res4 = validateLeadAssignmentInput({
    leadId: validUUID1,
    astrologerId: null,
    reason: "Revoked assignment",
  });
  assert.equal(res4.valid, true);
  if (res4.valid) {
    assert.equal(res4.data.leadId, validUUID1);
    assert.equal(res4.data.astrologerId, null);
  }
});

test("Phase 12: Astrologer Lead Transition State Machine", () => {
  // Assigned -> Contacted
  const t1 = validateStatusTransition("assigned", "contacted");
  assert.equal(t1.valid, true);

  // Assigned -> Closed
  const t2 = validateStatusTransition("assigned", "closed");
  assert.equal(t2.valid, true);

  // Contacted -> Closed
  const t3 = validateStatusTransition("contacted", "closed");
  assert.equal(t3.valid, true);

  // No-op transition
  const tNoOp = validateStatusTransition("assigned", "assigned");
  assert.equal(tNoOp.valid, false);

  // Terminal state modification
  const tTerminal = validateStatusTransition("closed", "contacted");
  assert.equal(tTerminal.valid, false);
  assert.match(tTerminal.error!, /terminal/);
});

test("Phase 12: Lead Management Action Signatures and Exports", () => {
  assert.equal(typeof getAdminLeads, "function");
  assert.equal(typeof getLeadDetailsWithHistory, "function");
  assert.equal(typeof assignLead, "function");
  assert.equal(typeof batchAssignLeads, "function");
  assert.equal(typeof updateLeadQualification, "function");
  assert.equal(typeof addLeadInternalNote, "function");
});

test("Phase 12: Lead Batch Assignment Guards and Security", async () => {
  // Calling batchAssignLeads unauthenticated rejects with administrative permission requirement
  const res1 = await batchAssignLeads([], "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d");
  assert.equal(res1.success, false);
  assert.match(res1.error!, /Administrative privileges required|Access denied/);
});
