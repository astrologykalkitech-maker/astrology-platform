import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

describe("Sub-phase C.1: Astrologer Realtime Synchronization Suite", () => {
  it("1. RealtimeAstrologerPortalSync is mounted within PortalShell layout", () => {
    const portalShellPath = path.resolve(
      process.cwd(),
      "components/astrologer/PortalShell.tsx"
    );
    assert.ok(fs.existsSync(portalShellPath), "PortalShell.tsx must exist");
    const code = fs.readFileSync(portalShellPath, "utf-8");

    assert.match(code, /import\s*\{\s*RealtimeAstrologerPortalSync\s*\}\s*from/);
    assert.match(code, /<RealtimeAstrologerPortalSync\s*\/>/);
  });

  it("2. Realtime listener subscribes to relevant operational tables with event debouncing", () => {
    const syncPath = path.resolve(
      process.cwd(),
      "components/astrologer/RealtimeAstrologerPortalSync.tsx"
    );
    assert.ok(fs.existsSync(syncPath), "RealtimeAstrologerPortalSync.tsx must exist");
    const code = fs.readFileSync(syncPath, "utf-8");

    // Subscriptions to canonical tables
    assert.match(code, /table:\s*"customer_bookings"/);
    assert.match(code, /table:\s*"puja_bookings"/);
    assert.match(code, /table:\s*"lead_assignments"/);
    assert.match(code, /table:\s*"consultation_meetings"/);
    assert.match(code, /table:\s*"direct_messages"/);

    // Audio chime integration
    assert.match(code, /soundNotificationService\.playConsultationRequestSound/);
    assert.match(code, /soundNotificationService\.playBookingConfirmedSound/);
    assert.match(code, /soundNotificationService\.playBookingCancelledSound/);
    assert.match(code, /soundNotificationService\.playIncomingVideoCallSound/);

    // Debouncing protection
    assert.match(code, /lastRefreshTimeRef/);
    assert.match(code, /router\.refresh\(\)/);
  });

  it("3. Proper resource cleanup on unmount avoids dangling WebSocket channels", () => {
    const syncPath = path.resolve(
      process.cwd(),
      "components/astrologer/RealtimeAstrologerPortalSync.tsx"
    );
    const code = fs.readFileSync(syncPath, "utf-8");

    assert.match(code, /return\s*\(\)\s*=>\s*\{/);
    assert.match(code, /supabase\.removeChannel\(channel\)/);
    assert.match(code, /window\.removeEventListener/);
    assert.match(code, /document\.removeEventListener/);
  });
});
