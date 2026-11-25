import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

describe("Sub-phase 3.2 - Lead Assignment Synchronization Verification", () => {
  it("app/actions/admin-leads.ts must invoke perform_atomic_lead_assignment RPC", () => {
    const code = fs.readFileSync("app/actions/admin-leads.ts", "utf8");
    assert.ok(
      code.includes('supabase.rpc("perform_atomic_lead_assignment"'),
      "Must execute canonical atomic transactional lead assignment RPC"
    );
  });

  it("app/actions/admin-leads.ts must mirror assignment to DB1 and send in-app notification to astrologer", () => {
    const code = fs.readFileSync("app/actions/admin-leads.ts", "utf8");
    assert.ok(
      code.includes('createAdminClient("main")'),
      "Must connect to DB1 to mirror assignment"
    );
    assert.ok(
      code.includes('createInAppNotification('),
      "Must send in-app notification to assigned astrologer"
    );
    assert.ok(
      code.includes('revalidatePath("/astrologer/leads"'),
      "Must revalidate astrologer leads page"
    );
    assert.ok(
      code.includes('revalidatePath("/super-admin/leads"'),
      "Must revalidate super admin leads page"
    );
  });

  it("app/actions/admin-leads.ts must clean up DB1 lead_assignments on unassignment", () => {
    const code = fs.readFileSync("app/actions/admin-leads.ts", "utf8");
    assert.ok(
      code.includes('.from("lead_assignments").delete().eq("lead_id", leadId)'),
      "Must delete DB1 lead_assignments when unassigning lead"
    );
  });
});
