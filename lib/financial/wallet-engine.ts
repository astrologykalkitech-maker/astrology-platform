import { createAdminClient } from "@/lib/supabase/admin";

export type WalletCreditType = "RECHARGE" | "REFUND_CREDIT" | "PROMO_CREDIT";
export type ServiceType = "consultation_chat" | "consultation_audio" | "consultation_video" | "puja_booking";

export interface CustomerWalletRecord {
  customer_id: string;
  paid_balance_paise: number;
  promotional_balance_paise: number;
  refund_balance_paise: number;
  reserved_balance_paise: number;
  currency: string;
  is_frozen: boolean;
  freeze_reason?: string | null;
  total_available_paise: number;
}

export interface CreditWalletParams {
  customerId: string;
  amountPaise: number;
  creditType: WalletCreditType;
  idempotencyKey?: string;
  description: string;
  paymentOrderId?: string;
  metadata?: Record<string, any>;
}

export interface HoldReservationParams {
  customerId: string;
  serviceType: ServiceType;
  amountPaise: number;
  referenceId?: string;
  ttlSeconds?: number;
  idempotencyKey?: string;
}

export interface CaptureReservationParams {
  reservationId: string;
  actualAmountPaise: number;
  idempotencyKey?: string;
}

export interface ReleaseReservationParams {
  reservationId: string;
  reason?: string;
}

/**
 * Retrieve customer wallet details with unified total available balance.
 */
export async function getCustomerWallet(customerId: string): Promise<CustomerWalletRecord | null> {
  const supabase = await createAdminClient("main");

  // Ensure wallet exists
  await supabase
    .from("customer_wallets")
    .insert({ customer_id: customerId })
    .select()
    .maybeSingle();

  const { data: wallet, error } = await supabase
    .from("customer_wallets")
    .select("*")
    .eq("customer_id", customerId)
    .single();

  if (error || !wallet) {
    return null;
  }

  const paid = Number(wallet.paid_balance_paise || 0);
  const promo = Number(wallet.promotional_balance_paise || 0);
  const refund = Number(wallet.refund_balance_paise || 0);
  const reserved = Number(wallet.reserved_balance_paise || 0);

  return {
    customer_id: wallet.customer_id,
    paid_balance_paise: paid,
    promotional_balance_paise: promo,
    refund_balance_paise: refund,
    reserved_balance_paise: reserved,
    currency: wallet.currency || "INR",
    is_frozen: !!wallet.is_frozen,
    freeze_reason: wallet.freeze_reason,
    total_available_paise: paid + promo + refund,
  };
}

/**
 * Atomically credit a customer's wallet (recharge, promo, or refund).
 */
export async function creditCustomerWallet(params: CreditWalletParams) {
  if (params.amountPaise <= 0 || !Number.isInteger(params.amountPaise)) {
    return { success: false, error: "Credit amount must be a positive integer in paise." };
  }

  const supabase = await createAdminClient("main");

  const { data, error } = await supabase.rpc("credit_customer_wallet_atomic", {
    p_customer_id: params.customerId,
    p_amount_paise: params.amountPaise,
    p_credit_type: params.creditType,
    p_idempotency_key: params.idempotencyKey || null,
    p_description: params.description,
    p_payment_order_id: params.paymentOrderId || null,
    p_metadata: params.metadata || {},
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return data;
}

/**
 * Atomically hold a wallet balance reservation before starting a consultation or booking.
 */
export async function holdWalletReservation(params: HoldReservationParams) {
  if (params.amountPaise <= 0 || !Number.isInteger(params.amountPaise)) {
    return { success: false, error: "Hold amount must be a positive integer in paise." };
  }

  const supabase = await createAdminClient("main");

  const { data, error } = await supabase.rpc("hold_wallet_reservation_atomic", {
    p_customer_id: params.customerId,
    p_service_type: params.serviceType,
    p_amount_paise: params.amountPaise,
    p_reference_id: params.referenceId || null,
    p_ttl_seconds: params.ttlSeconds || 900,
    p_idempotency_key: params.idempotencyKey || null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return data;
}

/**
 * Capture an existing reservation upon consultation completion.
 */
export async function captureWalletReservation(params: CaptureReservationParams) {
  if (params.actualAmountPaise < 0 || !Number.isInteger(params.actualAmountPaise)) {
    return { success: false, error: "Capture amount must be a non-negative integer in paise." };
  }

  const supabase = await createAdminClient("main");

  const { data, error } = await supabase.rpc("capture_wallet_reservation_atomic", {
    p_reservation_id: params.reservationId,
    p_actual_amount_paise: params.actualAmountPaise,
    p_idempotency_key: params.idempotencyKey || null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return data;
}

/**
 * Release an unconsumed wallet reservation back to customer balances.
 */
export async function releaseWalletReservation(params: ReleaseReservationParams) {
  const supabase = await createAdminClient("main");

  const { data, error } = await supabase.rpc("release_wallet_reservation_atomic", {
    p_reservation_id: params.reservationId,
    p_reason: params.reason || "Service cancelled",
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return data;
}
