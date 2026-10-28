// =====================================================
// ASTROLOGER LEAD MANAGEMENT TYPES (Phase 4)
// =====================================================

import type { AssignmentStatus, LeadStatus } from "@/lib/types/database.types";
import type { AuthResult } from "@/lib/types/auth.types";

export type { AssignmentStatus, LeadStatus };

/**
 * Public customer details authorized for assigned astrologers.
 * Omits private identity credentials.
 */
export interface LeadCustomerInfo {
  id: string;
  full_name: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  time_of_birth?: string | null;
  birthplace?: string | null;
  gender?: "male" | "female" | "other" | "prefer_not_to_say" | null;
  avatar_url?: string | null;
}

/**
 * Core lead enquiry details.
 */
export interface LeadDetails {
  id: string;
  subject: string;
  message: string;
  status: LeadStatus;
  created_at: string;
  customer: LeadCustomerInfo | null;
}

/**
 * An assigned lead item as presented to an authenticated astrologer.
 * Represents the astrologer's isolated assignment record joined with the lead.
 */
export interface AstrologerLeadItem {
  id: string; // lead_assignments.id
  lead_id: string;
  astrologer_id: string;
  status: AssignmentStatus; // lead_assignments.status ('assigned' | 'contacted' | 'closed')
  created_at: string; // assignment timestamp
  lead: LeadDetails;
}

/**
 * Filter options for querying astrologer's assigned leads.
 */
export interface AstrologerLeadsFilterOptions {
  status?: AssignmentStatus | "all";
  limit?: number;
  offset?: number;
}

/**
 * Payload for updating an assignment's status.
 * All other columns are immutable.
 */
export interface UpdateAssignmentStatusInput {
  assignment_id: string;
  status: AssignmentStatus;
}

// Action Results
export type AstrologerLeadsResult = AuthResult<{
  leads: AstrologerLeadItem[];
  totalCount?: number;
}>;

export type AstrologerLeadDetailResult = AuthResult<AstrologerLeadItem>;

export type UpdateAssignmentStatusResult = AuthResult<{
  assignment_id: string;
  status: AssignmentStatus;
}>;
