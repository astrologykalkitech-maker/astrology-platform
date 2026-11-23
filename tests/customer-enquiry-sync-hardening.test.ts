import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 1.4 & 1.5: Enquiry RPC Fallback & Cross-DB Synchronization", () => {
  const customerPath = path.resolve(process.cwd(), "app/actions/customer.ts");
  const content = fs.readFileSync(customerPath, "utf-8");

  it("strictly restricts fallback to isRpcNotInstalledError without bypassing validation/duplicates", () => {
    assert.match(
      content,
      /const isMissingRpc = isRpcNotInstalledError\(rpcErr, "submit_customer_enquiry"\);/,
      "Must check if RPC is strictly missing"
    );
    assert.match(
      content,
      /if \(!isMissingRpc\) \{\s*\/\/ Validation, business rule, duplicate, or permission rejection from the RPC must fail-closed!/m,
      "Must fail closed on non-missing RPC errors"
    );
  });

  it("synchronizes DB2 mirror lead status and assignments with authoritative createdLeadStatus", () => {
    assert.match(
      content,
      /status: createdLeadStatus,/,
      "Must write authoritative createdLeadStatus to DB2"
    );
    assert.match(
      content,
      /if \(db2AstrologerId && createdLeadStatus === "assigned"\) \{\s*await db2Client\.from\("lead_assignments"\)\.upsert/m,
      "Must only create DB2 assignment if createdLeadStatus is assigned"
    );
  });
});
