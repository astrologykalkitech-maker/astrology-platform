import { createAdminClient } from "@/lib/supabase/admin";

export type AstrologerWalletTxType =
  | "RECHARGE"
  | "COMMISSION_OFFSET"
  | "SUBSCRIPTION_OFFSET"
  | "PLATFORM_FEE_DEBIT"
  | "ADMIN_CREDIT_ADJUSTMENT"
  | "ADMIN_DEBIT_ADJUSTMENT";

export interface AstrologerWalletRecord {
  astrologer_id: string;
  balance_paise: number;
  reserved_balance_paise: number;
  currency: string;
  is_frozen: boolean;
  freeze_reason?: string | null;
  total_available_paise: number;
}

export interface CreditAstrologerWalletParams {
  astrologerId: string;
  amountPaise: number;
  creditType?: AstrologerWalletTxType;
  idempotencyKey?: string;
  description: string;
  paymentOrderId?: string;
  metadata?: Record<string, any>;
}

export interface DebitAstrologerWalletParams {
  astrologerId: string;
  amountPaise: number;
  debitType: AstrologerWalletTxType;
  idempotencyKey?: string;
  description: string;
  metadata?: Record<string, any>;
}

/**
 * Retrieve astrologer operating wallet details.
 */
export async function getAstrologerOperatingWallet(astrologerId: string): Promise<AstrologerWalletRecord | null> {
  const supabase = await createAdminClient("main");

  // Ensure wallet exists
  await supabase
    .from("astrologer_wallets")
    .insert({ astrologer_id: astrologerId })
    .select()
    .maybeSingle();

  const { data: wallet, error } = await supabase
    .from("astrologer_wallets")
    .select("*")
    .eq("astrologer_id", astrologerId)
    .single();

  if (error || !wallet) {
    return null;
  }

  const bal = Number(wallet.balance_paise || 0);
  const reserved = Number(wallet.reserved_balance_paise || 0);

  return {
    astrologer_id: wallet.astrologer_id,
    balance_paise: bal,
    reserved_balance_paise: reserved,
    currency: wallet.currency || "INR",
    is_frozen: !!wallet.is_frozen,
    freeze_reason: wallet.freeze_reason,
    total_available_paise: Math.max(0, bal - reserved),
  };
}

/**
 * Atomically credit an astrologer operating wallet (e.g. recharge).
 */
export async function creditAstrologerOperatingWallet(params: CreditAstrologerWalletParams) {
  if (params.amountPaise <= 0 || !Number.isInteger(params.amountPaise)) {
    return { success: false, error: "Credit amount must be a positive integer in paise." };
  }

  const supabase = await createAdminClient("main");

  const { data, error } = await supabase.rpc("credit_astrologer_wallet_atomic", {
    p_astrologer_id: params.astrologerId,
    p_amount_paise: params.amountPaise,
    p_credit_type: params.creditType || "RECHARGE",
    p_idempotency_key: params.idempotencyKey || null,
    p_description: params.description,
    p_payment_order_id: params.paymentOrderId || null,
    p_metadata: params.metadata || {},
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

/**
 * Atomically debit an astrologer operating wallet (e.g. commission or platform fee offset).
 */
export async function debitAstrologerOperatingWallet(params: DebitAstrologerWalletParams) {
  if (params.amountPaise <= 0 || !Number.isInteger(params.amountPaise)) {
    return { success: false, error: "Debit amount must be a positive integer in paise." };
  }

  const supabase = await createAdminClient("main");

  const { data, error } = await supabase.rpc("debit_astrologer_wallet_atomic", {
    p_astrologer_id: params.astrologerId,
    p_amount_paise: params.amountPaise,
    p_debit_type: params.debitType,
    p_idempotency_key: params.idempotencyKey || null,
    p_description: params.description,
    p_metadata: params.metadata || {},
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data };
}
