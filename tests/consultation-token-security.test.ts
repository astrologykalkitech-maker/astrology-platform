import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  generateLiveKitConsultationToken,
  getLiveKitConfig,
  isLiveKitConfigured,
  LiveKitConfigError,
} from "../lib/consultation/token";

const ENV_KEYS = [
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "LIVEKIT_URL",
  "NEXT_PUBLIC_LIVEKIT_URL",
] as const;

function withEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>, fn: () => Promise<void> | void) {
  return async () => {
    const saved: Record<string, string | undefined> = {};
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    Object.assign(process.env, values);
    try {
      await fn();
    } finally {
      for (const key of ENV_KEYS) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    }
  };
}

const TEST_ENV = {
  LIVEKIT_API_KEY: "test-key-not-real",
  LIVEKIT_API_SECRET: "test-secret-not-real-0123456789abcdef",
  NEXT_PUBLIC_LIVEKIT_URL: "wss://example.test.livekit.cloud",
};

test(
  "LiveKit Consultation Token Security: Host receives admin grants and customer does not",
  withEnv(TEST_ENV, async () => {
    const hostToken = await generateLiveKitConsultationToken({
      roomName: "room-abc-123",
      participantIdentity: "astro-456",
      participantName: "Pandit Sharma",
      role: "host",
    });

    assert.equal(hostToken.isHost, true);
    assert.equal(hostToken.roomName, "room-abc-123");
    assert.equal(hostToken.serverUrl, "wss://example.test.livekit.cloud");
    assert.ok(hostToken.token.length > 20);

    const customerToken = await generateLiveKitConsultationToken({
      roomName: "room-abc-123",
      participantIdentity: "cust-789",
      participantName: "Yash Garg",
      role: "customer",
    });

    assert.equal(customerToken.isHost, false);
    assert.equal(customerToken.roomName, "room-abc-123");
    assert.ok(customerToken.token.length > 20);
  })
);

test(
  "LiveKit Consultation Token Security: fails closed when credentials are missing",
  withEnv({}, async () => {
    assert.equal(isLiveKitConfigured(), false);
    assert.throws(() => getLiveKitConfig(), LiveKitConfigError);
    await assert.rejects(
      generateLiveKitConsultationToken({
        roomName: "room-x",
        participantIdentity: "u1",
        participantName: "User",
        role: "customer",
      }),
      LiveKitConfigError
    );
  })
);

test(
  "LiveKit Consultation Token Security: fails closed when only the URL is missing",
  withEnv({ LIVEKIT_API_KEY: "k", LIVEKIT_API_SECRET: "s" }, () => {
    assert.throws(() => getLiveKitConfig(), /LIVEKIT_URL/);
  })
);

test(
  "LiveKit Consultation Token Security: normalises ws/http URL schemes",
  withEnv({ ...TEST_ENV, NEXT_PUBLIC_LIVEKIT_URL: "https://example.test.livekit.cloud" }, () => {
    const cfg = getLiveKitConfig();
    assert.equal(cfg.wsUrl, "wss://example.test.livekit.cloud");
    assert.equal(cfg.httpUrl, "https://example.test.livekit.cloud");
  })
);

test("LiveKit Consultation Token Security: no hardcoded credentials in server sources", () => {
  const root = join(__dirname, "..");
  for (const file of ["lib/consultation/token.ts", "app/actions/consultation-meeting.ts"]) {
    const source = readFileSync(join(root, file), "utf8");
    assert.doesNotMatch(source, /API[A-Za-z0-9]{10,}/, `${file} must not embed a LiveKit API key`);
    assert.doesNotMatch(source, /livekit\.cloud/, `${file} must not hardcode a LiveKit host`);
  }
});
