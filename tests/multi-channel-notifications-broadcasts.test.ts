import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

describe("Sub-phase 6.4 - Multi-Channel Notifications & Broadcasts Verification", () => {
  it("enterprise-notifications.ts dispatchBulkMultiChannelNotification enforces requireSuperAdmin", () => {
    const code = fs.readFileSync("app/actions/enterprise-notifications.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes("dispatchBulkMultiChannelNotification") &&
      code.includes("await requireSuperAdmin();"),
      "Bulk notification dispatch must be restricted strictly to Super Admin"
    );
  });

  it("enterprise-notifications.ts dispatchMultiChannelNotification checks caller auth and preferences", () => {
    const code = fs.readFileSync("app/actions/enterprise-notifications.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes("if (caller.id !== recipientId) {\n      await requireAdminAccess();\n    }"),
      "Sending notifications to other users requires administrative authorization"
    );
    assert.ok(
      code.includes('.from("user_notification_settings")'),
      "Must check recipient channel preferences"
    );
    assert.ok(
      code.includes('.from("notification_deliveries")') &&
      code.includes('.insert(deliveriesToInsert)'),
      "Must log delivery telemetry in notification_deliveries"
    );
  });

  it("super-admin-broadcasts.ts superAdminTerminateBroadcast terminates room and logs audit event", () => {
    const code = fs.readFileSync("app/actions/super-admin-broadcasts.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes("superAdminTerminateBroadcast") &&
      code.includes("await requireSuperAdmin();"),
      "Broadcast termination requires Super Admin"
    );
    assert.ok(
      code.includes("deleteRoom(broadcast.room_name)"),
      "Must instruct LiveKit SFU to delete room"
    );
    assert.ok(
      code.includes("status: \"ended\""),
      "Must set broadcast status to ended"
    );
  });
});
