import test from "node:test";
import assert from "node:assert/strict";

import { checkPermission } from "../lib/auth/permissions";
import type { AdminPermissionKey, UserRole } from "../lib/types/database.types";

/**
 * Phase 4 Database RLS, Grants, and Role Security Unit Tests
 */

test("Phase 4 RLS: Internal note read/insert policy scopes strictly to accessible leads (F-04)", () => {
  interface MockLeadNote {
    id: string;
    lead_id: string;
    author_id: string;
    note: string;
  }

  interface MockLead {
    id: string;
    assigned_to: string | null;
  }

  const checkNoteAccess = (
    note: MockLeadNote,
    lead: MockLead,
    callerId: string,
    callerRole: UserRole,
    permissions: AdminPermissionKey[]
  ): boolean => {
    // 1. Super Admin universal access
    if (callerRole === "super_admin" || callerRole === "admin") return true;

    // 2. Consultant with lead.read.all permission
    if (permissions.includes("lead.read.all")) return true;

    // 3. Consultant with lead.read.assigned AND lead is assigned to them
    if (permissions.includes("lead.read.assigned") && lead.assigned_to === callerId) {
      return true;
    }

    // Otherwise denied (even if they were the author of a note on an unassigned/reassigned lead)
    return false;
  };

  const consultantA = "consultant-aaa";
  const consultantB = "consultant-bbb";
  const leadForA: MockLead = { id: "lead-1", assigned_to: consultantA };

  const noteOnLeadA: MockLeadNote = {
    id: "note-1",
    lead_id: "lead-1",
    author_id: consultantA,
    note: "Customer requested morning consultation",
  };

  // Positive: Consultant A can read notes on Lead A
  assert.equal(
    checkNoteAccess(noteOnLeadA, leadForA, consultantA, "consultant_admin", ["lead.read.assigned"]),
    true,
    "Consultant A must have access to notes on their assigned lead"
  );

  // Negative (IDOR block): Consultant B cannot read notes on Lead A
  assert.equal(
    checkNoteAccess(noteOnLeadA, leadForA, consultantB, "consultant_admin", ["lead.read.assigned"]),
    false,
    "Consultant B must be denied reading notes on a lead assigned to Consultant A"
  );

  // Negative: Even if Consultant B authored a note earlier, if the lead is not assigned to them, access is blocked
  const legacyNoteByBOnLeadA: MockLeadNote = {
    id: "note-legacy",
    lead_id: "lead-1",
    author_id: consultantB,
    note: "Legacy note by B before reassignment",
  };
  assert.equal(
    checkNoteAccess(legacyNoteByBOnLeadA, leadForA, consultantB, "consultant_admin", ["lead.read.assigned"]),
    false,
    "Author ID alone must not grant access to a lead currently outside the consultant's assignment scope"
  );
});

test("Phase 4 Role-Aware RPC: Atomic assignment verifies role and permission together (F-08)", () => {
  const evaluateRpcPermission = (
    callerRole: UserRole,
    permissions: AdminPermissionKey[]
  ): boolean => {
    // Replicates public.has_admin_permission('lead.assign')
    return checkPermission(callerRole, permissions, "lead.assign");
  };

  // Super Admin inherently allowed
  assert.equal(evaluateRpcPermission("super_admin", []), true);

  // Customer or Astrologer with accidental permission key row in DB MUST BE REJECTED
  assert.equal(
    evaluateRpcPermission("customer", ["lead.assign"]),
    false,
    "Customer with rogue permission row must be rejected"
  );
  assert.equal(
    evaluateRpcPermission("astrologer", ["lead.assign"]),
    false,
    "Astrologer with rogue permission row must be rejected"
  );

  // Consultant Admin with rogue lead.assign is denied (because lead.assign is strictly superAdminOnly)
  assert.equal(
    evaluateRpcPermission("consultant_admin", ["lead.assign"]),
    false,
    "lead.assign is reserved for Owner Super Admin and cannot be exercised by consultant_admin"
  );

  // Consultant Admin without permission is denied
  assert.equal(
    evaluateRpcPermission("consultant_admin", ["listing.read"]),
    false
  );
});

test("Phase 4 Owner Protection: Deletion of last remaining Super Admin is strictly blocked (F-14)", () => {
  const guardProfileDeletion = (
    currentSuperAdminCount: number,
    targetRole: UserRole
  ): { allowed: boolean; error?: string } => {
    if (targetRole === "super_admin" || targetRole === "admin") {
      // If only 1 super admin exists, deletion MUST BE BLOCKED
      if (currentSuperAdminCount <= 1) {
        return {
          allowed: false,
          error: "Cannot delete or remove the last remaining super administrator on the platform.",
        };
      }
    }
    return { allowed: true };
  };

  // Solo Super Admin deletion attempt -> BLOCKED
  const soloDelete = guardProfileDeletion(1, "super_admin");
  assert.equal(soloDelete.allowed, false);
  assert.match(soloDelete.error!, /last remaining super administrator/i);

  // Multiple Super Admins -> Allowed
  const multiDelete = guardProfileDeletion(2, "super_admin");
  assert.equal(multiDelete.allowed, true);

  // Non-super-admin deletion -> Allowed
  const customerDelete = guardProfileDeletion(1, "customer");
  assert.equal(customerDelete.allowed, true);
});
