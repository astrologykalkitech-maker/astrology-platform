// =====================================================
// ADMIN PERMISSION MATRIX & HELPERS (Client & Server Safe)
// =====================================================

import type { AdminPermissionKey, UserRole } from "@/lib/types/database.types";

export interface PermissionDefinition {
  key: AdminPermissionKey;
  label: string;
  description: string;
  category: "listings" | "leads" | "consultants" | "system";
  superAdminOnly?: boolean;
}

export const ADMIN_PERMISSIONS: PermissionDefinition[] = [
  // Listing permissions
  {
    key: "listing.read",
    label: "View Listings",
    description: "View all platform astrologer listings and pending applications",
    category: "listings",
  },
  {
    key: "listing.review",
    label: "Review Listings",
    description: "Review listing details and request applicant corrections",
    category: "listings",
  },
  {
    key: "listing.approve",
    label: "Approve/Reject Listings",
    description: "Approve, reject, or suspend astrologer listings",
    category: "listings",
    superAdminOnly: true,
  },
  {
    key: "listing.rank.update",
    label: "Update Ranking & Placement",
    description: "Modify ranking priorities and featured placements",
    category: "listings",
    superAdminOnly: true,
  },

  // Lead permissions
  {
    key: "lead.read.all",
    label: "View All Central Leads",
    description: "Access the entire platform central lead inbox",
    category: "leads",
    superAdminOnly: true,
  },
  {
    key: "lead.read.assigned",
    label: "View Assigned Leads",
    description: "Access leads explicitly assigned to this consultant account",
    category: "leads",
  },
  {
    key: "lead.assign",
    label: "Assign & Reassign Leads",
    description: "Assign platform leads to astrologers and consultants",
    category: "leads",
    superAdminOnly: true,
  },
  {
    key: "lead.reassign",
    label: "Request Lead Reassignment",
    description: "Request reassignment or escalation of assigned leads",
    category: "leads",
  },

  // Consultant & System permissions
  {
    key: "consultant.invite",
    label: "Manage Consultants",
    description: "Invite, configure, or disable consultant admin accounts",
    category: "consultants",
    superAdminOnly: true,
  },
  {
    key: "permission.manage",
    label: "Manage Permissions",
    description: "Grant and revoke operational permissions for consultant admins",
    category: "consultants",
    superAdminOnly: true,
  },
  {
    key: "analytics.read",
    label: "View Platform Analytics",
    description: "View aggregate performance, conversion, and response metrics",
    category: "system",
  },
  {
    key: "audit.read",
    label: "View Audit Logs",
    description: "Inspect immutable administrative security and action audit logs",
    category: "system",
    superAdminOnly: true,
  },
];

/**
 * Map of permission keys to their superAdminOnly status for fast lookup.
 */
const SUPER_ADMIN_ONLY_PERMISSIONS: ReadonlySet<AdminPermissionKey> = new Set(
  ADMIN_PERMISSIONS.filter((p) => p.superAdminOnly).map((p) => p.key)
);

/**
 * Checks whether a given role and permission list fulfills the required permission.
 * - Super Admins inherently have access to every permission key.
 * - Legacy 'admin' is intentionally NOT treated as Super Admin (requires explicit migration/role).
 * - Consultant Admins can only hold permissions where superAdminOnly is false.
 */
export function checkPermission(
  role: UserRole,
  userPermissions: AdminPermissionKey[],
  requiredPermission: AdminPermissionKey
): boolean {
  if (role === "super_admin") {
    return true;
  }

  if (role === "consultant_admin") {
    // Defense-in-depth: Even if accidentally inserted in admin_permissions table,
    // owner-only permissions MUST NEVER be evaluated as true for consultant_admin.
    if (SUPER_ADMIN_ONLY_PERMISSIONS.has(requiredPermission)) {
      return false;
    }
    return userPermissions.includes(requiredPermission);
  }

  return false;
}
