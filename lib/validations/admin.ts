// =====================================================
// ADMIN RUNTIME INPUT VALIDATIONS
// =====================================================

import type {
  AdminPermissionKey,
  ApprovalStatus,
  LeadPriority,
  LeadQualificationStatus,
  LeadStatus,
} from "@/lib/types/database.types";
import { isValidUUID } from "@/lib/validations/lead";

export interface ValidationSuccess<T> {
  valid: true;
  data: T;
  error?: never;
}

export interface ValidationFailure {
  valid: false;
  error: string;
  data?: never;
}

export type AdminValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export const VALID_APPROVAL_STATUSES: ReadonlySet<ApprovalStatus> = new Set([
  "draft",
  "pending",
  "changes_requested",
  "approved",
  "rejected",
  "suspended",
  "archived",
]);

export const VALID_LEAD_STATUSES: ReadonlySet<LeadStatus> = new Set([
  "new",
  "assigned",
  "contacted",
  "qualified",
  "converted",
  "closed",
  "invalid",
  "duplicate",
]);

export const VALID_LEAD_PRIORITIES: ReadonlySet<LeadPriority> = new Set([
  "low",
  "medium",
  "high",
  "urgent",
]);

export const VALID_QUALIFICATION_STATUSES: ReadonlySet<LeadQualificationStatus> = new Set([
  "unqualified",
  "qualified",
  "duplicate",
  "invalid",
]);

export const VALID_ADMIN_PERMISSIONS: ReadonlySet<AdminPermissionKey> = new Set([
  "listing.read",
  "listing.review",
  "listing.approve",
  "listing.suspend",
  "listing.rank.update",
  "lead.read.all",
  "lead.read.assigned",
  "lead.assign",
  "lead.reassign",
  "consultant.invite",
  "permission.manage",
  "analytics.read",
  "audit.read",
]);

/**
 * Validates listing review & moderation status transitions.
 */
export function validateListingModerationInput(raw: unknown): AdminValidationResult<{
  listingId: string;
  status: ApprovalStatus;
  reviewNotes?: string;
  reason?: string;
}> {
  if (typeof raw !== "object" || raw === null) {
    return { valid: false, error: "Invalid payload: object expected." };
  }

  const payload = raw as Record<string, unknown>;

  if (!isValidUUID(payload.listingId)) {
    return { valid: false, error: "A valid listing UUID is required." };
  }

  if (
    typeof payload.status !== "string" ||
    !VALID_APPROVAL_STATUSES.has(payload.status as ApprovalStatus)
  ) {
    return { valid: false, error: "Invalid listing approval status." };
  }

  const status = payload.status as ApprovalStatus;

  // Rejection, suspension, or changes_requested require notes/reasons
  if (["rejected", "suspended", "changes_requested"].includes(status)) {
    const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
    const notes = typeof payload.reviewNotes === "string" ? payload.reviewNotes.trim() : "";

    if (!reason && !notes) {
      return {
        valid: false,
        error: `A mandatory reason or review note is required when setting status to '${status}'.`,
      };
    }
  }

  return {
    valid: true,
    data: {
      listingId: (payload.listingId as string).trim(),
      status,
      reviewNotes: typeof payload.reviewNotes === "string" ? payload.reviewNotes.trim() : undefined,
      reason: typeof payload.reason === "string" ? payload.reason.trim() : undefined,
    },
  };
}

/**
 * Validates listing ranking and featured placement input.
 */
export function validateListingRankingInput(raw: unknown): AdminValidationResult<{
  listingId: string;
  rankingPriority: number;
  isFeatured: boolean;
  featuredUntil?: string | null;
  reason?: string;
}> {
  if (typeof raw !== "object" || raw === null) {
    return { valid: false, error: "Invalid payload: object expected." };
  }

  const payload = raw as Record<string, unknown>;

  if (!isValidUUID(payload.listingId)) {
    return { valid: false, error: "A valid listing UUID is required." };
  }

  const priorityNum = Number(payload.rankingPriority);
  if (!Number.isInteger(priorityNum) || priorityNum < -100 || priorityNum > 1000) {
    return { valid: false, error: "Ranking priority must be an integer between -100 and 1000." };
  }

  const isFeatured = Boolean(payload.isFeatured);
  let featuredUntil: string | null = null;

  if (payload.featuredUntil !== undefined && payload.featuredUntil !== null) {
    if (typeof payload.featuredUntil !== "string" || isNaN(Date.parse(payload.featuredUntil))) {
      return { valid: false, error: "Invalid featuredUntil timestamp." };
    }
    featuredUntil = new Date(payload.featuredUntil).toISOString();
  }

  return {
    valid: true,
    data: {
      listingId: (payload.listingId as string).trim(),
      rankingPriority: priorityNum,
      isFeatured,
      featuredUntil,
      reason: typeof payload.reason === "string" ? payload.reason.trim() : undefined,
    },
  };
}

/**
 * Validates lead assignment input.
 */
export function validateLeadAssignmentInput(raw: unknown): AdminValidationResult<{
  leadId: string;
  astrologerId: string | null;
  reason?: string;
}> {
  if (typeof raw !== "object" || raw === null) {
    return { valid: false, error: "Invalid payload: object expected." };
  }

  const payload = raw as Record<string, unknown>;

  if (!isValidUUID(payload.leadId)) {
    return { valid: false, error: "A valid lead UUID is required." };
  }

  if (payload.astrologerId !== null && !isValidUUID(payload.astrologerId)) {
    return { valid: false, error: "astrologerId must be a valid UUID or null (for unassign)." };
  }

  return {
    valid: true,
    data: {
      leadId: (payload.leadId as string).trim(),
      astrologerId: payload.astrologerId ? (payload.astrologerId as string).trim() : null,
      reason: typeof payload.reason === "string" ? payload.reason.trim() : undefined,
    },
  };
}

/**
 * Set of permissions strictly reserved for Super Admin that can never be granted to Consultant Admin.
 */
export const SUPER_ADMIN_ONLY_PERMISSION_KEYS: ReadonlySet<AdminPermissionKey> = new Set([
  "listing.approve",
  "listing.suspend",
  "listing.rank.update",
  "lead.read.all",
  "lead.assign",
  "consultant.invite",
  "permission.manage",
  "audit.read",
]);

/**
 * Validates consultant permission modification.
 * Strictly rejects owner-only / superAdminOnly permission keys.
 */
export function validateConsultantPermissionsInput(raw: unknown): AdminValidationResult<{
  userId: string;
  permissions: AdminPermissionKey[];
}> {
  if (typeof raw !== "object" || raw === null) {
    return { valid: false, error: "Invalid payload: object expected." };
  }

  const payload = raw as Record<string, unknown>;

  if (!isValidUUID(payload.userId)) {
    return { valid: false, error: "A valid user UUID is required." };
  }

  if (!Array.isArray(payload.permissions)) {
    return { valid: false, error: "Permissions must be an array of keys." };
  }

  const sanitized: AdminPermissionKey[] = [];
  for (const perm of payload.permissions) {
    if (typeof perm !== "string" || !VALID_ADMIN_PERMISSIONS.has(perm as AdminPermissionKey)) {
      return { valid: false, error: `Invalid permission key: ${String(perm)}` };
    }

    if (SUPER_ADMIN_ONLY_PERMISSION_KEYS.has(perm as AdminPermissionKey)) {
      return {
        valid: false,
        error: `Permission '${perm}' is reserved exclusively for Owner Super Admin and cannot be assigned to a Consultant Admin.`,
      };
    }

    sanitized.push(perm as AdminPermissionKey);
  }

  return {
    valid: true,
    data: {
      userId: (payload.userId as string).trim(),
      permissions: Array.from(new Set(sanitized)),
    },
  };
}

/**
 * Validates platform setting values per known key schema.
 */
export function validatePlatformSettingValue(
  key: string,
  value: unknown
): AdminValidationResult<{ key: string; value: unknown }> {
  switch (key) {
    case "lead_auto_distribution_enabled":
    case "maintenance_mode":
    case "payment_testing_mode_enabled": {
      if (typeof value !== "boolean") {
        return { valid: false, error: `Setting '${key}' must be a boolean (true or false).` };
      }
      return { valid: true, data: { key, value } };
    }

    case "payment_upi_vpa": {
      if (typeof value !== "string" || !value.trim() || !value.includes("@")) {
        return {
          valid: false,
          error: "Setting 'payment_upi_vpa' must be a valid UPI ID (e.g., yourname@okhdfcbank or business@upi).",
        };
      }
      return { valid: true, data: { key, value: value.trim() } };
    }

    case "payment_merchant_name": {
      if (typeof value !== "string" || !value.trim() || value.length > 50) {
        return {
          valid: false,
          error: "Setting 'payment_merchant_name' must be a string up to 50 characters.",
        };
      }
      return { valid: true, data: { key, value: value.trim() } };
    }

    case "payment_merchant_code": {
      if (typeof value !== "string") {
        return {
          valid: false,
          error: "Setting 'payment_merchant_code' must be a string (use '8299' for merchant or '0000' for personal).",
        };
      }
      return { valid: true, data: { key, value: value.trim() } };
    }

    case "max_open_leads_per_consultant": {
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 500) {
        return {
          valid: false,
          error: "Setting 'max_open_leads_per_consultant' must be an integer between 1 and 500.",
        };
      }
      return { valid: true, data: { key, value } };
    }

    case "direct_lead_routing_policy": {
      const allowed = new Set(["immediate_route", "require_moderation"]);
      if (typeof value !== "string" || !allowed.has(value)) {
        return {
          valid: false,
          error: "Setting 'direct_lead_routing_policy' must be either 'immediate_route' or 'require_moderation'.",
        };
      }
      return { valid: true, data: { key, value } };
    }

    case "lead_routing_priority": {
      const allowed = new Set(["round_robin", "capacity", "specialization", "balanced"]);
      if (typeof value !== "string" || !allowed.has(value)) {
        return {
          valid: false,
          error: "Setting 'lead_routing_priority' must be one of: 'round_robin', 'capacity', 'specialization', 'balanced'.",
        };
      }
      return { valid: true, data: { key, value } };
    }

    default:
      return { valid: false, error: `Unrecognized platform setting key: '${key}'.` };
  }
}

