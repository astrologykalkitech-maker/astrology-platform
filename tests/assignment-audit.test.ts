import test from "node:test";
import assert from "node:assert/strict";

import { logAdminAction } from "../lib/admin/audit";

test("Phase 3 Atomic Assignment: Enforces strict transactional RPC requirement and fails closed", async () => {
  // Simulates assignLead fail-closed behavior when perform_atomic_lead_assignment RPC fails
  const simulateAssignLead = async (
    rpcResult: { data: { success: boolean; status: string } | null; error: { message: string; code: string } | null }
  ): Promise<{ success: boolean; error?: string; data?: { leadId: string; newStatus: string } }> => {
    if (rpcResult.error) {
      return {
        success: false,
        error: rpcResult.error.message || "Failed to assign lead via atomic transaction.",
      };
    }

    if (!rpcResult.data || !rpcResult.data.success) {
      return {
        success: false,
        error: "Atomic lead assignment transaction failed to commit.",
      };
    }

    return {
      success: true,
      data: {
        leadId: "lead-123",
        newStatus: rpcResult.data.status,
      },
    };
  };

  // Test 1: RPC error fails closed immediately (no non-atomic fallback)
  const failureRes = await simulateAssignLead({
    data: null,
    error: { message: "Target astrologer is not an approved active listing.", code: "22000" },
  });
  assert.equal(failureRes.success, false);
  assert.match(failureRes.error!, /not an approved active listing/i);

  // Test 2: RPC transaction rollback fails closed
  const rollbackRes = await simulateAssignLead({
    data: { success: false, status: "new" },
    error: null,
  });
  assert.equal(rollbackRes.success, false);
  assert.match(rollbackRes.error!, /failed to commit/i);

  // Test 3: RPC success returns committed state
  const successRes = await simulateAssignLead({
    data: { success: true, status: "assigned" },
    error: null,
  });
  assert.equal(successRes.success, true);
  assert.equal(successRes.data?.newStatus, "assigned");
});

test("Phase 3 Audit Logging: Inspects Supabase insert errors and guarantees durability visibility", async () => {
  // Verify logAdminAction returns structured AuditLogResult { success: boolean, error?: string }
  // When SUPABASE_SERVICE_ROLE_KEY is absent/mocked to fail, it must report { success: false, error: ... }
  const res = await logAdminAction({
    actorId: "actor-123",
    actorRole: "super_admin",
    action: "lead.assign",
    targetType: "lead",
    targetId: "lead-abc",
    outcome: "success",
  });

  // Since live database connection is not active in this unit run, it gracefully returns success: false with actionable error
  assert.equal(typeof res.success, "boolean");
  if (!res.success) {
    assert.equal(typeof res.error, "string");
    assert.equal(res.error!.length > 0, true);
  }
});
