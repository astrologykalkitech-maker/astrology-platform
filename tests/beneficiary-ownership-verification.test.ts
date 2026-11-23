import test from "node:test";
import assert from "node:assert/strict";

interface MockBeneficiaryRecord {
  id: string;
  astrologer_id: string;
  masked_account: string;
  is_active: boolean;
}

// Function modeling getAstrologerBeneficiaryAction and saveAstrologerBeneficiaryAction isolation
function enforceBeneficiaryOwnership(
  callerAstrologerId: string,
  beneficiaryRecord: MockBeneficiaryRecord
): { allowed: boolean; error?: string } {
  if (beneficiaryRecord.astrologer_id !== callerAstrologerId) {
    return { allowed: false, error: "Access denied: You do not own this payout beneficiary." };
  }
  return { allowed: true };
}

test("Sub-phase 1.6: Astrologer cannot view or fetch another astrologer's beneficiary record", () => {
  const beneficiary: MockBeneficiaryRecord = {
    id: "ben_777",
    astrologer_id: "astro_victim_id",
    masked_account: "••••••••1234",
    is_active: true,
  };

  const attackerAstroId = "astro_attacker_id";
  const result = enforceBeneficiaryOwnership(attackerAstroId, beneficiary);

  assert.equal(result.allowed, false);
  assert.equal(result.error, "Access denied: You do not own this payout beneficiary.");
});

test("Sub-phase 1.6: Astrologer successfully views own payout beneficiary record", () => {
  const beneficiary: MockBeneficiaryRecord = {
    id: "ben_888",
    astrologer_id: "astro_legitimate_id",
    masked_account: "••••••••5678",
    is_active: true,
  };

  const legitimateCaller = "astro_legitimate_id";
  const result = enforceBeneficiaryOwnership(legitimateCaller, beneficiary);

  assert.equal(result.allowed, true);
});

test("Sub-phase 1.6: Decrypting beneficiary for payout strictly requires Super Admin", () => {
  function checkDecryptPermission(userRole: string): { allowed: boolean; error?: string } {
    if (userRole !== "super_admin") {
      return { allowed: false, error: "Super Admin authorization required." };
    }
    return { allowed: true };
  }

  assert.equal(checkDecryptPermission("customer").allowed, false);
  assert.equal(checkDecryptPermission("astrologer").allowed, false);
  assert.equal(checkDecryptPermission("super_admin").allowed, true);
});
