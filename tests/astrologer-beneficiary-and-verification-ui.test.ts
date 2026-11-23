import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Phase 3: BeneficiarySettingsCard and AstrologerVerificationStepperClient exist and export React components", () => {
  const beneficiaryPath = path.join(process.cwd(), "components/astrologer/BeneficiarySettingsCard.tsx");
  const verificationPath = path.join(process.cwd(), "components/astrologer/AstrologerVerificationStepperClient.tsx");

  assert.equal(fs.existsSync(beneficiaryPath), true, "BeneficiarySettingsCard.tsx must exist");
  assert.equal(fs.existsSync(verificationPath), true, "AstrologerVerificationStepperClient.tsx must exist");

  const beneficiaryContent = fs.readFileSync(beneficiaryPath, "utf8");
  const verificationContent = fs.readFileSync(verificationPath, "utf8");

  assert.match(beneficiaryContent, /export function BeneficiarySettingsCard/);
  assert.match(beneficiaryContent, /saveAstrologerBeneficiaryAction/);
  assert.match(beneficiaryContent, /getAstrologerBeneficiaryAction/);
  assert.match(beneficiaryContent, /AES-256-GCM/);

  assert.match(verificationContent, /export function AstrologerVerificationStepperClient/);
  assert.match(verificationContent, /getAstrologerVerificationOverview/);
  assert.match(verificationContent, /submitVerificationStageAction/);
});

test("Phase 3: Astrologer Profile page integrates both verification and beneficiary components", () => {
  const profilePagePath = path.join(process.cwd(), "app/astrologer/(portal)/profile/page.tsx");
  const profilePageContent = fs.readFileSync(profilePagePath, "utf8");

  assert.match(profilePageContent, /<AstrologerVerificationStepperClient \/>/);
  assert.match(profilePageContent, /<BeneficiarySettingsCard \/>/);
});

test("Phase 3: Atomic Beneficiary Swap RPC migration exists and defines single-writer transactional swap", () => {
  const migPath = path.join(process.cwd(), "supabase/migrations/094_atomic_astrologer_beneficiary_swap_rpc.sql");
  assert.equal(fs.existsSync(migPath), true, "Migration 094 must exist");
  const migContent = fs.readFileSync(migPath, "utf8");
  assert.match(migContent, /create or replace function public\.swap_astrologer_payout_beneficiary_atomic/);
  assert.match(migContent, /for update/);
});
