import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import { VALID_QUALIFICATION_STATUSES } from "../lib/validations/admin";

describe("Sub-phase 6.1 - Lead Deduplication & Qualification Workflow Verification", () => {
  it("enforces valid qualification statuses set including duplicate and invalid", () => {
    assert.ok(VALID_QUALIFICATION_STATUSES.has("qualified"));
    assert.ok(VALID_QUALIFICATION_STATUSES.has("unqualified"));
    assert.ok(VALID_QUALIFICATION_STATUSES.has("duplicate"));
    assert.ok(VALID_QUALIFICATION_STATUSES.has("invalid"));
  });

  it("app/actions/admin-leads.ts updates qualification status and mirrors to DB1", () => {
    const code = fs.readFileSync("app/actions/admin-leads.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes("VALID_QUALIFICATION_STATUSES.has(qualificationStatus)"),
      "Must validate input against VALID_QUALIFICATION_STATUSES"
    );
    assert.ok(
      code.includes('createAdminClient("main")') &&
      code.includes('.from("leads")') &&
      code.includes('.update(updatePayload)'),
      "Must mirror lead qualification status to DB1"
    );
    assert.ok(
      code.includes("logAdminAction(") &&
      code.includes("action: `lead.qualify.${qualificationStatus}`"),
      "Must log lead qualification in admin audit log"
    );
    assert.ok(
      code.includes('revalidatePath("/super-admin/leads"'),
      "Must revalidate super admin leads path"
    );
  });
});
