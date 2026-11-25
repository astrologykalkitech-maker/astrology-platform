import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Sub-phase 9.4: Emergency Broadcast & Live Alert Announcements", async (t) => {
  const broadcastPath = path.resolve(process.cwd(), "app/actions/broadcast.ts");
  const enterprisePath = path.resolve(process.cwd(), "app/actions/enterprise-notifications.ts");

  assert.ok(fs.existsSync(broadcastPath), "broadcast.ts must exist");
  assert.ok(fs.existsSync(enterprisePath), "enterprise-notifications.ts must exist");

  const broadcastCode = fs.readFileSync(broadcastPath, "utf-8").replace(/\r\n/g, "\n");
  const enterpriseCode = fs.readFileSync(enterprisePath, "utf-8").replace(/\r\n/g, "\n");

  await t.test("1. Live broadcast termination permits only broadcast owner or Super Admin", () => {
    assert.ok(
      broadcastCode.includes("const isOwner = Boolean(astroProfile && astroProfile.id === broadcast.astrologer_id);"),
      "Must verify if caller is host astrologer"
    );
    assert.ok(
      broadcastCode.includes('isSuperAdmin = profile?.role === "super_admin";'),
      "Must verify if non-owner caller is super_admin"
    );
    assert.ok(
      broadcastCode.includes("if (!isOwner && !isSuperAdmin) {"),
      "Must reject termination if caller is neither owner nor Super Admin"
    );
    assert.ok(
      broadcastCode.includes("await roomService.deleteRoom(broadcast.room_name)"),
      "Emergency termination must authoritatively close LiveKit SFU room"
    );
  });

  await t.test("2. Bulk broadcast notification dispatches require Super Admin authorization", () => {
    assert.ok(
      enterpriseCode.includes("export async function dispatchBulkMultiChannelNotification"),
      "Must export dispatchBulkMultiChannelNotification"
    );
    assert.ok(
      enterpriseCode.includes("await requireSuperAdmin()"),
      "dispatchBulkMultiChannelNotification must require requireSuperAdmin"
    );
    assert.ok(
      enterpriseCode.includes("const uniqueUserIds = [...new Set(recipientUserIds.filter(Boolean))];"),
      "Bulk dispatches must deduplicate recipient IDs"
    );
  });

  await t.test("3. Platform announcement categories and alerts propagate to customer notifications", () => {
    assert.ok(
      enterpriseCode.includes('category: payload.category || "platform_announcement"'),
      "Announcements must categorize as platform_announcement"
    );
    assert.ok(
      enterpriseCode.includes('priority: payload.priority || "normal"'),
      "Must support alert priority tags"
    );
    assert.ok(
      enterpriseCode.includes('sender_type: payload.sender_type || "super_admin"'),
      "Must attribute announcement sender as Super Admin"
    );
  });

  await t.test("4. Multi-path revalidations clear stale broadcast and notification caches", () => {
    assert.ok(
      broadcastCode.includes('revalidatePath("/astrologer/broadcast");') &&
      broadcastCode.includes('revalidatePath("/customer/broadcasts");') &&
      broadcastCode.includes('revalidatePath("/super-admin/broadcasts");'),
      "Broadcast termination must revalidate astrologer, customer, and super-admin portals"
    );
    assert.ok(
      enterpriseCode.includes('revalidatePath("/super-admin/notifications-system");'),
      "Bulk dispatches must revalidate super-admin notifications system"
    );
  });
});
