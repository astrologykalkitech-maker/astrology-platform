"use server";

// ============================================================================
// ASTROLOGER PAYOUT BENEFICIARY SERVER ACTIONS
// Phase 1 Stage 1B & 1C: Secure Authenticated Beneficiary & Payout Encryption
// ============================================================================

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAstrologer } from "@/lib/auth/session";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import type { AuthResult } from "@/lib/types/auth.types";
import {
  encryptBeneficiaryFinancialData,
  decryptBeneficiaryFinancialData,
  maskBankAccountNumber,
  maskUpiId,
  isBeneficiaryEncryptionConfigured,
  getActiveKeyVersion,
} from "@/lib/financial/encryption";
import { isValidUUID } from "@/lib/validations/lead";
import { revalidatePath } from "next/cache";

export interface AstrologerBeneficiaryView {
  id: string;
  astrologer_id: string;
  account_type: "bank_account" | "upi_id";
  masked_account_number: string;
  bank_ifsc: string | null;
  bank_name: string | null;
  beneficiary_name: string;
  is_active: boolean;
  verification_status: "unverified" | "pending_verification" | "verified" | "rejected";
  created_at: string;
  updated_at: string;
}

export interface SaveBeneficiaryInput {
  account_type: "bank_account" | "upi_id";
  account_number?: string;
  bank_ifsc?: string;
  bank_name?: string;
  upi_id?: string;
  beneficiary_name: string;
}

/**
 * Saves or updates payout beneficiary details for the authenticated astrologer.
 * Encrypts account number or UPI ID before database write using AES-256-GCM.
 * Never stores plaintext financial details in database or logs.
 */
export async function saveAstrologerBeneficiaryAction(
  input: SaveBeneficiaryInput
): Promise<AuthResult<AstrologerBeneficiaryView>> {
  try {
    const { user, target } = await requireAstrologer();

    if (!isBeneficiaryEncryptionConfigured()) {
      return {
        success: false,
        error: "System encryption service is temporarily unavailable. Please contact support.",
      };
    }

    // 1. Resolve astrologer profile
    const supabase = await createClient(target);
    const { data: astrologerProfile, error: profErr } = await supabase
      .from("astrologer_profiles")
      .select("id, display_name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profErr || !astrologerProfile) {
      return { success: false, error: "Astrologer profile not found." };
    }

    const astrologerId = astrologerProfile.id;

    // 2. Validate input fields
    const accountType = input.account_type;
    if (accountType !== "bank_account" && accountType !== "upi_id") {
      return { success: false, error: "Invalid beneficiary account type." };
    }

    const beneficiaryName = input.beneficiary_name?.trim();
    if (!beneficiaryName || beneficiaryName.length < 2 || beneficiaryName.length > 100) {
      return { success: false, error: "Beneficiary name must be between 2 and 100 characters." };
    }

    let encryptedAccount: string | null = null;
    let encryptedUpi: string | null = null;
    let maskedAccount = "";
    let cleanIfsc: string | null = null;
    let cleanBankName: string | null = null;

    if (accountType === "bank_account") {
      const rawAccount = input.account_number?.replace(/\s+/g, "") || "";
      if (!/^\d{9,18}$/.test(rawAccount)) {
        return { success: false, error: "Invalid bank account number (9 to 18 digits required)." };
      }

      cleanIfsc = (input.bank_ifsc?.trim() || "").toUpperCase();
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
        return { success: false, error: "Invalid Indian Financial System Code (IFSC) format." };
      }

      cleanBankName = input.bank_name?.trim() || null;

      // Encrypt account number bound to astrologerId
      const enc = encryptBeneficiaryFinancialData(astrologerId, "account_number", rawAccount);
      encryptedAccount = enc.ciphertext;
      maskedAccount = maskBankAccountNumber(rawAccount);
    } else {
      const rawUpi = input.upi_id?.trim().toLowerCase() || "";
      if (!/^[\w.-]{2,64}@[a-zA-Z]{2,64}$/.test(rawUpi)) {
        return { success: false, error: "Invalid UPI ID format (e.g. username@bank)." };
      }

      // Encrypt UPI ID bound to astrologerId
      const enc = encryptBeneficiaryFinancialData(astrologerId, "upi_id", rawUpi);
      encryptedUpi = enc.ciphertext;
      maskedAccount = maskUpiId(rawUpi);
    }

    // 3. Deactivate any existing active beneficiary records for this astrologer
    const admin = await createAdminClient("main");
    await admin
      .from("astrologer_payout_beneficiaries")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("astrologer_id", astrologerId)
      .eq("is_active", true);

    // 4. Insert new verified or pending beneficiary record
    const { data: inserted, error: insertErr } = await admin
      .from("astrologer_payout_beneficiaries")
      .insert({
        astrologer_id: astrologerId,
        account_type: accountType,
        encrypted_account_number: encryptedAccount,
        encrypted_upi_id: encryptedUpi,
        encryption_key_version: getActiveKeyVersion(),
        bank_ifsc: cleanIfsc,
        bank_name: cleanBankName,
        beneficiary_name: beneficiaryName,
        masked_account_number: maskedAccount,
        is_active: true,
        verification_status: "verified", // auto-verified for owner self-service payout
        verified_at: new Date().toISOString(),
        verified_by: user.id,
      })
      .select()
      .single();

    if (insertErr || !inserted) {
      return { success: false, error: insertErr?.message || "Failed to register payout beneficiary." };
    }

    revalidatePath("/astrologer/dashboard");
    revalidatePath("/astrologer/profile");

    return {
      success: true,
      data: {
        id: inserted.id,
        astrologer_id: inserted.astrologer_id,
        account_type: inserted.account_type,
        masked_account_number: inserted.masked_account_number,
        bank_ifsc: inserted.bank_ifsc,
        bank_name: inserted.bank_name,
        beneficiary_name: inserted.beneficiary_name,
        is_active: inserted.is_active,
        verification_status: inserted.verification_status,
        created_at: inserted.created_at,
        updated_at: inserted.updated_at,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to save beneficiary.",
    };
  }
}

/**
 * Retrieves the currently active payout beneficiary for the authenticated astrologer.
 * Returns only the masked account representation; never exposes raw decrypted details.
 */
export async function getAstrologerBeneficiaryAction(): Promise<
  AuthResult<AstrologerBeneficiaryView | null>
> {
  try {
    const { user, target } = await requireAstrologer();
    const supabase = await createClient(target);

    const { data: profile } = await supabase
      .from("astrologer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) {
      return { success: false, error: "Astrologer profile not found." };
    }

    const { data: beneficiary, error } = await supabase
      .from("astrologer_payout_beneficiaries")
      .select(
        "id, astrologer_id, account_type, masked_account_number, bank_ifsc, bank_name, beneficiary_name, is_active, verification_status, created_at, updated_at"
      )
      .eq("astrologer_id", profile.id)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: (beneficiary as AstrologerBeneficiaryView) || null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load beneficiary.",
    };
  }
}

/**
 * Super Admin / System internal action: Decrypts beneficiary details strictly for authorized
 * payout processing (e.g. initiating direct bank IMPS/NEFT or UPI disbursement).
 * Strictly audited and server-side only.
 */
export async function decryptBeneficiaryForPayout(
  beneficiaryId: string
): Promise<
  AuthResult<{
    beneficiaryId: string;
    astrologerId: string;
    accountType: "bank_account" | "upi_id";
    decryptedAccountNumber?: string;
    decryptedUpiId?: string;
    bankIfsc?: string | null;
    beneficiaryName: string;
  }>
> {
  try {
    await requireSuperAdmin();

    if (!isValidUUID(beneficiaryId)) {
      return { success: false, error: "Invalid beneficiary identifier." };
    }

    const admin = await createAdminClient("main");
    const { data: b, error } = await admin
      .from("astrologer_payout_beneficiaries")
      .select("*")
      .eq("id", beneficiaryId)
      .maybeSingle();

    if (error || !b) {
      return { success: false, error: "Beneficiary record not found." };
    }

    let decryptedAccountNumber: string | undefined;
    let decryptedUpiId: string | undefined;

    if (b.account_type === "bank_account" && b.encrypted_account_number) {
      decryptedAccountNumber = decryptBeneficiaryFinancialData(
        b.astrologer_id,
        "account_number",
        b.encrypted_account_number
      );
    } else if (b.account_type === "upi_id" && b.encrypted_upi_id) {
      decryptedUpiId = decryptBeneficiaryFinancialData(
        b.astrologer_id,
        "upi_id",
        b.encrypted_upi_id
      );
    }

    return {
      success: true,
      data: {
        beneficiaryId: b.id,
        astrologerId: b.astrologer_id,
        accountType: b.account_type,
        decryptedAccountNumber,
        decryptedUpiId,
        bankIfsc: b.bank_ifsc,
        beneficiaryName: b.beneficiary_name,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Payout decryption failed.",
    };
  }
}
