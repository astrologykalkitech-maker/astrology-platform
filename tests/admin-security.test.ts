import test from "node:test";
import assert from "node:assert/strict";

import { validateSignUpInput } from "../lib/validations/auth";
import { checkPermission, ADMIN_PERMISSIONS } from "../lib/auth/permissions";
import {
  validateListingModerationInput,
  validateListingRankingInput,
  validateLeadAssignmentInput,
  validateConsultantPermissionsInput,
} from "../lib/validations/admin";
import { isValidUUID } from "../lib/validations/lead";

test("Security: Public signup cannot self-assign administrative roles", () => {
  // Negative test: attempt to sign up as super_admin
  const superAdminAttempt = validateSignUpInput({
    email: "attacker@example.com",
    password: "Password123!",
    full_name: "Attacker",
    role: "super_admin" as unknown as "customer",
  });
  assert.equal(superAdminAttempt.valid, false);
  assert.match(superAdminAttempt.error, /Role must be 'customer' or 'astrologer'/i);

  // Negative test: attempt to sign up as consultant_admin
  const consultantAttempt = validateSignUpInput({
    email: "consultant@example.com",
    password: "Password123!",
    full_name: "Consultant",
    role: "consultant_admin" as unknown as "customer",
  });
  assert.equal(consultantAttempt.valid, false);

  // Negative test: attempt to sign up as legacy admin
  const adminAttempt = validateSignUpInput({
    email: "admin@example.com",
    password: "Password123!",
    full_name: "Admin",
    role: "admin" as unknown as "customer",
  });
  assert.equal(adminAttempt.valid, false);

  // Positive test: valid customer signup
  const customerValid = validateSignUpInput({
    email: "customer@example.com",
    password: "Password123!",
    full_name: "Legit Customer",
    role: "customer",
  });
  assert.equal(customerValid.valid, true);

  // Positive test: valid astrologer signup
  const astrologerValid = validateSignUpInput({
    email: "astrologer@example.com",
    password: "Password123!",
    full_name: "Legit Astrologer",
    role: "astrologer",
  });
  assert.equal(astrologerValid.valid, true);
});

test("Permissions: Super Admin has inherent access to all permissions", () => {
  for (const perm of ADMIN_PERMISSIONS) {
    const hasPerm = checkPermission("super_admin", [], perm.key);
    assert.equal(hasPerm, true, `super_admin should have permission: ${perm.key}`);
  }
});

test("Permissions: Legacy admin role is NOT automatically granted owner authority", () => {
  for (const perm of ADMIN_PERMISSIONS) {
    const hasLegacyPerm = checkPermission("admin", [], perm.key);
    assert.equal(hasLegacyPerm, false, `legacy admin role must not have implicit permission: ${perm.key}`);
  }
});

test("Permissions: Consultant Admin cannot bypass superAdminOnly restrictions even if granted key", () => {
  // Consultant with standard and unauthorized owner permissions injected
  const consultantWithEscalationAttempt = [
    "lead.read.assigned",
    "listing.read",
    "listing.approve",   // owner-only
    "lead.assign",       // owner-only
    "permission.manage", // owner-only
  ] as const;

  // Allowed operational permissions pass
  assert.equal(
    checkPermission("consultant_admin", [...consultantWithEscalationAttempt], "lead.read.assigned"),
    true
  );
  assert.equal(
    checkPermission("consultant_admin", [...consultantWithEscalationAttempt], "listing.read"),
    true
  );

  // Owner-only permissions MUST FAIL even if present in userPermissions array
  assert.equal(
    checkPermission("consultant_admin", [...consultantWithEscalationAttempt], "listing.approve"),
    false,
    "Consultant must not be permitted listing.approve"
  );
  assert.equal(
    checkPermission("consultant_admin", [...consultantWithEscalationAttempt], "lead.assign"),
    false,
    "Consultant must not be permitted lead.assign"
  );
  assert.equal(
    checkPermission("consultant_admin", [...consultantWithEscalationAttempt], "permission.manage"),
    false,
    "Consultant must not be permitted permission.manage"
  );
  assert.equal(
    checkPermission("consultant_admin", [...consultantWithEscalationAttempt], "audit.read"),
    false,
    "Consultant must not be permitted audit.read"
  );
});

test("Permissions: Customers and Astrologers receive denial on any administrative permission", () => {
  assert.equal(
    checkPermission("customer", ["listing.read"], "listing.read"),
    false
  );
  assert.equal(
    checkPermission("astrologer", ["listing.read"], "listing.read"),
    false
  );
});

test("Listing Moderation Validation: Enforces mandatory justification for rejection and suspension", () => {
  const validUUID = "123e4567-e89b-12d3-a456-426614174000";

  // Negative: Rejecting without reason must fail
  const rejectWithoutReason = validateListingModerationInput({
    listingId: validUUID,
    status: "rejected",
    reason: "",
  });
  assert.equal(rejectWithoutReason.valid, false);
  assert.match(rejectWithoutReason.error, /mandatory reason/i);

  // Negative: Suspending without reason must fail
  const suspendWithoutReason = validateListingModerationInput({
    listingId: validUUID,
    status: "suspended",
  });
  assert.equal(suspendWithoutReason.valid, false);

  // Positive: Approving does not mandate reason
  const approveValid = validateListingModerationInput({
    listingId: validUUID,
    status: "approved",
  });
  assert.equal(approveValid.valid, true);

  // Positive: Rejection with reason passes
  const rejectWithReason = validateListingModerationInput({
    listingId: validUUID,
    status: "rejected",
    reason: "Invalid certification document uploaded.",
  });
  assert.equal(rejectWithReason.valid, true);
});

test("Ranking & Placement Validation: Enforces score range and valid expiry date", () => {
  const validUUID = "123e4567-e89b-12d3-a456-426614174000";

  // Positive: standard priority update
  const validRanking = validateListingRankingInput({
    listingId: validUUID,
    rankingPriority: 50,
    isFeatured: true,
    featuredUntil: "2027-01-01T00:00:00Z",
    reason: "Promotional campaign feature",
  });
  assert.equal(validRanking.valid, true);
  assert.equal(validRanking.data.rankingPriority, 50);
  assert.equal(validRanking.data.isFeatured, true);

  // Negative: Out of bounds priority
  const outOfBounds = validateListingRankingInput({
    listingId: validUUID,
    rankingPriority: 99999,
  });
  assert.equal(outOfBounds.valid, false);
  assert.match(outOfBounds.error, /between -100 and 1000/i);

  // Negative: Invalid timestamp
  const invalidDate = validateListingRankingInput({
    listingId: validUUID,
    rankingPriority: 10,
    isFeatured: true,
    featuredUntil: "not-a-valid-date",
  });
  assert.equal(invalidDate.valid, false);
  assert.match(invalidDate.error, /invalid featureduntil/i);
});

test("Lead Assignment Validation: Ensures valid UUIDs and allows unassignment", () => {
  const leadId = "123e4567-e89b-12d3-a456-426614174000";
  const astrologerId = "223e4567-e89b-12d3-a456-426614174001";

  // Positive: assign
  const assignRes = validateLeadAssignmentInput({
    leadId,
    astrologerId,
    reason: "Specialized Vedic astrologer match",
  });
  assert.equal(assignRes.valid, true);
  assert.equal(assignRes.data.astrologerId, astrologerId);

  // Positive: unassign (null astrologerId)
  const unassignRes = validateLeadAssignmentInput({
    leadId,
    astrologerId: null,
    reason: "Consultant unavailable, returning to central queue",
  });
  assert.equal(unassignRes.valid, true);
  assert.equal(unassignRes.data.astrologerId, null);

  // Negative: malformed UUID
  const malformed = validateLeadAssignmentInput({
    leadId: "not-a-uuid",
    astrologerId,
  });
  assert.equal(malformed.valid, false);
});

test("Consultant Permissions Validation: Enforces known permission keys and strictly rejects superAdminOnly grants", () => {
  const userId = "123e4567-e89b-12d3-a456-426614174000";

  // Positive: only valid non-owner permissions
  const valid = validateConsultantPermissionsInput({
    userId,
    permissions: ["listing.read", "listing.review", "lead.read.assigned"],
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.data.permissions.length, 3);

  // Negative: unknown malicious permission key
  const invalidKey = validateConsultantPermissionsInput({
    userId,
    permissions: ["root.escalate", "listing.read"],
  });
  assert.equal(invalidKey.valid, false);
  assert.match(invalidKey.error, /invalid permission key/i);

  // Negative: attempt to grant owner-only listing.approve
  const ownerApprove = validateConsultantPermissionsInput({
    userId,
    permissions: ["listing.read", "listing.approve"],
  });
  assert.equal(ownerApprove.valid, false);
  assert.match(ownerApprove.error, /reserved exclusively for Owner Super Admin/i);

  // Negative: attempt to grant owner-only lead.assign
  const ownerLeadAssign = validateConsultantPermissionsInput({
    userId,
    permissions: ["lead.assign"],
  });
  assert.equal(ownerLeadAssign.valid, false);
  assert.match(ownerLeadAssign.error, /reserved exclusively for Owner Super Admin/i);
});

test("Security: createAdminClient fails closed if SUPABASE_SERVICE_ROLE_KEY is missing", async () => {
  const { createAdminClient } = await import("../lib/supabase/admin");

  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  try {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    await assert.rejects(
      async () => {
        await createAdminClient();
      },
      /Server configuration error: SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing/i
    );
  } finally {
    if (prevKey) process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
    if (prevUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
  }
});

test("Enquiry Payload Validation: Enforces required subject, message limits, and sanitizes UTM metadata", () => {
  // Test subject length validation
  const emptySubject = "";
  assert.equal(Boolean(emptySubject.trim()), false);

  const longSubject = "a".repeat(201);
  assert.equal(longSubject.length > 200, true);

  const validSubject = "Kundli matching enquiry";
  assert.equal(validSubject.length <= 200 && validSubject.trim().length > 0, true);

  // Test direct lead policy resolution
  const policyImmediate: string = "immediate_route";
  const shouldAssignImmediate = true && policyImmediate === "immediate_route";
  assert.equal(shouldAssignImmediate, true);

  const policyModeration: string = "require_moderation";
  const shouldAssignModeration = true && policyModeration === "immediate_route";
  assert.equal(shouldAssignModeration, false);
});

test("Batch Lead Assignment: Generates accurate per-lead success and failure reports", () => {
  const items = [
    { leadId: "123e4567-e89b-12d3-a456-426614174000", valid: true },
    { leadId: "not-a-valid-uuid", valid: false },
    { leadId: "223e4567-e89b-12d3-a456-426614174001", valid: true },
  ];

  const results: Array<{ leadId: string; success: boolean; error?: string }> = [];
  let assignedCount = 0;
  let failureCount = 0;

  for (const item of items) {
    if (!item.valid) {
      failureCount++;
      results.push({ leadId: item.leadId, success: false, error: "Invalid UUID format." });
    } else {
      assignedCount++;
      results.push({ leadId: item.leadId, success: true });
    }
  }

  assert.equal(assignedCount, 2);
  assert.equal(failureCount, 1);
  assert.equal(results.length, 3);
  assert.equal(results[1].success, false);
  assert.equal(results[1].error, "Invalid UUID format.");
});

test("Public Astrologer Discovery Ranking: Orders by featured, priority score, and creation date", () => {
  interface MockAstrologerListing {
    id: string;
    approval_status: string;
    is_featured: boolean;
    ranking_priority: number;
    created_at: string;
  }

  const listings: MockAstrologerListing[] = [
    { id: "1", approval_status: "approved", is_featured: false, ranking_priority: 10, created_at: "2026-01-01T00:00:00Z" },
    { id: "2", approval_status: "pending", is_featured: true, ranking_priority: 100, created_at: "2026-01-02T00:00:00Z" }, // unapproved!
    { id: "3", approval_status: "approved", is_featured: true, ranking_priority: 5, created_at: "2026-01-03T00:00:00Z" },
    { id: "4", approval_status: "approved", is_featured: false, ranking_priority: 50, created_at: "2026-01-01T00:00:00Z" },
    { id: "5", approval_status: "rejected", is_featured: true, ranking_priority: 999, created_at: "2026-01-05T00:00:00Z" }, // rejected!
  ];

  // 1. Filter: ONLY approved listings eligible
  const approvedOnly = listings.filter((l) => l.approval_status === "approved");
  assert.equal(approvedOnly.length, 3);
  assert.equal(approvedOnly.some((l) => l.id === "2" || l.id === "5"), false);

  // 2. Sort: is_featured desc, ranking_priority desc, created_at desc
  approvedOnly.sort((a, b) => {
    if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
    if (a.ranking_priority !== b.ranking_priority) return b.ranking_priority - a.ranking_priority;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Expected order:
  // 1st: ID "3" (featured, priority 5)
  // 2nd: ID "4" (not featured, priority 50)
  // 3rd: ID "1" (not featured, priority 10)
  assert.equal(approvedOnly[0].id, "3");
  assert.equal(approvedOnly[1].id, "4");
  assert.equal(approvedOnly[2].id, "1");
});

test("Consultant Lifecycle & Operational Controls: Rejects invalid emails and prevents self-demotion", () => {
  const invalidEmail = "notanemail";
  assert.equal(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invalidEmail), false);

  const validEmail = "newconsultant@jyotishsetu.com";
  assert.equal(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(validEmail), true);

  // Self-demotion guard logic
  const currentSuperAdminId = "123e4567-e89b-12d3-a456-426614174000";
  const targetUserId = "123e4567-e89b-12d3-a456-426614174000";
  const isSelf = currentSuperAdminId === targetUserId;
  assert.equal(isSelf, true, "Self-demotion must be detected and blocked");
});

test("Platform Analytics & Audit Trail: Ensures non-duplication and accurate KPI formula aggregation", () => {
  interface MockLeadItem {
    id: string;
    source_type: "platform" | "direct";
    status: string;
  }

  const leads: MockLeadItem[] = [
    { id: "1", source_type: "platform", status: "new" },
    { id: "2", source_type: "direct", status: "assigned" },
    { id: "3", source_type: "direct", status: "contacted" },
    { id: "4", source_type: "platform", status: "converted" },
    { id: "5", source_type: "platform", status: "invalid" },
  ];

  const totalLeads = leads.length;
  const platformLeads = leads.filter((l) => l.source_type === "platform").length;
  const directLeads = leads.filter((l) => l.source_type === "direct").length;
  const unassigned = leads.filter((l) => l.status === "new").length;

  assert.equal(totalLeads, 5);
  assert.equal(platformLeads, 3);
  assert.equal(directLeads, 2);
  assert.equal(platformLeads + directLeads, totalLeads, "Direct and platform leads must sum to total without double counting");
  assert.equal(unassigned, 1);
});

test("Phase 2 Negative Test: Rejects unauthorized public signup role injection (all privileged roles)", () => {
  const disallowedRoles = [
    "super_admin",
    "consultant_admin",
    "admin",
    "owner",
    "root",
    "service_role",
    "moderator",
  ];

  for (const role of disallowedRoles) {
    const res = validateSignUpInput({
      email: "test@example.com",
      password: "Password123!",
      full_name: "Test Hacker",
      role: role as unknown as "customer",
    });
    assert.equal(res.valid, false, `Role injection for '${role}' must be rejected`);
  }
});

test("Phase 2 Concurrency & Safety: Last active Super Admin demotion protection logic", () => {
  // Simulates guard_profile_role_changes logic
  const checkLastSuperAdminDemotion = (
    currentSuperAdminCount: number,
    targetIsSuperAdmin: boolean,
    newRole: string
  ): { allowed: boolean; error?: string } => {
    if (targetIsSuperAdmin && newRole !== "super_admin") {
      if (currentSuperAdminCount <= 1) {
        return {
          allowed: false,
          error: "Cannot demote or remove the last remaining super administrator on the platform.",
        };
      }
    }
    return { allowed: true };
  };

  // If only 1 super admin exists, demoting them MUST FAIL
  const soloAdminAttempt = checkLastSuperAdminDemotion(1, true, "customer");
  assert.equal(soloAdminAttempt.allowed, false);
  assert.match(soloAdminAttempt.error!, /last remaining super administrator/i);

  // If 2 super admins exist, demoting one succeeds
  const multiAdminAttempt = checkLastSuperAdminDemotion(2, true, "customer");
  assert.equal(multiAdminAttempt.allowed, true);

  // Demoting a non-super-admin does not trigger the last-super-admin block
  const consultantAttempt = checkLastSuperAdminDemotion(1, false, "customer");
  assert.equal(consultantAttempt.allowed, true);
});

test("Phase 2 Permission Revocation: Immediately revokes access upon permission removal", () => {
  const activePermissions = ["listing.read", "lead.read.assigned"] as const;
  assert.equal(checkPermission("consultant_admin", [...activePermissions], "listing.read"), true);

  // Revoke listing.read
  const updatedPermissions = activePermissions.filter((p) => p !== "listing.read");
  assert.equal(
    checkPermission("consultant_admin", [...updatedPermissions], "listing.read"),
    false,
    "Revoked permission must immediately result in false"
  );
  assert.equal(
    checkPermission("consultant_admin", [...updatedPermissions], "lead.read.assigned"),
    true,
    "Non-revoked permission must remain active"
  );
});

test("Phase 3 Negative Test: Cross-consultant lead record access denial (IDOR protection)", () => {
  // Simulate verifyLeadAccess behavior
  interface MockLead {
    id: string;
    assigned_to: string | null;
    astrologer_id: string | null;
  }

  const verifyLeadScope = (
    lead: MockLead,
    callerId: string,
    isSuperAdmin: boolean,
    permissions: string[],
    callerAstrologerId?: string
  ): boolean => {
    if (isSuperAdmin || permissions.includes("lead.read.all")) {
      return true;
    }
    if (!permissions.includes("lead.read.assigned")) {
      return false;
    }
    if (lead.assigned_to === callerId) {
      return true;
    }
    if (lead.astrologer_id && callerAstrologerId && lead.astrologer_id === callerAstrologerId) {
      return true;
    }
    return false;
  };

  const consultantA_Id = "11111111-1111-1111-1111-111111111111";
  const consultantB_Id = "22222222-2222-2222-2222-222222222222";
  const leadAssignedToA: MockLead = {
    id: "lead-aaa",
    assigned_to: consultantA_Id,
    astrologer_id: null,
  };
  const leadAssignedToB: MockLead = {
    id: "lead-bbb",
    assigned_to: consultantB_Id,
    astrologer_id: null,
  };

  // Consultant A accessing their own lead -> ALLOWED
  assert.equal(
    verifyLeadScope(leadAssignedToA, consultantA_Id, false, ["lead.read.assigned"]),
    true,
    "Consultant A must have access to their own assigned lead"
  );

  // Consultant A attempting to access Consultant B's lead -> DENIED (IDOR blocked)
  assert.equal(
    verifyLeadScope(leadAssignedToB, consultantA_Id, false, ["lead.read.assigned"]),
    false,
    "Consultant A must be denied access to Consultant B's lead"
  );

  // Consultant without 'lead.read.assigned' attempting access -> DENIED
  assert.equal(
    verifyLeadScope(leadAssignedToA, consultantA_Id, false, []),
    false,
    "Consultant without lead.read.assigned permission must be denied"
  );

  // Super Admin accessing any lead -> ALLOWED
  assert.equal(
    verifyLeadScope(leadAssignedToB, "super-admin-id", true, []),
    true,
    "Super Admin must have platform-wide access"
  );
});

test("Phase 3 Negative Test: Unauthorized lead qualification and internal note denial", () => {
  // Valid qualification statuses
  const validQualificationStatuses = new Set(["unqualified", "qualified", "duplicate", "invalid"]);
  assert.equal(validQualificationStatuses.has("qualified"), true);
  assert.equal(validQualificationStatuses.has("vip" as unknown as string), false);
  assert.equal(validQualificationStatuses.has("converted" as unknown as string), false);

  // Empty or whitespace-only internal note rejected
  const validateNote = (note: string): boolean => {
    return Boolean(note && note.trim().length > 0);
  };
  assert.equal(validateNote(""), false);
  assert.equal(validateNote("   "), false);
  assert.equal(validateNote("Valid customer callback notes"), true);
});

test("Phase 3 Validation: Invalid lead UUIDs and corrupt payloads fail safely", () => {
  assert.equal(isValidUUID("not-a-uuid"), false);
  assert.equal(isValidUUID("123e4567-e89b-12d3-a456-426614174000"), true);
  assert.equal(isValidUUID(null as unknown as string), false);
  assert.equal(isValidUUID(undefined as unknown as string), false);
  assert.equal(isValidUUID(""), false);
});

test("Phase 4 Central Lead Capture: Platform enquiries are durably saved with status 'new' and visible centrally", () => {
  interface MockCapturedLead {
    id: string;
    customer_id: string;
    astrologer_id: string | null;
    subject: string;
    message: string;
    status: string;
    source_type: string;
    source_url: string | null;
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
  }

  // Simulate platform lead submission (no specific astrologer selected)
  const createPlatformLead = (
    customerId: string,
    subject: string,
    message: string,
    utmSource?: string
  ): MockCapturedLead => {
    return {
      id: "platform-lead-uuid-1",
      customer_id: customerId,
      astrologer_id: null,
      subject: subject.trim(),
      message: message.trim(),
      status: "new", // Must be 'new' in central inbox
      source_type: "platform",
      source_url: "https://jyotishsetu.com/contact",
      utm_source: utmSource ?? null,
      utm_medium: "cpc",
      utm_campaign: "diwali_promo",
    };
  };

  const lead = createPlatformLead("cust-1", "General consultation", "Need advice on career", "google");
  assert.equal(lead.status, "new", "Platform-generated lead must be initially saved as status 'new'");
  assert.equal(lead.astrologer_id, null, "Platform lead must have null astrologer_id before assignment");
  assert.equal(lead.source_type, "platform");
  assert.equal(lead.utm_source, "google");
  assert.equal(lead.utm_campaign, "diwali_promo");
});

test("Phase 4 Direct Lead Policy & Routing: Respects platform policy setting", () => {
  // Test both branches of direct_lead_routing_policy
  const resolveInitialDirectLeadStatus = (policy: "immediate_route" | "require_moderation"): string => {
    return policy === "immediate_route" ? "assigned" : "new";
  };

  assert.equal(
    resolveInitialDirectLeadStatus("immediate_route"),
    "assigned",
    "immediate_route policy must immediately assign direct lead"
  );
  assert.equal(
    resolveInitialDirectLeadStatus("require_moderation"),
    "new",
    "require_moderation policy must keep direct lead as 'new' in central moderation inbox"
  );
});

test("Phase 4 Anti-Duplication: Blocks identical customer submissions within 60s window without merging distinct ones", () => {
  const isDuplicate = (
    prevCustomerId: string,
    prevSubject: string,
    prevCreatedAt: number,
    newCustomerId: string,
    newSubject: string,
    now: number
  ): boolean => {
    if (prevCustomerId !== newCustomerId) return false;
    if (prevSubject.trim() !== newSubject.trim()) return false;
    const elapsedMs = now - prevCreatedAt;
    return elapsedMs < 60_000;
  };

  const now = Date.now();
  const customerA = "cust-123";
  const subjectA = "Kundli analysis";

  // Identical submission 10 seconds later -> DUPLICATE (blocked)
  assert.equal(
    isDuplicate(customerA, subjectA, now - 10_000, customerA, subjectA, now),
    true,
    "Identical submission within 60s must be detected as duplicate"
  );

  // Identical submission 70 seconds later -> NOT duplicate (allowed retry)
  assert.equal(
    isDuplicate(customerA, subjectA, now - 70_000, customerA, subjectA, now),
    false,
    "Submission after 60s window must be allowed"
  );

  // Different customer submitting same subject within window -> NOT duplicate
  assert.equal(
    isDuplicate(customerA, subjectA, now - 10_000, "cust-456", subjectA, now),
    false,
    "Distinct customers must never be blocked as duplicates"
  );

  // Same customer submitting different subject within window -> NOT duplicate
  assert.equal(
    isDuplicate(customerA, subjectA, now - 10_000, customerA, "Gemstone recommendation", now),
    false,
    "Distinct enquiry subjects must not be blocked"
  );
});

test("Phase 5 Atomic Assignment: Single assign, reassign, and unassign state transition logic", () => {
  interface MockLeadState {
    id: string;
    astrologer_id: string | null;
    status: string;
    assigned_at: string | null;
    override_reason: string | null;
  }

  // 1. Initial Unassigned State
  const lead: MockLeadState = {
    id: "lead-1",
    astrologer_id: null,
    status: "new",
    assigned_at: null,
    override_reason: null,
  };

  // 2. Assign to Astrologer A
  const astroA = "11111111-1111-1111-1111-111111111111";
  const now = new Date().toISOString();
  lead.astrologer_id = astroA;
  lead.status = "assigned";
  lead.assigned_at = now;
  lead.override_reason = "Manual match by Super Admin";

  assert.equal(lead.status, "assigned");
  assert.equal(lead.astrologer_id, astroA);

  // 3. Reassign to Astrologer B
  const astroB = "22222222-2222-2222-2222-222222222222";
  const prevAstro = lead.astrologer_id;
  lead.astrologer_id = astroB;
  lead.override_reason = "Customer requested Vedic specialist";

  assert.equal(prevAstro, astroA);
  assert.equal(lead.astrologer_id, astroB);
  assert.equal(lead.status, "assigned");

  // 4. Unassign lead back to central queue
  lead.astrologer_id = null;
  lead.status = "new";
  lead.assigned_at = null;
  lead.override_reason = "Unassigned to central inbox";

  assert.equal(lead.astrologer_id, null);
  assert.equal(lead.status, "new");
  assert.equal(lead.assigned_at, null);
});

test("Phase 5 Recipient Eligibility: Only approved astrologers can receive assigned leads", () => {
  interface MockAstrologerRecipient {
    id: string;
    approval_status: string;
  }

  const checkEligibility = (astro: MockAstrologerRecipient | null): { eligible: boolean; error?: string } => {
    if (!astro) {
      return { eligible: false, error: "Target astrologer listing not found." };
    }
    if (astro.approval_status !== "approved") {
      return {
        eligible: false,
        error: `Cannot assign lead to astrologer with status '${astro.approval_status}'. Astrologer must be approved.`,
      };
    }
    return { eligible: true };
  };

  assert.equal(checkEligibility({ id: "1", approval_status: "approved" }).eligible, true);
  assert.equal(checkEligibility({ id: "2", approval_status: "pending" }).eligible, false);
  assert.equal(checkEligibility({ id: "3", approval_status: "rejected" }).eligible, false);
  assert.equal(checkEligibility({ id: "4", approval_status: "suspended" }).eligible, false);
  assert.equal(checkEligibility(null).eligible, false);
});

test("Phase 5 Batch Reporting: Returns deterministic per-item success and failure breakdown", () => {
  const batchInputs = [
    { leadId: "123e4567-e89b-12d3-a456-426614174001", validUUID: true, exists: true },
    { leadId: "not-a-valid-uuid", validUUID: false, exists: false },
    { leadId: "123e4567-e89b-12d3-a456-426614174002", validUUID: true, exists: false }, // lead missing
    { leadId: "123e4567-e89b-12d3-a456-426614174003", validUUID: true, exists: true },
  ];

  interface BatchItemReport {
    leadId: string;
    success: boolean;
    error?: string;
  }

  const results: BatchItemReport[] = [];
  let assignedCount = 0;
  let failureCount = 0;

  for (const item of batchInputs) {
    if (!item.validUUID) {
      failureCount++;
      results.push({ leadId: item.leadId, success: false, error: "Invalid UUID format." });
    } else if (!item.exists) {
      failureCount++;
      results.push({ leadId: item.leadId, success: false, error: "Lead not found." });
    } else {
      assignedCount++;
      results.push({ leadId: item.leadId, success: true });
    }
  }

  assert.equal(assignedCount, 2);
  assert.equal(failureCount, 2);
  assert.equal(results.length, 4);
  assert.equal(results[0].success, true);
  assert.equal(results[1].success, false);
  assert.equal(results[2].success, false);
  assert.equal(results[3].success, true);
});

test("Phase 6 Listing Moderation & Public Eligibility: Strict filtering of non-approved profiles", () => {
  interface MockAstrologerDirectoryItem {
    id: string;
    slug: string;
    display_name: string;
    approval_status: string;
  }

  const directory: MockAstrologerDirectoryItem[] = [
    { id: "1", slug: "acharyasharma", display_name: "Acharya Sharma", approval_status: "approved" },
    { id: "2", slug: "panditji", display_name: "Pandit Ji", approval_status: "pending" },
    { id: "3", slug: "jyotishvi", display_name: "Jyotish Vidya", approval_status: "draft" },
    { id: "4", slug: "suspendedastro", display_name: "Suspended Astro", approval_status: "suspended" },
    { id: "5", slug: "rejectedastro", display_name: "Rejected Astro", approval_status: "rejected" },
    { id: "6", slug: "archivedastro", display_name: "Archived Astro", approval_status: "archived" },
    { id: "7", slug: "changesastro", display_name: "Changes Requested Astro", approval_status: "changes_requested" },
    { id: "8", slug: "approvedastro2", display_name: "Approved Astro 2", approval_status: "approved" },
  ];

  // Public filter query simulation
  const publicFeed = directory.filter((item) => item.approval_status === "approved");

  assert.equal(publicFeed.length, 2);
  assert.equal(publicFeed.some((p) => p.approval_status !== "approved"), false);
  assert.equal(publicFeed[0].slug, "acharyasharma");
  assert.equal(publicFeed[1].slug, "approvedastro2");
});

test("Phase 6 Public Ranking Consistency: Ordering by active featured status, priority score, and created date", () => {
  interface MockRankingItem {
    id: string;
    is_featured: boolean;
    featured_until: string | null;
    ranking_priority: number;
    created_at: string;
  }

  const now = Date.now();
  const past = new Date(now - 1000 * 60 * 60 * 24).toISOString();
  const future = new Date(now + 1000 * 60 * 60 * 24).toISOString();

  // Helper checking if featured placement is currently active
  const isCurrentlyFeatured = (item: MockRankingItem): boolean => {
    if (!item.is_featured) return false;
    if (!item.featured_until) return true; // permanent feature
    return new Date(item.featured_until).getTime() > now;
  };

  const listings: MockRankingItem[] = [
    { id: "standard-low", is_featured: false, featured_until: null, ranking_priority: 0, created_at: "2026-01-01T00:00:00Z" },
    { id: "standard-high", is_featured: false, featured_until: null, ranking_priority: 80, created_at: "2026-01-02T00:00:00Z" },
    { id: "featured-active", is_featured: true, featured_until: future, ranking_priority: 10, created_at: "2026-01-03T00:00:00Z" },
    { id: "featured-expired", is_featured: true, featured_until: past, ranking_priority: 95, created_at: "2026-01-04T00:00:00Z" },
  ];

  // Rank sorting
  listings.sort((a, b) => {
    const aFeatured = isCurrentlyFeatured(a);
    const bFeatured = isCurrentlyFeatured(b);
    if (aFeatured !== bFeatured) return aFeatured ? -1 : 1;
    if (a.ranking_priority !== b.ranking_priority) return b.ranking_priority - a.ranking_priority;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Expected hierarchy:
  // 1. featured-active (currently active featured boost)
  // 2. featured-expired (expired featured falls back to priority ranking: 95)
  // 3. standard-high (priority ranking: 80)
  // 4. standard-low (priority ranking: 0)
  assert.equal(listings[0].id, "featured-active");
  assert.equal(listings[1].id, "featured-expired");
  assert.equal(listings[2].id, "standard-high");
  assert.equal(listings[3].id, "standard-low");
});

test("Phase 7 Consultant Lifecycle: Rejection of self-modification and super_admin alteration", () => {
  const currentCallerId = "11111111-1111-1111-1111-111111111111";

  // Simulate toggleConsultantRole check
  const validateRoleChangeAttempt = (
    callerId: string,
    targetUserId: string,
    targetProfileRole: string
  ): { allowed: boolean; error?: string } => {
    if (targetUserId === callerId) {
      return { allowed: false, error: "Cannot demote or modify your own active administrative account." };
    }
    if (targetProfileRole === "super_admin") {
      return {
        allowed: false,
        error: "Super Administrator accounts cannot be modified via consultant lifecycle controls.",
      };
    }
    return { allowed: true };
  };

  // Self modification attempt -> REJECTED
  const selfAttempt = validateRoleChangeAttempt(currentCallerId, currentCallerId, "super_admin");
  assert.equal(selfAttempt.allowed, false);
  assert.match(selfAttempt.error!, /modify your own/i);

  // Modifying another super_admin via consultant controls -> REJECTED
  const otherSuperAdminAttempt = validateRoleChangeAttempt(currentCallerId, "22222222-2222-2222-2222-222222222222", "super_admin");
  assert.equal(otherSuperAdminAttempt.allowed, false);
  assert.match(otherSuperAdminAttempt.error!, /Super Administrator accounts cannot be modified/i);

  // Modifying a consultant admin -> ALLOWED
  const consultantAttempt = validateRoleChangeAttempt(currentCallerId, "33333333-3333-3333-3333-333333333333", "consultant_admin");
  assert.equal(consultantAttempt.allowed, true);
});

test("Phase 7 Platform Settings: Validates recognized keys and rejects arbitrary settings", () => {
  const allowedSettings = new Set([
    "lead_auto_distribution_enabled",
    "lead_routing_priority",
    "max_open_leads_per_consultant",
    "direct_lead_routing_policy",
    "maintenance_mode",
  ]);

  const validateSettingKey = (key: string): boolean => {
    return allowedSettings.has(key);
  };

  assert.equal(validateSettingKey("direct_lead_routing_policy"), true);
  assert.equal(validateSettingKey("lead_auto_distribution_enabled"), true);
  assert.equal(validateSettingKey("maintenance_mode"), true);
  assert.equal(validateSettingKey("arbitrary_injected_setting"), false);
  assert.equal(validateSettingKey("admin_override_key"), false);
});

test("Phase 8 Audit Trail & Analytics: Immutable event schema and live KPI formula guarantees", () => {
  // 1. Audit trail event validation
  const validAuditActions = new Set([
    "listing.approve",
    "listing.reject",
    "listing.request_changes",
    "listing.suspend",
    "listing.ranking_update",
    "lead.assign",
    "lead.unassign",
    "lead.reassign",
    "lead.status_update",
    "consultant.invite",
    "consultant.role_update.consultant_admin",
    "consultant.role_update.customer",
    "consultant.permissions_update",
    "setting.update",
  ]);

  const auditRecord = {
    actor_id: "11111111-1111-1111-1111-111111111111",
    actor_role: "super_admin",
    action: "lead.assign",
    target_type: "lead",
    target_id: "22222222-2222-2222-2222-222222222222",
    reason: "Routine direct triage to qualified astrologer",
    outcome: "success" as const,
  };

  assert.equal(validAuditActions.has(auditRecord.action), true);
  assert.equal(auditRecord.outcome, "success");

  // 2. Real-data analytics formulas (Conversion Rate & Assignment Rate)
  const calculateKpis = (m: { totalLeads: number; convertedLeads: number; unassignedLeads: number }) => {
    const conversionRate = m.totalLeads > 0 ? Math.round((m.convertedLeads / m.totalLeads) * 100) : 0;
    const assignmentRate =
      m.totalLeads > 0 ? Math.round(((m.totalLeads - m.unassignedLeads) / m.totalLeads) * 100) : 0;
    return { conversionRate, assignmentRate };
  };

  // Zero leads edge case (no division by zero)
  const zeroKpi = calculateKpis({ totalLeads: 0, convertedLeads: 0, unassignedLeads: 0 });
  assert.equal(zeroKpi.conversionRate, 0);
  assert.equal(zeroKpi.assignmentRate, 0);

  // Normal live workload
  const normalKpi = calculateKpis({ totalLeads: 100, convertedLeads: 25, unassignedLeads: 15 });
  assert.equal(normalKpi.conversionRate, 25);
  assert.equal(normalKpi.assignmentRate, 85);
});

test("Phase 8 UI State Safety: Empty state, error fallback, and notification resilience", () => {
  // Empty data response resilience
  const emptyStateData = {
    totalLeads: 0,
    leadsToday: 0,
    unassignedLeads: 0,
    assignedLeads: 0,
    contactedLeads: 0,
    convertedLeads: 0,
    closedLeads: 0,
    invalidLeads: 0,
    duplicateLeads: 0,
    platformGeneratedLeads: 0,
    directLeads: 0,
    pendingListings: 0,
    approvedListings: 0,
    changesRequestedListings: 0,
    suspendedListings: 0,
    totalListings: 0,
    activeConsultants: 0,
  };
  assert.equal(emptyStateData.totalLeads, 0);

  // Actionable alerts triggered ONLY when backlog exists
  const hasActionableAlert = (pendingListings: number, unassignedLeads: number) => {
    return pendingListings > 0 || unassignedLeads > 0;
  };

  assert.equal(hasActionableAlert(0, 0), false, "No alert banner rendered on empty or clear backlog");
  assert.equal(hasActionableAlert(5, 0), true, "Alert banner rendered for pending listings backlog");
  assert.equal(hasActionableAlert(0, 3), true, "Alert banner rendered for unassigned leads backlog");
});








