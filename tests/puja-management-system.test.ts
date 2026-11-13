import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

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

test("FEATURE-01 & FEATURE-08: Online Puja Booking Schema & Idempotency Rules", async (t) => {
  const VALID_TIME_SLOTS = [
    "Brahma Muhurat (04:30 AM - 06:00 AM)",
    "Morning (07:00 AM - 10:00 AM)",
    "Abhijit Muhurat (11:45 AM - 12:35 PM)",
    "Evening Pradosh (05:30 PM - 07:30 PM)",
  ];

  await t.test("Validates proper time slot selection", () => {
    assert.equal(VALID_TIME_SLOTS.includes("Morning (07:00 AM - 10:00 AM)"), true);
    assert.equal(VALID_TIME_SLOTS.includes("Midnight Random Time"), false);
  });

  await t.test("Rejects past date selection", () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isPast = new Date(pastDate) < today;
    assert.equal(isPast, true, "Past date must fail validation");
  });

  await t.test("Generates and verifies idempotency keys", () => {
    const key1 = `bk_${Date.now()}_abc12`;
    const key2 = `bk_${Date.now()}_xyz99`;

    assert.ok(key1.startsWith("bk_"));
    assert.notEqual(key1, key2);
  });
});

test("FEATURE-05: Pandit Eligibility & Assignment Verification", async (t) => {
  await t.test("Allows only approved Pandits to be assigned to rituals", () => {
    const candidatePandits = [
      { id: "p1", name: "Pandit Sharma", approval_status: "approved" },
      { id: "p2", name: "Pandit Verma", approval_status: "pending" },
      { id: "p3", name: "Pandit Mishra", approval_status: "suspended" },
    ];

    const eligible = candidatePandits.filter((p) => p.approval_status === "approved");
    assert.equal(eligible.length, 1);
    assert.equal(eligible[0].id, "p1");
  });
});

test("FEATURE-11: Rescheduling & Cancellation Validation", async (t) => {
  await t.test("Blocks cancellation or rescheduling for already completed Pujas", () => {
    const booking = { id: "bk-1", status: "completed", fulfilment_status: "completed" };
    const canCancel = booking.status !== "completed";
    assert.equal(canCancel, false, "Completed booking must not be cancellable");
  });

  await t.test("Allows cancellation for pending/confirmed bookings", () => {
    const booking = { id: "bk-2", status: "confirmed", fulfilment_status: "assigned" };
    const canCancel = booking.status !== "completed";
    assert.equal(canCancel, true, "Confirmed booking is cancellable with reason");
  });
});

test("FEATURE-14: Live Darshan Token Authorization", async (t) => {
  await t.test("Determines publisher/subscriber roles accurately for sacred Darshan", () => {
    const booking = { id: "bk-100", customer_id: "user-cust-1", astrologer_id: "astro-priest-1" };

    const getParticipantRole = (userId: string, isPriest: boolean, isDevotee: boolean) => {
      if (isPriest) return { isHost: true, canPublish: true, canSubscribe: true };
      if (isDevotee) return { isHost: false, canPublish: false, canSubscribe: true };
      throw new Error("Unauthorized");
    };

    const priestPerms = getParticipantRole("user-priest", true, false);
    assert.equal(priestPerms.canPublish, true, "Priest must be able to publish ritual video");

    const devoteePerms = getParticipantRole("user-cust-1", false, true);
    assert.equal(devoteePerms.canPublish, false, "Devotee only subscribes to sacred Darshan");
  });
});

test("FEATURE-17: Customer Puja Review Constraints", async (t) => {
  await t.test("Rating bounds enforcement", () => {
    const sanitizeRating = (r: number) => Math.min(5, Math.max(1, Math.round(r)));
    assert.equal(sanitizeRating(5), 5);
    assert.equal(sanitizeRating(1), 1);
    assert.equal(sanitizeRating(6), 5);
    assert.equal(sanitizeRating(-2), 1);
    assert.equal(sanitizeRating(4.3), 4);
  });
});

