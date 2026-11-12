import { z } from "zod";

// Base entity statuses
export type PaymentStatus = "created" | "pending" | "successful" | "failed" | "refunded" | "cancelled" | "expired";
export type PaymentEntityType = "consultation" | "subscription";
export type SubscriptionStatus = "active" | "past_due" | "cancelled" | "expired" | "grace_period";
export type BillingCycle = "monthly" | "quarterly" | "annual";
export type SettlementStatus = "pending" | "processing" | "completed" | "rejected";
export type RefundStatus = "requested" | "approved" | "processed" | "rejected";

export type FinancialAccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

// Standard Chart of Account Codes
export const ACCOUNT_CODES = {
  INSTAMOJO_CLEARING: "1010", // Asset: Instamojo gateway clearing account
  ESCROW_CONSULTATION: "2010", // Liability: Customer consultation escrow funds
  ASTROLOGER_PAYABLE: "2020", // Liability: Astrologer payable after commission
  PLATFORM_COMMISSION_REVENUE: "4010", // Revenue: Marketplace commission
  SUBSCRIPTION_REVENUE: "4020", // Revenue: Astrologer subscription plan fees
  GATEWAY_FEE_EXPENSE: "5010", // Expense: Instamojo transaction processing fees
  REFUND_EXPENSE: "5020", // Expense: Disputed or reversed charges
} as const;

export interface PaymentPlanRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_paise: number; // e.g. 0 for Free, 49900 for Pro (499 INR)
  currency: string; // 'INR'
  billing_cycle: BillingCycle;
  commission_percent: number; // e.g. 10.0 for 10%
  lead_quota: number; // e.g. 0 for Free, 10 for Pro
  features: string[];
  is_active: boolean;
  is_default: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface AstrologerSubscriptionRecord {
  id: string;
  astrologer_id: string; // references astrologer_profiles.id
  plan_id: string;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  billing_cycle: BillingCycle;
  auto_renew: boolean; // Always false by policy (manual renewal only)
  leads_allocated: number;
  leads_consumed: number;
  last_payment_id: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  // Joins
  plan?: PaymentPlanRecord;
}

export interface PaymentOrderRecord {
  id: string; // internal UUID
  order_number: string; // e.g. ORD-202611-ABCD
  entity_type: PaymentEntityType;
  entity_id: string; // booking_id or subscription_id
  customer_id?: string | null; // profiles.id
  astrologer_id?: string | null; // astrologer_profiles.id
  amount_paise: number;
  currency: string;
  status: PaymentStatus;
  payment_request_id?: string | null; // Instamojo payment request id
  payment_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentRecord {
  id: string; // internal UUID
  order_id: string; // references payment_orders.id
  payment_id: string; // Instamojo payment ID (e.g. MOJO...)
  payment_request_id: string;
  amount_paise: number;
  fees_paise: number;
  currency: string;
  buyer_name: string | null;
  buyer_email: string | null;
  buyer_phone: string | null;
  status: PaymentStatus;
  instamojo_mac: string | null;
  raw_payload: Record<string, unknown>;
  verified_at: string | null;
  receipt_number: string; // e.g. REC-2026-0001
  created_at: string;
  updated_at: string;
}

export interface WebhookEventRecord {
  id: string;
  gateway: "instamojo";
  event_type: string;
  payload: Record<string, unknown>;
  processed: boolean;
  error_message?: string | null;
  created_at: string;
}

export interface FinancialAccountRecord {
  id: string;
  code: string;
  name: string;
  type: FinancialAccountType;
  currency: string;
  balance_paise: number;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface FinancialJournalEntryRecord {
  id: string;
  entry_number: string; // e.g. JE-202611-0001
  reference_type: string; // 'consultation_payment', 'subscription_payment', 'settlement', 'refund'
  reference_id: string; // payment_id or settlement_id
  description: string;
  entry_date: string;
  created_at: string;
  lines?: FinancialJournalLineRecord[];
}

export interface FinancialJournalLineRecord {
  id: string;
  journal_entry_id: string;
  account_id: string;
  debit_paise: number;
  credit_paise: number;
  account_code?: string;
  account_name?: string;
  created_at: string;
}

export interface ConsultantSettlementRecord {
  id: string;
  astrologer_id: string;
  settlement_number: string;
  amount_paise: number;
  currency: string;
  status: SettlementStatus;
  bank_account_snapshot: Record<string, unknown>;
  transfer_reference?: string | null;
  notes?: string | null;
  processed_by?: string | null;
  processed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RefundRequestRecord {
  id: string;
  payment_id: string;
  order_id: string;
  customer_id: string;
  reason: string;
  amount_paise: number;
  status: RefundStatus;
  instamojo_refund_id?: string | null;
  rejection_reason?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export const CreatePlanSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  price_paise: z.number().int().nonnegative(),
  currency: z.literal("INR").default("INR"),
  billing_cycle: z.enum(["monthly", "quarterly", "annual"]).default("monthly"),
  commission_percent: z.number().min(0).max(100),
  lead_quota: z.number().int().nonnegative(),
  features: z.array(z.string()).default([]),
  is_active: z.boolean().default(true),
  is_default: z.boolean().default(false),
});

export type CreatePlanInput = z.infer<typeof CreatePlanSchema>;

