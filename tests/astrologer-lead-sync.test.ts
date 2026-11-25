import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import { validateStatusTransition } from "../lib/validations/lead";

describe("Sub-phase 3.3 - Astrologer Lead Status Synchronization Verification", () => {
  it("enforces strict status transition state machine for astrologer lead assignments", () => {
    // Valid forward transitions
    assert.strictEqual(validateStatusTransition("assigned", "contacted").valid, true);
    assert.strictEqual(validateStatusTransition("assigned", "closed").valid, true);
    assert.strictEqual(validateStatusTransition("contacted", "closed").valid, true);

    // Terminal closed state
    assert.strictEqual(validateStatusTransition("closed", "assigned").valid, false);
    assert.strictEqual(validateStatusTransition("closed", "contacted").valid, false);

    // Backward transition from contacted to assigned
    assert.strictEqual(validateStatusTransition("contacted", "assigned").valid, false);

    // No-op transitions
    assert.strictEqual(validateStatusTransition("assigned", "assigned").valid, false);
    assert.strictEqual(validateStatusTransition("contacted", "contacted").valid, false);
    assert.strictEqual(validateStatusTransition("closed", "closed").valid, false);
  });

  it("app/actions/astrologer-leads.ts synchronizes lead status across both DB1 and DB2", () => {
    const rawCode = fs.readFileSync("app/actions/astrologer-leads.ts", "utf8");
    const code = rawCode.replace(/\r\n/g, "\n");

    // DB1 sync
    assert.ok(
      code.includes('createAdminClient("main")'),
      "Must synchronize status to DB1 using admin client"
    );
    assert.ok(
      code.includes('.from("leads")') && code.includes('.update({ status: targetLeadStatus })'),
      "Must update leads table in DB1"
    );

    // DB2 sync with timestamps
    assert.ok(
      code.includes('createAdminClient("admin")'),
      "Must synchronize status and timestamps to DB2 using admin client"
    );
    assert.ok(
      code.includes('db2Payload.closed_at = now'),
      "Must record closed_at timestamp on DB2 when status is closed"
    );
    assert.ok(
      code.includes('db2Payload.first_contacted_at = now'),
      "Must record first_contacted_at timestamp on DB2 when status is contacted"
    );

    // Admin audit trail recording
    assert.ok(
      code.includes('logAdminAction('),
      "Must log action into admin audit trail for Super Admin visibility"
    );

    // Cross-dashboard path cache invalidation
    assert.ok(
      code.includes('revalidatePath("/super-admin/leads", "page")'),
      "Must revalidate Super Admin leads path"
    );
    assert.ok(
      code.includes('revalidatePath("/astrologer/leads", "page")'),
      "Must revalidate Astrologer leads path"
    );
    assert.ok(
      code.includes('revalidatePath("/customer/enquiries", "page")'),
      "Must revalidate Customer enquiries path"
    );
  });
});
