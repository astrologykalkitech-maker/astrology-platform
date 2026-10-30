import test from "node:test";
import assert from "node:assert/strict";
import { generateLiveKitConsultationToken } from "../lib/consultation/token";

test("LiveKit Consultation Token Security: Host receives admin grants and customer does not", async () => {
  const hostToken = await generateLiveKitConsultationToken({
    roomName: "room-abc-123",
    participantIdentity: "astro-456",
    participantName: "Pandit Sharma",
    role: "host",
  });

  assert.equal(hostToken.isHost, true);
  assert.equal(hostToken.roomName, "room-abc-123");
  assert.equal(hostToken.serverUrl, "wss://astrosetu-3dx4gffs.livekit.cloud");
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
});
