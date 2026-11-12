/**
 * JyotishSetu Pay — Core Type Definitions
 * 
 * Indigenous Fintech & Payment Orchestration System
 * Strict integer-paise arithmetic, state machines, and reconciliation models.
 */

export type JyotishPayIntentStatus =
  | "created"
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "expired"
  | "refunded";

export type JyotishPayMethod =
  | "upi_qr"
  | "upi_intent"
  | "net_banking"
  | "card"
  | "simulation";

export type JyotishQRSessionStatus =
  | "active"
  | "scanned"
  | "completed"
  | "expired"
  | "cancelled";

export type JyotishPayoutStatus =
  | "requested"
  | "processing"
  | "completed"
  | "rejected"
  | "failed";

export interface JyotishPaymentIntent {
  id: string;
  intent_number: string;
  customer_id?: string | null;
  astrologer_id?: string | null;
  booking_id?: string | null;
  plan_id?: string | null;
  entity_type: "consultation" | "subscription";
  amount_paise: number;
  currency: string;
  status: JyotishPayIntentStatus;
  client_secret: string;
  payment_method_allowed: string[];
  metadata: Record<string, any>;
  error_code?: string | null;
  error_message?: string | null;
  created_at: string;
  expires_at: string;
  succeeded_at?: string | null;
  updated_at: string;
}

export interface JyotishPaymentAttempt {
  id: string;
  intent_id: string;
  attempt_number: number;
  payment_method: JyotishPayMethod;
  gateway_provider: string;
  provider_reference?: string | null;
  upi_vpa?: string | null;
  card_network?: string | null;
  status: JyotishPayIntentStatus;
  error_code?: string | null;
  error_message?: string | null;
  raw_payload?: Record<string, any>;
  raw_response?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface JyotishQRSession {
  id: string;
  session_code: string;
  intent_id: string;
  customer_id?: string | null;
  astrologer_id?: string | null;
  amount_paise: number;
  upi_uri: string;
  qr_svg: string;
  status: JyotishQRSessionStatus;
  utr_reference?: string | null;
  verified_at?: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface JyotishPaymentReceipt {
  id: string;
  receipt_number: string;
  intent_id: string;
  booking_id?: string | null;
  customer_id?: string | null;
  astrologer_id?: string | null;
  amount_paise: number;
  tax_paise: number;
  payment_method: string;
  utr_or_txn_id?: string | null;
  verification_hash: string;
  pdf_storage_path?: string | null;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface JyotishPayoutRecord {
  id: string;
  payout_number: string;
  astrologer_id: string;
  amount_paise: number;
  status: JyotishPayoutStatus;
  bank_account_number?: string | null;
  bank_ifsc?: string | null;
  bank_beneficiary_name?: string | null;
  bank_reference_utr?: string | null;
  requested_at: string;
  processed_at?: string | null;
  admin_notes?: string | null;
}

export interface JyotishGatewayConfig {
  mode: "sandbox" | "live";
  merchantVpa: string;
  merchantName: string;
  merchantCode: string; // MCC e.g. '8299' or '8999'
  appBaseUrl: string;
  webhookSecret: string;
  autoApproveSandbox: boolean;
}
