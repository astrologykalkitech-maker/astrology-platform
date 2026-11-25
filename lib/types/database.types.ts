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
  avatar_url?: string | null;
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
  upi_vpa?: string | null;
  consultation_fee: number | null;
  voice_price_per_minute?: number | null;
  chat_price_per_minute?: number | null;
  video_price_per_minute?: number | null;
  voice_enabled?: boolean;
  chat_enabled?: boolean;
  video_enabled?: boolean;
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
  customer_name?: string;
  customer_avatar_url?: string | null;
  astrologer_id: string;
  astrologer_name?: string;
  service_type: string;
  consultation_mode: ConsultationMode;
  event_address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  landmark?: string | null;
  special_instructions?: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: BookingStatus;
  price: number;
  payment_mode?: "direct_consultant" | "pay_at_drop" | "platform_gateway" | null;
  payment_status?: "pending" | "paid" | "failed" | "refunded" | null;
  direct_payment_status?: "pending" | "partial" | "paid" | "declared" | "confirmed" | "waived" | "disputed" | null;
  astrologer_upi_vpa?: string | null;
  direct_payment?: {
    id: string;
    utr: string;
    amount_paise: number;
    payment_date: string;
    status: "pending" | "verified" | "rejected" | "refunded" | "failed";
    rejection_reason?: string | null;
    submitted_at: string;
  } | null;
  notes: string | null;
  cancellation_reason?: string | null;
  cancelled_at?: string | null;
  reschedule_count?: number;
  original_scheduled_at?: string | null;
  last_rescheduled_at?: string | null;
  last_rescheduled_by?: string | null;
  reschedule_reason?: string | null;
  reschedule_history?: Array<{
    rescheduled_at: string;
    rescheduled_by: string;
    rescheduled_by_role?: string;
    previous_scheduled_at: string;
    new_scheduled_at: string;
    reason?: string;
  }>;
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

export interface CustomerFullProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  time_of_birth: string | null;
  birthplace: string | null;
  gender: "male" | "female" | "other" | "prefer_not_to_say" | null;
  avatar_url: string | null;
  emailVerified: boolean;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface ConsultationReview {
  id: string;
  lead_id: string;
  customer_id: string;
  astrologer_id: string;
  rating: number;
  review_text: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerBillingRecord {
  id: string;
  booking_id: string;
  service_type: string;
  consultation_mode: ConsultationMode;
  astrologer_name: string;
  amount: number;
  currency: string;
  payment_status: "paid" | "pending" | "complimentary" | "refunded" | "failed";
  transaction_ref: string;
  receipt_number?: string;
  payment_id?: string;
  created_at: string;
  payment_gateway?: "instamojo" | "jyotish_pay" | "direct_upi" | "complimentary" | "wallet";
  refund_status?: "requested" | "approved" | "processed" | "rejected" | null;
  refund_reason?: string | null;
  refund_rejection_reason?: string | null;
  transaction_category?: "consultation" | "wallet_recharge" | "wallet_debit" | "puja" | "refund";
  transaction_direction?: "credit" | "debit";
}

// =====================================================
// SUPPORT & AI CUSTOMER CARE TYPES
// =====================================================

export type SupportTicketCategory =
  | "account"
  | "profile"
  | "booking"
  | "consultation"
  | "leads"
  | "billing"
  | "technical"
  | "general";

export type SupportTicketStatus =
  | "new"
  | "open"
  | "waiting_for_user"
  | "waiting_for_support"
  | "escalated"
  | "resolved"
  | "closed";

export type SupportTicketPriority = "low" | "medium" | "high" | "urgent";

export interface SupportTicket {
  id: string;
  ticket_number: string;
  user_id: string;
  user_role: "customer" | "astrologer";
  user_name: string;
  user_email: string | null;
  subject: string;
  category: SupportTicketCategory;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  assigned_to: string | null;
  assigned_to_name?: string | null;
  escalation_reason: string | null;
  ai_summary: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  messages_count?: number;
  last_message?: string | null;
  last_message_at?: string | null;
  last_message_by?: "customer" | "astrologer" | "ai" | "admin" | "system" | null;
}

export interface SupportMessage {
  id: string;
  ticket_id: string;
  sender_id: string | null;
  sender_role: "customer" | "astrologer" | "ai" | "admin" | "system";
  sender_name: string;
  message: string;
  is_internal: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface SupportTicketEvent {
  id: string;
  ticket_id: string;
  actor_id: string | null;
  actor_role: string;
  action: string;
  details?: Record<string, unknown>;
  created_at: string;
}

// =====================================================
// AI SELF-LEARNING & INTERACTION LOG TYPES (Phase 1)
// =====================================================

export interface AiLearnedKnowledge {
  id: string;
  source_ticket_id: string | null;
  applicable_role: "customer" | "astrologer" | "both";
  category: SupportTicketCategory;
  question_pattern: string;
  verified_solution: string;
  keywords: string[];
  embedding?: number[] | null;
  helpful_count: number;
  unhelpful_count: number;
  confidence_score: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AiInteractionLog {
  id: string;
  user_id: string;
  user_role: "customer" | "astrologer";
  query: string;
  classified_intent: string;
  classified_category: string;
  ai_response: string;
  used_knowledge_ids: string[];
  learned_knowledge_ids: string[];
  feedback_rating: -1 | 1 | null;
  feedback_comment: string | null;
  escalated_to_ticket: boolean;
  created_at: string;
}

export interface MatchLearnedKnowledgeResult {
  id: string;
  source_ticket_id: string | null;
  applicable_role: string;
  category: SupportTicketCategory;
  question_pattern: string;
  verified_solution: string;
  keywords: string[];
  helpful_count: number;
  unhelpful_count: number;
  confidence_score: number;
  similarity: number;
  hybrid_rank: number;
}

// =====================================================
// IN-HOUSE VIDEO CONFERENCING & CONSULTATION TYPES
// =====================================================

export type MeetingStatus = "scheduled" | "waiting" | "active" | "ended" | "cancelled";
export type ParticipantRole = "host" | "customer" | "observer";
export type ParticipantStatus = "waiting_room" | "in_room" | "left" | "removed";
export type VoiceCallStatus =
  | "ringing"
  | "accepted"
  | "active"
  | "declined"
  | "cancelled"
  | "missed"
  | "ended"
  | "failed";

export interface VoiceCall {
  id: string;
  conversation_id: string;
  caller_id: string;
  callee_id: string;
  caller_role: "customer" | "astrologer";
  callee_role: "customer" | "astrologer";
  caller_name: string;
  callee_name: string;
  room_name: string;
  status: VoiceCallStatus;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number;
  ended_by: string | null;
  end_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConsultationMeeting {
  id: string;
  booking_id: string;
  room_name: string;
  host_astrologer_id: string;
  customer_id: string;
  status: MeetingStatus;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeetingParticipant {
  id: string;
  meeting_id: string;
  user_id: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  is_muted: boolean;
  is_screen_sharing: boolean;
  joined_at: string;
  left_at: string | null;
}

export interface MeetingChatMessage {
  id: string;
  meeting_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: "host" | "customer";
  message: string;
  created_at: string;
}

export interface ConsultationReminder {
  id: string;
  booking_id: string;
  recipient_id: string;
  recipient_role: "customer" | "astrologer";
  scheduled_for: string;
  status: "pending" | "sent" | "cancelled" | "failed";
  sent_at: string | null;
  error_message?: string | null;
  created_at: string;
}

export interface SavedKundliRecord {
  id: string;
  customer_id: string;
  name: string;
  gender: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  date_of_birth: string;
  time_of_birth: string;
  birth_place: string;
  latitude: number;
  longitude: number;
  timezone: number;
  calculation_config: Record<string, unknown>;
  planetary_positions: Record<string, unknown>;
  chart_data: Record<string, unknown>;
  dasha_data: Record<string, unknown>;
  generated_report: Record<string, unknown>;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerPanchangPreferenceRecord {
  customer_id: string;
  city_name: string;
  state_name?: string | null;
  country_name: string;
  latitude: number;
  longitude: number;
  timezone_id: string;
  timezone_offset: number;
  created_at: string;
  updated_at: string;
}

export interface CustomerPanchangPreferenceRecord {
  customer_id: string;
  city_name: string;
  state_name?: string | null;
  country_name: string;
  latitude: number;
  longitude: number;
  timezone_id: string;
  timezone_offset: number;
  created_at: string;
  updated_at: string;
}

export interface SavedKundliMilanRecord {
  id: string;
  customer_id: string;
  partner_a_name: string;
  partner_a_gender: string;
  partner_a_dob: string;
  partner_a_tob: string;
  partner_a_birth_place: string;
  partner_a_latitude: number;
  partner_a_longitude: number;
  partner_a_timezone: number;

  partner_b_name: string;
  partner_b_gender: string;
  partner_b_dob: string;
  partner_b_tob: string;
  partner_b_birth_place: string;
  partner_b_latitude: number;
  partner_b_longitude: number;
  partner_b_timezone: number;

  partner_a_chart: Record<string, unknown>;
  partner_b_chart: Record<string, unknown>;
  ashtakoota_scores: Record<string, unknown>;
  total_score: number;
  percentage: number;
  is_compatible: boolean;
  category: string;
  doshas: Record<string, unknown>;
  full_report: Record<string, unknown>;

  created_at: string;
  updated_at: string;
}

export interface CustomerPanchangPreferenceRecord {
  customer_id: string;
  city_name: string;
  state_name?: string | null;
  country_name: string;
  latitude: number;
  longitude: number;
  timezone_id: string;
  timezone_offset: number;
  created_at: string;
  updated_at: string;
}


export interface SavedHoroscopeRecord {
  id: string;
  customer_id: string;
  zodiac_sign: string;
  period_type: "today" | "tomorrow" | "weekly" | "monthly" | "yearly";
  period_start: string;
  period_end: string;
  is_personalized: boolean;
  kundli_id?: string | null;
  horoscope_data: Record<string, unknown>;
  planetary_snapshot: Record<string, unknown>;
  created_at: string;
}
