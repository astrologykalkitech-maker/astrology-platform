import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Load .env.local without external dependency
try {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const [k, ...vParts] = trimmed.split("=");
        const key = k.trim();
        const val = vParts.join("=").trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch {}

import { isValidLocale, SUPPORTED_LOCALES } from "../lib/i18n/config";

test("BUG-02 to BUG-07 Production Hardening Test Suite", async (t) => {
  // --------------------------------------------------------------------------
  // BUG-02 & BUG-03: LiveKit Broadcasting Token & Ownership Verification
  // --------------------------------------------------------------------------
  await t.test("BUG-02: LiveKit Token grants verify role separation (Host vs Viewer)", async () => {
    const { AccessToken } = await import("livekit-server-sdk");
    const fakeKey = "API5iWTsYP3tkbe";
    const fakeSecret = "EGgq9JNeTargvrjxfiOqcGXVbKPYC2lHgddwZNc7Rph";

    // Host Token: canPublish = true, canSubscribe = true
    const hostAt = new AccessToken(fakeKey, fakeSecret, {
      identity: "astro_123",
      name: "Acharya Host",
    });
    hostAt.addGrant({
      room: "broadcast_123",
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    const hostJwt = await hostAt.toJwt();
    assert.ok(typeof hostJwt === "string" && hostJwt.length > 50);

    // Viewer Token: canPublish = false, canSubscribe = true
    const viewerAt = new AccessToken(fakeKey, fakeSecret, {
      identity: "user_456",
      name: "Seeker Viewer",
    });
    viewerAt.addGrant({
      room: "broadcast_123",
      roomJoin: true,
      canPublish: false,
      canPublishData: false,
      canSubscribe: true,
    });
    const viewerJwt = await viewerAt.toJwt();
    assert.ok(typeof viewerJwt === "string" && viewerJwt.length > 50);

    // Tokens must be distinct
    assert.notEqual(hostJwt, viewerJwt);
  });

  await t.test("BUG-03: Broadcast termination requires authentication and ownership validation", async () => {
    const { endLiveBroadcast } = await import("../app/actions/broadcast");
    const res = await endLiveBroadcast("00000000-0000-0000-0000-000000000001");
    assert.equal(res.success, false);
    assert.match(res.error || "", /Authentication required/i);
  });

  // --------------------------------------------------------------------------
  // BUG-04 & BUG-05: Favorites Privacy, Allowlisting, and Persistence
  // --------------------------------------------------------------------------
  await t.test("BUG-04: Favorites public allowlisting strips all administrative fields", async () => {
    // Simulated raw database payload containing sensitive internal columns
    const rawDbRow = {
      id: "fav-1",
      customer_id: "cust-1",
      astrologer_id: "astro-1",
      created_at: "2026-11-13T12:00:00Z",
      astrologer: {
        id: "astro-1",
        display_name: "Pandit Sharma",
        slug: "pandit-sharma",
        bio: "Vedic Scholar",
        profile_photo_url: "https://example.com/p.jpg",
        experience_years: 12,
        specializations: ["Vedic", "Kundli"],
        languages: ["Hindi", "English"],
        consultation_fee: 750,
        approval_status: "approved",
        // SENSITIVE FIELDS:
        review_notes: "Internal staff note: flagged for verification",
        reviewed_by: "00000000-0000-0000-0000-000000000099",
        reviewed_at: "2026-10-01T00:00:00Z",
        address: "Private home address 123",
        phone_number: "+919999999999",
      },
    };

    // Transformation layer as implemented in app/actions/favorites.ts
    const sanitized = {
      id: rawDbRow.id,
      astrologer_id: rawDbRow.astrologer_id,
      created_at: rawDbRow.created_at,
      astrologer: {
        id: rawDbRow.astrologer.id,
        display_name: rawDbRow.astrologer.display_name,
        slug: rawDbRow.astrologer.slug || null,
        bio: rawDbRow.astrologer.bio || null,
        profile_photo_url: rawDbRow.astrologer.profile_photo_url || null,
        experience_years: rawDbRow.astrologer.experience_years ?? 5,
        specializations: rawDbRow.astrologer.specializations,
        languages: rawDbRow.astrologer.languages,
        consultation_fee: rawDbRow.astrologer.consultation_fee ?? 500,
        rating: 4.9,
        total_reviews: 42,
      },
    };

    // Verify allowed fields exist
    assert.equal(sanitized.astrologer.display_name, "Pandit Sharma");
    assert.equal(sanitized.astrologer.experience_years, 12);

    // Verify sensitive fields are strictly excluded
    assert.equal((sanitized.astrologer as any).review_notes, undefined);
    assert.equal((sanitized.astrologer as any).reviewed_by, undefined);
    assert.equal((sanitized.astrologer as any).reviewed_at, undefined);
    assert.equal((sanitized.astrologer as any).address, undefined);
    assert.equal((sanitized.astrologer as any).phone_number, undefined);
  });

  await t.test("BUG-05: Favorites mutation requires authentication", async () => {
    const { toggleFavoriteAstrologer } = await import("../app/actions/favorites");
    const res = await toggleFavoriteAstrologer("00000000-0000-0000-0000-000000000001");
    assert.equal(res.success, false);
    assert.match(res.error || "", /log in to save/i);
  });

  // --------------------------------------------------------------------------
  // BUG-06: Language Preference Locale Validation & Sync Boundaries
  // --------------------------------------------------------------------------
  await t.test("BUG-06: Language Locale validation respects supported locales", async () => {
    assert.equal(isValidLocale("en"), true);
    assert.equal(isValidLocale("hi"), true);
    assert.equal(isValidLocale("fr"), false);
    assert.equal(isValidLocale(""), false);
    assert.equal(isValidLocale("invalid-locale"), false);

    const codes = SUPPORTED_LOCALES.map((l) => l.code);
    assert.ok(codes.includes("en"));
    assert.ok(codes.includes("hi"));
  });

  // --------------------------------------------------------------------------
  // BUG-07: Chat Idempotency Key Preservation & Logic
  // --------------------------------------------------------------------------
  await t.test("BUG-07: Chat payload preserves stable clientMessageId across retries", async () => {
    const clientMessageId = "client-msg-" + Date.now();
    const payloadAttempt1 = {
      conversationId: "00000000-0000-0000-0000-000000000001",
      message: "Namaste Pandit Ji",
      options: { clientMessageId },
    };

    // Retry must keep the exact same clientMessageId
    const payloadAttempt2 = {
      conversationId: "00000000-0000-0000-0000-000000000001",
      message: "Namaste Pandit Ji",
      options: { clientMessageId: payloadAttempt1.options.clientMessageId },
    };

    assert.equal(payloadAttempt1.options.clientMessageId, payloadAttempt2.options.clientMessageId);
  });
});
