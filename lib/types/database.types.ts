// =====================================================
// DATABASE TYPES (Matching Supabase Schema 001 & 002)
// =====================================================

export type UserRole = "customer" | "astrologer" | "admin";
export type SignUpRole = "customer" | "astrologer";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type LeadStatus = "new" | "assigned" | "closed";
export type AssignmentStatus = "assigned" | "contacted" | "closed";

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
  created_at: string;
}

export interface LeadAssignment {
  id: string;
  lead_id: string;
  astrologer_id: string;
  status: AssignmentStatus;
  created_at: string;
}
