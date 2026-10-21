// =====================================================
// ASTROLOGER LEAD RUNTIME VALIDATION (Phase 4)
// =====================================================

import type {
  AssignmentStatus,
  UpdateAssignmentStatusInput,
  AstrologerLeadsFilterOptions,
} from "@/lib/types/lead.types";
import type { ValidationResult } from "@/lib/validations/auth";

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const VALID_ASSIGNMENT_STATUSES: ReadonlySet<AssignmentStatus> = new Set([
  "assigned",
  "contacted",
  "closed",
]);

const ALLOWED_UPDATE_KEYS: ReadonlySet<string> = new Set([
  "assignment_id",
  "status",
]);

const PROTECTED_KEYS: ReadonlySet<string> = new Set([
  "id",
  "lead_id",
  "astrologer_id",
  "created_at",
  "updated_at",
]);

/**
 * Validates whether a value is a valid UUID string.
 */
export function isValidUUID(val: unknown): val is string {
  return typeof val === "string" && UUID_REGEX.test(val.trim());
}

/**
 * Enforces the strict status state machine for lead assignments:
 * - 'assigned'  -> 'contacted'
 * - 'assigned'  -> 'closed'
 * - 'contacted' -> 'closed'
 * - 'closed' is terminal.
 * - No-op transitions (current === target) are rejected.
 */
export function validateStatusTransition(
  currentStatus: AssignmentStatus,
  targetStatus: AssignmentStatus
): { valid: boolean; error?: string } {
  // Reject no-op transitions
  if (currentStatus === targetStatus) {
    return {
      valid: false,
      error: "Assignment status must change to a valid next state.",
    };
  }

  // Terminal state check
  if (currentStatus === "closed") {
    return {
      valid: false,
      error: "Closed lead assignments are terminal and cannot be modified.",
    };
  }

  // Allowed transitions from 'assigned'
  if (currentStatus === "assigned") {
    if (targetStatus === "contacted" || targetStatus === "closed") {
      return { valid: true };
    }
    return {
      valid: false,
      error:
        "Invalid status transition: from 'assigned', status can only move to 'contacted' or 'closed'.",
    };
  }

  // Allowed transitions from 'contacted'
  if (currentStatus === "contacted") {
    if (targetStatus === "closed") {
      return { valid: true };
    }
    return {
      valid: false,
      error:
        "Invalid status transition: from 'contacted', status can only move to 'closed'. Reverting to 'assigned' is prohibited.",
    };
  }

  return {
    valid: false,
    error: `Invalid current assignment status: '${currentStatus}'.`,
  };
}

/**
 * Runtime validation for updating an assignment's status.
 * Rejects unknown or protected keys.
 */
export function validateUpdateAssignmentStatusInput(
  raw: unknown
): ValidationResult<UpdateAssignmentStatusInput> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { valid: false, error: "Invalid payload: must be an object." };
  }

  const rawObj = raw as Record<string, unknown>;

  // Check for forbidden / protected keys
  for (const key of Object.keys(rawObj)) {
    if (PROTECTED_KEYS.has(key)) {
      return {
        valid: false,
        error: `Field '${key}' is protected and cannot be modified.`,
      };
    }
    if (!ALLOWED_UPDATE_KEYS.has(key)) {
      return {
        valid: false,
        error: `Unknown field '${key}' is not permitted.`,
      };
    }
  }

  // Validate assignment_id
  if (!isValidUUID(rawObj.assignment_id)) {
    return {
      valid: false,
      error: "Invalid assignment_id: must be a valid UUID.",
    };
  }

  // Validate status
  if (
    typeof rawObj.status !== "string" ||
    !VALID_ASSIGNMENT_STATUSES.has(rawObj.status as AssignmentStatus)
  ) {
    return {
      valid: false,
      error: "Invalid status: must be one of 'assigned', 'contacted', or 'closed'.",
    };
  }

  return {
    valid: true,
    data: {
      assignment_id: rawObj.assignment_id.trim().toLowerCase(),
      status: rawObj.status as AssignmentStatus,
    },
  };
}

/**
 * Runtime validation and sanitization for astrologer leads filter options.
 */
export function validateAstrologerLeadsFilterOptions(raw: unknown): {
  valid: boolean;
  data: AstrologerLeadsFilterOptions;
  error?: string;
} {
  const defaultOptions: AstrologerLeadsFilterOptions = {
    status: "all",
    limit: 20,
    offset: 0,
  };

  if (raw === undefined || raw === null) {
    return { valid: true, data: defaultOptions };
  }

  if (typeof raw !== "object" || Array.isArray(raw)) {
    return {
      valid: false,
      data: defaultOptions,
      error: "Filter options must be an object.",
    };
  }

  const rawObj = raw as Record<string, unknown>;
  const allowedKeys = new Set(["status", "limit", "offset"]);

  for (const key of Object.keys(rawObj)) {
    if (!allowedKeys.has(key)) {
      return {
        valid: false,
        data: defaultOptions,
        error: `Unknown filter field '${key}' is not permitted.`,
      };
    }
  }

  const result: AstrologerLeadsFilterOptions = { ...defaultOptions };

  // Validate status
  if ("status" in rawObj && rawObj.status !== undefined && rawObj.status !== null) {
    if (typeof rawObj.status !== "string") {
      return { valid: false, data: defaultOptions, error: "Status filter must be a string." };
    }
    const s = rawObj.status.trim().toLowerCase();
    if (s === "all" || VALID_ASSIGNMENT_STATUSES.has(s as AssignmentStatus)) {
      result.status = s as AssignmentStatus | "all";
    } else {
      return {
        valid: false,
        data: defaultOptions,
        error: "Status filter must be 'all', 'assigned', 'contacted', or 'closed'.",
      };
    }
  }

  // Validate limit (clamped 1 - 100)
  if ("limit" in rawObj && rawObj.limit !== undefined && rawObj.limit !== null) {
    const num = rawObj.limit;
    if (typeof num !== "number" || !Number.isSafeInteger(num) || num < 1) {
      return { valid: false, data: defaultOptions, error: "Limit must be a positive integer." };
    }
    result.limit = Math.min(num, 100);
  }

  // Validate offset (clamped >= 0)
  if ("offset" in rawObj && rawObj.offset !== undefined && rawObj.offset !== null) {
    const num = rawObj.offset;
    if (typeof num !== "number" || !Number.isSafeInteger(num) || num < 0) {
      return { valid: false, data: defaultOptions, error: "Offset must be a non-negative integer." };
    }
    result.offset = num;
  }

  return { valid: true, data: result };
}
