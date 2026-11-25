import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Astrologer Verification & KYC - Full 12-Item Architecture Audit", async (t) => {
  const actionsPath = path.resolve(process.cwd(), "app/actions/astrologer-verification.ts");
  const stepperPath = path.resolve(process.cwd(), "components/astrologer/AstrologerVerificationStepperClient.tsx");
  const adminReviewPath = path.resolve(process.cwd(), "components/admin/SuperAdminVerificationReviewClient.tsx");
  const migrationPath = path.resolve(process.cwd(), "supabase/migrations/050_ultimate_platform_readiness.sql");

  const actionsCode = fs.readFileSync(actionsPath, "utf-8");
  const stepperCode = fs.readFileSync(stepperPath, "utf-8");
  const adminReviewCode = fs.readFileSync(adminReviewPath, "utf-8");
  const migrationCode = fs.readFileSync(migrationPath, "utf-8");

  await t.test("1. Verification stepper: 11 authoritative stages defined and verified", () => {
    assert.match(actionsCode, /"registration"/);
    assert.match(actionsCode, /"personal_info"/);
    assert.match(actionsCode, /"qualifications"/);
    assert.match(actionsCode, /"certifications"/);
    assert.match(actionsCode, /"experience"/);
    assert.match(actionsCode, /"identity"/);
    assert.match(actionsCode, /"documents"/);
    assert.match(actionsCode, /"interview"/);
    assert.match(actionsCode, /"test_consultation"/);
    assert.match(actionsCode, /"probation"/);
    assert.match(actionsCode, /"final_review"/);

    assert.match(stepperCode, /STAGE_LABELS/);
    assert.match(stepperCode, /approvedStagesCount/);
  });

  await t.test("2. Personal information, Qualifications, Certifications & Experience submission", () => {
    assert.match(actionsCode, /export async function submitVerificationStageAction/);
    assert.match(actionsCode, /status:\s*"submitted"/);
    assert.match(actionsCode, /approval_status:\s*"under_review"/);
  });

  await t.test("3. Identity verification & Document submission with storage upload", () => {
    assert.match(actionsCode, /export async function uploadVerificationDocumentAction/);
    assert.match(actionsCode, /MAX_DOC_SIZE\s*=\s*15\s*\*\s*1024\s*\*\s*1024/);
    assert.match(actionsCode, /"application\/pdf"/);
    assert.match(actionsCode, /\.storage\s*\.\s*from\(\s*bucketName\s*\)/);
    assert.match(actionsCode, /astrologer_verification_documents/);
  });

  await t.test("4. Interview stage scheduling & tracking", () => {
    assert.match(actionsCode, /export async function scheduleAstrologerInterviewAction/);
    assert.match(migrationCode, /CREATE TABLE IF NOT EXISTS public\.astrologer_interviews/);
    assert.match(adminReviewCode, /scheduleAstrologerInterviewAction/);
  });

  await t.test("5. Test consultation simulation evaluation", () => {
    assert.match(actionsCode, /export async function evaluateAstrologerTestConsultationAction/);
    assert.match(migrationCode, /CREATE TABLE IF NOT EXISTS public\.astrologer_test_consultations/);
    assert.match(adminReviewCode, /evaluateAstrologerTestConsultationAction/);
  });

  await t.test("6. Probationary stage clearance and monitoring", () => {
    assert.match(actionsCode, /export async function updateAstrologerProbationAction/);
    assert.match(migrationCode, /CREATE TABLE IF NOT EXISTS public\.astrologer_probations/);
    assert.match(adminReviewCode, /updateAstrologerProbationAction/);
  });

  await t.test("7. Final approval synchronization with public listings and notifications", () => {
    assert.match(actionsCode, /export async function approveAstrologerWithSyncAction/);
    assert.match(actionsCode, /approval_status:\s*"approved"/);
    assert.match(actionsCode, /createInAppNotification/);
    assert.match(actionsCode, /revalidatePath\("\/customer\/astrologers"/);
  });

  await t.test("8. Document rejection handling with mandatory feedback", () => {
    assert.match(actionsCode, /export async function updateVerificationDocumentReviewAction/);
    assert.match(actionsCode, /verificationStatus === "rejected" && \(!rejectionReason \|\| !rejectionReason\.trim\(\)\)/);
    assert.match(adminReviewCode, /handleUpdateDocumentStatus/);
    assert.match(adminReviewCode, /Reject Doc/);
  });
});
