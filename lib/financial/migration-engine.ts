/**
 * ============================================================================
 * PRODUCTION-GRADE ENCRYPTION MIGRATION & FULL-RECORD AUDIT ENGINE
 * Phase 1.3: Complete Full-Record Integrity & Discrepancy Gate
 * ============================================================================
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  encryptCustomerBirthData,
  decryptCustomerBirthData,
  encryptBeneficiaryFinancialData,
  decryptBeneficiaryFinancialData,
  maskUpiId,
  isBeneficiaryEncryptionConfigured,
  getActiveKeyVersion,
} from "@/lib/financial/encryption";

export interface FieldMigrationMetrics {
  totalScanned: number;
  migrated: number;
  alreadyEncrypted: number;
  verified: number;
  failed: number;
}

export interface FullMigrationReport {
  dateOfBirth: FieldMigrationMetrics;
  timeOfBirth: FieldMigrationMetrics;
  birthplace: FieldMigrationMetrics;
  astrologerUpi: FieldMigrationMetrics;
  errors: Array<{ entityId: string; field: string; error: string }>;
  checkpoint?: string | null;
}

export interface FieldAuditMetrics {
  totalRecords: number;
  populatedPlaintext: number;
  populatedEncrypted: number;
  verifiedCount: number;
  missingEncrypted: number;
  invalidCiphertext: number;
  aadFailures: number;
  keyVersionFailures: number;
  valueMismatches: number;
}

export interface FullRecordAuditSummary {
  status: "PASS" | "FAIL" | "NOT RUN";
  profiles: {
    date_of_birth: FieldAuditMetrics;
    time_of_birth: FieldAuditMetrics;
    birthplace: FieldAuditMetrics;
  };
  astrologerProfiles: {
    upi_vpa: FieldAuditMetrics;
  };
  payoutBeneficiaries: {
    account_number: FieldAuditMetrics;
    upi_id: FieldAuditMetrics;
  };
  discrepancies: Array<{ table: string; entityId: string; field: string; errorType: string; message: string }>;
}

/**
 * Executes a batch migration for customer birth fields with independent tracking per field.
 */
export async function migrateCustomerBirthBatch(
  batchSize = 250,
  afterId?: string
): Promise<{
  report: Omit<FullMigrationReport, "astrologerUpi">;
  nextCursor: string | null;
  hasMore: boolean;
}> {
  if (!isBeneficiaryEncryptionConfigured()) {
    throw new Error("CRITICAL: Encryption keys are not configured. Cannot proceed with migration.");
  }

  const supabase = await createAdminClient("main");
  const activeVersion = getActiveKeyVersion();

  let query = supabase
    .from("profiles")
    .select("id, date_of_birth, time_of_birth, birthplace, encrypted_date_of_birth, encrypted_time_of_birth, encrypted_birthplace, birth_encryption_version")
    .order("id", { ascending: true })
    .limit(batchSize);

  if (afterId) {
    query = query.gt("id", afterId);
  }

  const { data: records, error } = await query;
  if (error) {
    throw new Error(`Failed to query profiles for migration: ${error.message}`);
  }

  const report = {
    dateOfBirth: { totalScanned: 0, migrated: 0, alreadyEncrypted: 0, verified: 0, failed: 0 },
    timeOfBirth: { totalScanned: 0, migrated: 0, alreadyEncrypted: 0, verified: 0, failed: 0 },
    birthplace: { totalScanned: 0, migrated: 0, alreadyEncrypted: 0, verified: 0, failed: 0 },
    errors: [] as Array<{ entityId: string; field: string; error: string }>,
  };

  if (!records || records.length === 0) {
    return { report, nextCursor: null, hasMore: false };
  }

  for (const row of records) {
    const updates: Record<string, unknown> = {};
    let needsUpdate = false;

    // 1. Independent check: date_of_birth
    if (row.date_of_birth) {
      report.dateOfBirth.totalScanned++;
      if (!row.encrypted_date_of_birth) {
        try {
          const enc = encryptCustomerBirthData(row.id, "date_of_birth", String(row.date_of_birth));
          updates.encrypted_date_of_birth = enc.ciphertext;
          needsUpdate = true;
          report.dateOfBirth.migrated++;
        } catch (err) {
          report.dateOfBirth.failed++;
          report.errors.push({ entityId: row.id, field: "date_of_birth", error: err instanceof Error ? err.message : "Encryption failed" });
        }
      } else {
        report.dateOfBirth.alreadyEncrypted++;
      }
    }

    // 2. Independent check: time_of_birth
    if (row.time_of_birth) {
      report.timeOfBirth.totalScanned++;
      if (!row.encrypted_time_of_birth) {
        try {
          const enc = encryptCustomerBirthData(row.id, "time_of_birth", String(row.time_of_birth));
          updates.encrypted_time_of_birth = enc.ciphertext;
          needsUpdate = true;
          report.timeOfBirth.migrated++;
        } catch (err) {
          report.timeOfBirth.failed++;
          report.errors.push({ entityId: row.id, field: "time_of_birth", error: err instanceof Error ? err.message : "Encryption failed" });
        }
      } else {
        report.timeOfBirth.alreadyEncrypted++;
      }
    }

    // 3. Independent check: birthplace
    if (row.birthplace) {
      report.birthplace.totalScanned++;
      if (!row.encrypted_birthplace) {
        try {
          const enc = encryptCustomerBirthData(row.id, "birthplace", String(row.birthplace));
          updates.encrypted_birthplace = enc.ciphertext;
          needsUpdate = true;
          report.birthplace.migrated++;
        } catch (err) {
          report.birthplace.failed++;
          report.errors.push({ entityId: row.id, field: "birthplace", error: err instanceof Error ? err.message : "Encryption failed" });
        }
      } else {
        report.birthplace.alreadyEncrypted++;
      }
    }

    if (needsUpdate) {
      updates.birth_encryption_version = activeVersion;
      updates.updated_at = new Date().toISOString();

      const { error: updateErr } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", row.id);

      if (updateErr) {
        report.errors.push({ entityId: row.id, field: "batch_update", error: updateErr.message });
      }
    }
  }

  const lastRecord = records[records.length - 1];
  const nextCursor = records.length === batchSize ? lastRecord.id : null;

  return {
    report,
    nextCursor,
    hasMore: Boolean(nextCursor),
  };
}

/**
 * Executes a batch migration for astrologer UPI VPAs with independent tracking.
 */
export async function migrateAstrologerUpiBatch(
  batchSize = 250,
  afterId?: string
): Promise<{
  report: FieldMigrationMetrics;
  errors: Array<{ entityId: string; field: string; error: string }>;
  nextCursor: string | null;
  hasMore: boolean;
}> {
  if (!isBeneficiaryEncryptionConfigured()) {
    throw new Error("CRITICAL: Encryption keys are not configured. Cannot proceed with UPI migration.");
  }

  const supabase = await createAdminClient("main");
  const activeVersion = getActiveKeyVersion();

  let query = supabase
    .from("astrologer_profiles")
    .select("id, user_id, upi_vpa, encrypted_upi_vpa, masked_upi_vpa, upi_encryption_version")
    .order("id", { ascending: true })
    .limit(batchSize);

  if (afterId) {
    query = query.gt("id", afterId);
  }

  const { data: records, error } = await query;
  if (error) {
    throw new Error(`Failed to query astrologer profiles for UPI migration: ${error.message}`);
  }

  const report: FieldMigrationMetrics = {
    totalScanned: 0,
    migrated: 0,
    alreadyEncrypted: 0,
    verified: 0,
    failed: 0,
  };
  const errors: Array<{ entityId: string; field: string; error: string }> = [];

  if (!records || records.length === 0) {
    return { report, errors, nextCursor: null, hasMore: false };
  }

  for (const row of records) {
    if (row.upi_vpa) {
      report.totalScanned++;
      if (!row.encrypted_upi_vpa) {
        try {
          const cleanUpi = row.upi_vpa.trim().toLowerCase();
          const boundId = row.user_id || row.id;
          const enc = encryptBeneficiaryFinancialData(boundId, "upi_id", cleanUpi);
          const masked = maskUpiId(cleanUpi);

          const { error: updateErr } = await supabase
            .from("astrologer_profiles")
            .update({
              encrypted_upi_vpa: enc.ciphertext,
              masked_upi_vpa: masked,
              upi_encryption_version: activeVersion,
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id);

          if (updateErr) {
            report.failed++;
            errors.push({ entityId: row.id, field: "upi_vpa", error: updateErr.message });
          } else {
            report.migrated++;
          }
        } catch (err) {
          report.failed++;
          errors.push({ entityId: row.id, field: "upi_vpa", error: err instanceof Error ? err.message : "Encryption failed" });
        }
      } else {
        report.alreadyEncrypted++;
      }
    }
  }

  const lastRecord = records[records.length - 1];
  const nextCursor = records.length === batchSize ? lastRecord.id : null;

  return {
    report,
    errors,
    nextCursor,
    hasMore: Boolean(nextCursor),
  };
}

function initMetrics(): FieldAuditMetrics {
  return {
    totalRecords: 0,
    populatedPlaintext: 0,
    populatedEncrypted: 0,
    verifiedCount: 0,
    missingEncrypted: 0,
    invalidCiphertext: 0,
    aadFailures: 0,
    keyVersionFailures: 0,
    valueMismatches: 0,
  };
}

/**
 * Full-Record Cryptographic Audit Engine (Phase 1.3):
 * Iterates through every record across profiles, astrologer_profiles, and astrologer_payout_beneficiaries
 * using stable cursor pagination (no random sampling).
 */
export async function executeFullRecordIntegrityAudit(
  pageSize = 500
): Promise<FullRecordAuditSummary> {
  if (!isBeneficiaryEncryptionConfigured()) {
    throw new Error("CRITICAL: Encryption keys are not configured. Cannot perform integrity audit.");
  }

  const supabase = await createAdminClient("main");
  const summary: FullRecordAuditSummary = {
    status: "PASS",
    profiles: {
      date_of_birth: initMetrics(),
      time_of_birth: initMetrics(),
      birthplace: initMetrics(),
    },
    astrologerProfiles: {
      upi_vpa: initMetrics(),
    },
    payoutBeneficiaries: {
      account_number: initMetrics(),
      upi_id: initMetrics(),
    },
    discrepancies: [],
  };

  // 1. Audit public.profiles
  let profileCursor: string | null = null;
  let hasMoreProfiles = true;

  while (hasMoreProfiles) {
    let q = supabase
      .from("profiles")
      .select("id, date_of_birth, time_of_birth, birthplace, encrypted_date_of_birth, encrypted_time_of_birth, encrypted_birthplace")
      .order("id", { ascending: true })
      .limit(pageSize);

    if (profileCursor) q = q.gt("id", profileCursor);

    const { data: rows, error } = await q;
    if (error || !rows || rows.length === 0) {
      hasMoreProfiles = false;
      break;
    }

    for (const p of rows) {
      summary.profiles.date_of_birth.totalRecords++;
      summary.profiles.time_of_birth.totalRecords++;
      summary.profiles.birthplace.totalRecords++;

      // A. date_of_birth
      if (p.date_of_birth) {
        summary.profiles.date_of_birth.populatedPlaintext++;
        if (!p.encrypted_date_of_birth) {
          summary.profiles.date_of_birth.missingEncrypted++;
          summary.status = "FAIL";
          summary.discrepancies.push({ table: "profiles", entityId: p.id, field: "date_of_birth", errorType: "MISSING_ENCRYPTED", message: "Populated plaintext exists without ciphertext" });
        }
      }

      if (p.encrypted_date_of_birth) {
        summary.profiles.date_of_birth.populatedEncrypted++;
        try {
          const dec = decryptCustomerBirthData(p.id, "date_of_birth", p.encrypted_date_of_birth);
          if (p.date_of_birth && dec !== String(p.date_of_birth)) {
            summary.profiles.date_of_birth.valueMismatches++;
            summary.status = "FAIL";
            summary.discrepancies.push({ table: "profiles", entityId: p.id, field: "date_of_birth", errorType: "VALUE_MISMATCH", message: "Decrypted value differs from source plaintext" });
          } else {
            summary.profiles.date_of_birth.verifiedCount++;
          }
        } catch (err) {
          summary.status = "FAIL";
          const msg = err instanceof Error ? err.message : "Decryption failed";
          if (msg.includes("not configured")) summary.profiles.date_of_birth.keyVersionFailures++;
          else if (msg.includes("authenticate")) summary.profiles.date_of_birth.aadFailures++;
          else summary.profiles.date_of_birth.invalidCiphertext++;
          summary.discrepancies.push({ table: "profiles", entityId: p.id, field: "date_of_birth", errorType: "CRYPTO_FAILURE", message: msg });
        }
      }

      // B. time_of_birth
      if (p.time_of_birth) {
        summary.profiles.time_of_birth.populatedPlaintext++;
        if (!p.encrypted_time_of_birth) {
          summary.profiles.time_of_birth.missingEncrypted++;
          summary.status = "FAIL";
          summary.discrepancies.push({ table: "profiles", entityId: p.id, field: "time_of_birth", errorType: "MISSING_ENCRYPTED", message: "Populated plaintext time without ciphertext" });
        }
      }

      if (p.encrypted_time_of_birth) {
        summary.profiles.time_of_birth.populatedEncrypted++;
        try {
          const dec = decryptCustomerBirthData(p.id, "time_of_birth", p.encrypted_time_of_birth);
          if (p.time_of_birth && !String(p.time_of_birth).startsWith(dec.slice(0, 5))) {
            summary.profiles.time_of_birth.valueMismatches++;
            summary.status = "FAIL";
            summary.discrepancies.push({ table: "profiles", entityId: p.id, field: "time_of_birth", errorType: "VALUE_MISMATCH", message: "Decrypted time mismatch" });
          } else {
            summary.profiles.time_of_birth.verifiedCount++;
          }
        } catch (err) {
          summary.status = "FAIL";
          summary.profiles.time_of_birth.invalidCiphertext++;
          summary.discrepancies.push({ table: "profiles", entityId: p.id, field: "time_of_birth", errorType: "CRYPTO_FAILURE", message: err instanceof Error ? err.message : "Decryption error" });
        }
      }

      // C. birthplace
      if (p.birthplace) {
        summary.profiles.birthplace.populatedPlaintext++;
        if (!p.encrypted_birthplace) {
          summary.profiles.birthplace.missingEncrypted++;
          summary.status = "FAIL";
          summary.discrepancies.push({ table: "profiles", entityId: p.id, field: "birthplace", errorType: "MISSING_ENCRYPTED", message: "Populated plaintext birthplace without ciphertext" });
        }
      }

      if (p.encrypted_birthplace) {
        summary.profiles.birthplace.populatedEncrypted++;
        try {
          const dec = decryptCustomerBirthData(p.id, "birthplace", p.encrypted_birthplace);
          if (p.birthplace && dec !== String(p.birthplace)) {
            summary.profiles.birthplace.valueMismatches++;
            summary.status = "FAIL";
            summary.discrepancies.push({ table: "profiles", entityId: p.id, field: "birthplace", errorType: "VALUE_MISMATCH", message: "Decrypted birthplace mismatch" });
          } else {
            summary.profiles.birthplace.verifiedCount++;
          }
        } catch (err) {
          summary.status = "FAIL";
          summary.profiles.birthplace.invalidCiphertext++;
          summary.discrepancies.push({ table: "profiles", entityId: p.id, field: "birthplace", errorType: "CRYPTO_FAILURE", message: err instanceof Error ? err.message : "Decryption error" });
        }
      }
    }

    if (rows.length === pageSize) {
      profileCursor = rows[rows.length - 1].id;
    } else {
      hasMoreProfiles = false;
    }
  }

  // 2. Audit public.astrologer_profiles
  let astroCursor: string | null = null;
  let hasMoreAstro = true;

  while (hasMoreAstro) {
    let q = supabase
      .from("astrologer_profiles")
      .select("id, user_id, upi_vpa, encrypted_upi_vpa")
      .order("id", { ascending: true })
      .limit(pageSize);

    if (astroCursor) q = q.gt("id", astroCursor);

    const { data: rows, error } = await q;
    if (error || !rows || rows.length === 0) {
      hasMoreAstro = false;
      break;
    }

    for (const a of rows) {
      summary.astrologerProfiles.upi_vpa.totalRecords++;
      if (a.upi_vpa) {
        summary.astrologerProfiles.upi_vpa.populatedPlaintext++;
        if (!a.encrypted_upi_vpa) {
          summary.astrologerProfiles.upi_vpa.missingEncrypted++;
          summary.status = "FAIL";
          summary.discrepancies.push({ table: "astrologer_profiles", entityId: a.id, field: "upi_vpa", errorType: "MISSING_ENCRYPTED", message: "Populated plaintext UPI without ciphertext" });
        }
      }

      if (a.encrypted_upi_vpa) {
        summary.astrologerProfiles.upi_vpa.populatedEncrypted++;
        try {
          const boundId = a.user_id || a.id;
          const dec = decryptBeneficiaryFinancialData(boundId, "upi_id", a.encrypted_upi_vpa);
          if (a.upi_vpa && dec !== String(a.upi_vpa).trim().toLowerCase()) {
            summary.astrologerProfiles.upi_vpa.valueMismatches++;
            summary.status = "FAIL";
            summary.discrepancies.push({ table: "astrologer_profiles", entityId: a.id, field: "upi_vpa", errorType: "VALUE_MISMATCH", message: "Decrypted UPI mismatch" });
          } else {
            summary.astrologerProfiles.upi_vpa.verifiedCount++;
          }
        } catch (err) {
          summary.status = "FAIL";
          summary.astrologerProfiles.upi_vpa.invalidCiphertext++;
          summary.discrepancies.push({ table: "astrologer_profiles", entityId: a.id, field: "upi_vpa", errorType: "CRYPTO_FAILURE", message: err instanceof Error ? err.message : "Decryption error" });
        }
      }
    }

    if (rows.length === pageSize) {
      astroCursor = rows[rows.length - 1].id;
    } else {
      hasMoreAstro = false;
    }
  }

  // 3. Audit public.astrologer_payout_beneficiaries
  let benCursor: string | null = null;
  let hasMoreBen = true;

  while (hasMoreBen) {
    let q = supabase
      .from("astrologer_payout_beneficiaries")
      .select("id, astrologer_id, account_type, encrypted_account_number, encrypted_upi_id, masked_account_number")
      .order("id", { ascending: true })
      .limit(pageSize);

    if (benCursor) q = q.gt("id", benCursor);

    const { data: rows, error } = await q;
    if (error || !rows || rows.length === 0) {
      hasMoreBen = false;
      break;
    }

    for (const b of rows) {
      summary.payoutBeneficiaries.account_number.totalRecords++;
      summary.payoutBeneficiaries.upi_id.totalRecords++;

      if (b.account_type === "bank_account") {
        if (!b.encrypted_account_number) {
          summary.payoutBeneficiaries.account_number.missingEncrypted++;
          summary.status = "FAIL";
          summary.discrepancies.push({ table: "astrologer_payout_beneficiaries", entityId: b.id, field: "account_number", errorType: "MISSING_ENCRYPTED", message: "Bank beneficiary missing ciphertext" });
        } else {
          summary.payoutBeneficiaries.account_number.populatedEncrypted++;
          try {
            decryptBeneficiaryFinancialData(b.astrologer_id, "account_number", b.encrypted_account_number);
            summary.payoutBeneficiaries.account_number.verifiedCount++;
          } catch (err) {
            summary.status = "FAIL";
            summary.payoutBeneficiaries.account_number.invalidCiphertext++;
            summary.discrepancies.push({ table: "astrologer_payout_beneficiaries", entityId: b.id, field: "account_number", errorType: "CRYPTO_FAILURE", message: err instanceof Error ? err.message : "Decryption error" });
          }
        }
      } else if (b.account_type === "upi_id") {
        if (!b.encrypted_upi_id) {
          summary.payoutBeneficiaries.upi_id.missingEncrypted++;
          summary.status = "FAIL";
          summary.discrepancies.push({ table: "astrologer_payout_beneficiaries", entityId: b.id, field: "upi_id", errorType: "MISSING_ENCRYPTED", message: "UPI beneficiary missing ciphertext" });
        } else {
          summary.payoutBeneficiaries.upi_id.populatedEncrypted++;
          try {
            decryptBeneficiaryFinancialData(b.astrologer_id, "upi_id", b.encrypted_upi_id);
            summary.payoutBeneficiaries.upi_id.verifiedCount++;
          } catch (err) {
            summary.status = "FAIL";
            summary.payoutBeneficiaries.upi_id.invalidCiphertext++;
            summary.discrepancies.push({ table: "astrologer_payout_beneficiaries", entityId: b.id, field: "upi_id", errorType: "CRYPTO_FAILURE", message: err instanceof Error ? err.message : "Decryption error" });
          }
        }
      }
    }

    if (rows.length === pageSize) {
      benCursor = rows[rows.length - 1].id;
    } else {
      hasMoreBen = false;
    }
  }

  return summary;
}
