import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { classifyMediaError } from "../lib/media/permissions";

test("classifyMediaError handles permission denied, device not found, and device busy", () => {
  const denied = classifyMediaError({ name: "NotAllowedError" }, "camera_or_mic");
  assert.equal(denied.issue, "permission_denied");
  assert.match(denied.message, /denied/i);

  const notFound = classifyMediaError({ name: "NotFoundError" }, "microphone");
  assert.equal(notFound.issue, "device_not_found");
  assert.match(notFound.message, /microphone/i);

  const busy = classifyMediaError({ name: "NotReadableError" }, "camera_or_mic");
  assert.equal(busy.issue, "device_in_use");
  assert.match(busy.message, /in use/i);
});

test("AstrologerBroadcastHostClient verifies media permissions before creating DB broadcast row", () => {
  const content = fs.readFileSync(
    path.join(process.cwd(), "components/astrologer/AstrologerBroadcastHostClient.tsx"),
    "utf8"
  );
  const trackIdx = content.indexOf("createLocalTracks(");
  const createIdx = content.indexOf("createLiveBroadcast({");
  assert.ok(trackIdx !== -1 && createIdx !== -1 && trackIdx < createIdx);
  assert.match(content, /classifyMediaError/);
  assert.match(content, /mediaPermissionIssue/);
});

test("VoiceCallProvider handles microphone permission-denied gracefully without killing call", () => {
  const content = fs.readFileSync(
    path.join(process.cwd(), "components/chat/VoiceCallProvider.tsx"),
    "utf8"
  );
  assert.match(content, /classifyMediaError\(micErr,\s*"microphone"\)/);
  assert.match(content, /setIsMuted\(true\)/);
});
