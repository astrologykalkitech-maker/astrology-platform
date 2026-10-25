// =====================================================
// DATABASE TYPES (Matching Supabase Schema 001 - 005)
// =====================================================

export type UserRole =
  | "customer"
  | "astrologer"
  | "consultant_admin"
  | "super_admin"
  | "admin"; // legacy alias for super_admin

export type SignUpRole = "customer" | "astrologer";

export type ApprovalStatus =
  | "draft"
  | "pending"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "suspended"
  | "archived";

export type LeadStatus =
  | "new"
  | "assigned"
  | "contacted"
  | "qualified"
  | "converted"
  | "closed"
  | "invalid"
  | "duplicate";

export type AssignmentStatus = "assigned" | "contacted" | "closed";

export type LeadPriority = "low" | "medium" | "high" | "urgent";

export type LeadSourceType =
  | "platform"
  | "direct"
  | "campaign"
  | "referral"
  | "organic";

export type LeadQualificationStatus =
  | "unqualified"
  | "qualified"
  | "duplicate"
  | "invalid";

export type AdminPermissionKey =
  | "listing.read"
  | "listing.review"
  | "listing.approve"
  | "listing.suspend"
  | "listing.rank.update"
  | "lead.read.all"
  | "lead.read.assigned"
  | "lead.assign"
  | "lead.reassign"
  | "consultant.invite"
  | "permission.manage"
  | "analytics.read"
  | "audit.read";

export interface Profile {
  id: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface AstrologerProfile {
  id: string;
  user_id: string;
  slug: string | null;
  display_name: string;
  bio: string | null;
  experience_years: number | null;
  specializations: string[];
  languages: string[];
  city: string | null;
  state: string | null;
  address: string | null;
  consultation_fee: number | null;
  profile_photo_url: string | null;
  approval_status: ApprovalStatus;
  ranking_priority?: number;
  is_featured?: boolean;
  featured_until?: string | null;
  review_notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  customer_id: string;
  astrologer_id: string | null;
  subject: string;
  message: string;
  status: LeadStatus;
  source_type?: LeadSourceType;
  source_url?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  priority?: LeadPriority;
  qualification_status?: LeadQualificationStatus;
  contact_email?: string | null;
  contact_phone?: string | null;
  customer_name?: string | null;
  assigned_to?: string | null;
  assigned_at?: string | null;
  first_contacted_at?: string | null;
  closed_at?: string | null;
  override_reason?: string | null;
  created_at: string;
}

export interface LeadAssignment {
  id: string;
  lead_id: string;
  astrologer_id: string;
  status: AssignmentStatus;
  created_at: string;
}

export interface AdminPermission {
  id: string;
  user_id: string;
  permission_key: AdminPermissionKey;
  scope: Record<string, unknown>;
  granted_by: string | null;
  created_at: string;
}

export interface LeadAssignmentHistory {
  id: string;
  lead_id: string;
  previous_astrologer_id: string | null;
  new_astrologer_id: string | null;
  assigned_by: string | null;
  action: "assign" | "reassign" | "unassign" | "auto_route";
  reason: string | null;
  created_at: string;
}

export interface LeadInternalNote {
  id: string;
  lead_id: string;
  author_id: string;
  author_name?: string | null;
  note: string;
  outcome: string | null;
  created_at: string;
}

export interface AdminAuditLog {
  id: string;
  actor_id: string | null;
  actor_role: string;
  actor_name?: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  reason: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  ip_address: string | null;
  outcome: "success" | "failure" | "denied";
  created_at: string;
}

export interface PlatformSetting {
  key: string;
  value: unknown;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
}

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";

export type ConsultationMode = "Chat" | "Call" | "Video";

export interface CustomerBooking {
  id: string;
  customer_id: string;
  astrologer_id: string;
  astrologer_name?: string;
  service_type: string;
  consultation_mode: ConsultationMode;
  scheduled_at: string;
  duration_minutes: number;
  status: BookingStatus;
  price: number;
  notes: string | null;
  cancellation_reason?: string | null;
  cancelled_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerNotification {
  id: string;
  customer_id: string;
  title: string;
  message: string;
  link_url: string | null;
  event_type: string;
  is_read: boolean;
  read_at: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface ConsultationMessage {
  id: string;
  lead_id: string;
  sender_id: string;
  sender_name?: string;
  sender_role: "customer" | "astrologer" | "admin";
  message: string;
  prediction_title?: string | null;
  is_official_prediction: boolean;
  attachments?: unknown[];
  created_at: string;
}
