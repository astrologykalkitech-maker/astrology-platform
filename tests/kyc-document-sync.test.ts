import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

describe("Sub-phase 4.2 - Astrologer Verification KYC Document Synchronization Verification", () => {
  it("app/actions/astrologer-verification.ts exports updateVerificationDocumentReviewAction", () => {
    const code = fs.readFileSync("app/actions/astrologer-verification.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes("export async function updateVerificationDocumentReviewAction"),
      "Must export updateVerificationDocumentReviewAction"
    );
  });

  it("updateVerificationDocumentReviewAction enforces rejection reason requirement", () => {
    const code = fs.readFileSync("app/actions/astrologer-verification.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes('if (verificationStatus === "rejected" && (!rejectionReason || !rejectionReason.trim()))'),
      "Must require rejectionReason when document is rejected"
    );
  });

  it("updateVerificationDocumentReviewAction dispatches in-app notification and logs audit trail", () => {
    const code = fs.readFileSync("app/actions/astrologer-verification.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes('createInAppNotification('),
      "Must dispatch in-app notification to astrologer"
    );
    assert.ok(
      code.includes('logAdminAction('),
      "Must record admin action in audit log"
    );
    assert.ok(
      code.includes('revalidatePath("/super-admin/verification", "page")') &&
      code.includes('revalidatePath("/astrologer/profile", "page")'),
      "Must revalidate verification review and profile pages"
    );
  });
});
