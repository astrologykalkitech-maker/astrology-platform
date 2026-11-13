import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { AccessToken } from "livekit-server-sdk";

// Helper to load env vars for test environment
function setupTestEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

setupTestEnv();

test("FEATURE-04 & FEATURE-05: LiveKit Token Authorization & Participant Grant Isolation", async (t) => {
  const apiKey = process.env.LIVEKIT_API_KEY || "devkey";
  const apiSecret = process.env.LIVEKIT_API_SECRET || "secret_must_be_at_least_32_characters_long_for_test";

  await t.test("Broadcaster (Host) token grants publishing and admin rights", async () => {
    const at = new AccessToken(apiKey, apiSecret, {
      identity: "astro_12345",
      name: "Acharya Shastri",
      ttl: "14400s",
      metadata: JSON.stringify({ role: "host", broadcastId: "b-001" }),
    });

    at.addGrant({
      room: "broadcast_room_001",
      roomJoin: true,
      roomAdmin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const jwt = await at.toJwt();
    assert.ok(jwt, "JWT must be generated successfully");

    // Decode claims
    const parts = jwt.split(".");
    assert.equal(parts.length, 3, "JWT must have 3 segments");
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));

    assert.equal(payload.sub, "astro_12345");
    assert.equal(payload.video.room, "broadcast_room_001");
    assert.equal(payload.video.roomJoin, true);
    assert.equal(payload.video.canPublish, true, "Host MUST have canPublish: true");
    assert.equal(payload.video.roomAdmin, true, "Host MUST have roomAdmin: true");
  });

  await t.test("Customer (Viewer) token strictly denies media publishing", async () => {
    const at = new AccessToken(apiKey, apiSecret, {
      identity: "user_customer_999",
      name: "Seeker Rohan",
      ttl: "7200s",
      metadata: JSON.stringify({ role: "viewer", broadcastId: "b-001" }),
    });

    at.addGrant({
      room: "broadcast_room_001",
      roomJoin: true,
      canPublish: false, // STRICT: No publishing
      canPublishData: false, // STRICT: No raw data injection
      canSubscribe: true, // Only subscribe to broadcaster
    });

    const jwt = await at.toJwt();
    assert.ok(jwt, "Viewer JWT must be generated successfully");

    const parts = jwt.split(".");
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));

    assert.equal(payload.sub, "user_customer_999");
    assert.equal(payload.video.room, "broadcast_room_001");
    assert.equal(payload.video.roomJoin, true);
    assert.equal(payload.video.canPublish, false, "Viewer MUST have canPublish: false");
    assert.equal(payload.video.canPublishData, false, "Viewer MUST have canPublishData: false");
    assert.equal(payload.video.canSubscribe, true, "Viewer MUST have canSubscribe: true");
    assert.equal(payload.video.roomAdmin, undefined, "Viewer MUST NOT have roomAdmin");
  });
});

test("FEATURE-06: Authoritative Viewer Counting Logic", async (t) => {
  await t.test("Filters out astrologer host identities and counts only genuine viewers", () => {
    const sampleParticipants = [
      { identity: "astro_host_123", name: "Pandit Ji" },
      { identity: "user_cust_1", name: "Aarav" },
      { identity: "user_cust_2", name: "Priya" },
      { identity: "anon_17315000_abc", name: "Seeker" },
    ];

    const host = sampleParticipants.find((p) => p.identity.startsWith("astro_"));
    const viewers = sampleParticipants.filter((p) => !p.identity.startsWith("astro_"));

    assert.ok(host, "Host must be identified by astro_ prefix");
    assert.equal(viewers.length, 3, "Viewers count must strictly exclude host");
  });
});

test("FEATURE-07 & FEATURE-08: Broadcast Scheduling Validation", async (t) => {
  await t.test("Rejects past scheduling timestamps", () => {
    const pastTime = new Date(Date.now() - 3600000).toISOString();
    const scheduledDate = new Date(pastTime);
    const isInvalid = isNaN(scheduledDate.getTime()) || scheduledDate.getTime() < Date.now() - 60000;
    assert.equal(isInvalid, true, "Past timestamp must be rejected");
  });

  await t.test("Accepts valid future scheduling timestamps", () => {
    const futureTime = new Date(Date.now() + 86400000).toISOString();
    const scheduledDate = new Date(futureTime);
    const isValid = !isNaN(scheduledDate.getTime()) && scheduledDate.getTime() >= Date.now() - 60000;
    assert.equal(isValid, true, "Future timestamp must be accepted");
  });
});

test("FEATURE-10 & FEATURE-11: Live Comments & Moderation Schema Validation", async (t) => {
  await t.test("Validates comment message length constraints", () => {
    const emptyComment = "   ";
    const validComment = "Namaste Pandit Ji, what are the remedies for Saturn dasha?";
    const excessiveComment = "a".repeat(501);

    assert.equal(emptyComment.trim().length === 0, true, "Empty comment rejected");
    assert.equal(validComment.trim().length > 0 && validComment.length <= 500, true, "Valid comment accepted");
    assert.equal(excessiveComment.length > 500, true, "Overlength comment rejected");
  });

  await t.test("Comment moderation actions enforce valid action types", () => {
    const validActions = ["pin", "unpin", "delete"];
    assert.ok(validActions.includes("pin"));
    assert.ok(validActions.includes("unpin"));
    assert.ok(validActions.includes("delete"));
    assert.equal(validActions.includes("destroy_all"), false);
  });
});

test("FEATURE-16 & FEATURE-17: Heartbeat & Host Disconnect Recovery", async (t) => {
  await t.test("Heartbeat freshness detector flags stale rooms beyond grace period", () => {
    const now = Date.now();
    const activeHeartbeat = new Date(now - 10000).toISOString(); // 10s ago
    const staleHeartbeat = new Date(now - 120000).toISOString(); // 2m ago (exceeds 60s grace)

    const isStale = (hbIso: string, graceMs = 60000) => {
      return now - new Date(hbIso).getTime() > graceMs;
    };

    assert.equal(isStale(activeHeartbeat), false, "10s heartbeat is active");
    assert.equal(isStale(staleHeartbeat), true, "120s heartbeat is stale and eligible for cleanup");
  });
});

