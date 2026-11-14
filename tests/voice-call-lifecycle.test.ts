import test from "node:test";
import assert from "node:assert/strict";
import {
  getVoiceCallCommissionBookingId,
  getVoiceCallDurationSeconds,
  isLiveVoiceCallStatus,
  isVoiceCallRingExpired,
} from "../lib/chat/voice-call";
import type { VoiceCall } from "../lib/types/database.types";
import fs from "node:fs";
import path from "node:path";

const sampleCall: VoiceCall = {
  id: "call-1",
  conversation_id: "conversation-1",
  caller_id: "customer-1",
  callee_id: "astrologer-1",
  caller_role: "customer",
  callee_role: "astrologer",
  caller_name: "Customer",
  callee_name: "Astrologer",
  room_name: "voice-room-1",
  status: "ringing",
  started_at: null,
  ended_at: null,
  duration_seconds: 0,
  ended_by: null,
  end_reason: null,
  created_at: "2026-11-03T00:00:00.000Z",
  updated_at: "2026-11-03T00:00:00.000Z",
};

test("Voice call lifecycle only treats ringing, accepted, and active calls as live", () => {
  assert.equal(isLiveVoiceCallStatus("ringing"), true);
  assert.equal(isLiveVoiceCallStatus("accepted"), true);
  assert.equal(isLiveVoiceCallStatus("active"), true);
  assert.equal(isLiveVoiceCallStatus("declined"), false);
  assert.equal(isLiveVoiceCallStatus("ended"), false);
});

test("Voice call ring timeout expires unanswered calls after 45 seconds", () => {
  assert.equal(isVoiceCallRingExpired(sampleCall, Date.parse(sampleCall.created_at) + 44_999), false);
  assert.equal(isVoiceCallRingExpired(sampleCall, Date.parse(sampleCall.created_at) + 45_000), true);
  assert.equal(
    isVoiceCallRingExpired({ ...sampleCall, status: "active" }, Date.parse(sampleCall.created_at) + 60_000),
    false
  );
});

test("Voice call duration uses the persisted start and end times", () => {
  const started = "2026-11-03T00:00:00.000Z";
  assert.equal(getVoiceCallDurationSeconds({ ...sampleCall, started_at: started }, Date.parse(started) + 65_000), 65);
  assert.equal(
    getVoiceCallDurationSeconds(
      { ...sampleCall, status: "ended", started_at: started, ended_at: "2026-11-03T00:01:10.000Z" },
      Date.parse("2026-11-03T00:02:00.000Z")
    ),
    70
  );
});

test("Voice-call commission reconciliation requires a linked booking and a completed call duration", () => {
  assert.equal(getVoiceCallCommissionBookingId(null, 60), null);
  assert.equal(getVoiceCallCommissionBookingId("booking-1", 0), null);
  assert.equal(getVoiceCallCommissionBookingId("booking-1", 60), "booking-1");
  assert.equal(getVoiceCallCommissionBookingId("booking-1", 1.5), null);
});

test("Voice call database migration limits read access to call participants and enables realtime", () => {
  const migration = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/030_direct_voice_calls.sql"),
    "utf8"
  );
  assert.match(migration, /caller_id = \(select auth\.uid\(\)\) or callee_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /revoke insert, update, delete on public\.voice_calls from anon, authenticated/i);
  assert.match(migration, /alter publication supabase_realtime add table public\.voice_calls/i);
  assert.match(migration, /where status in \('ringing', 'accepted', 'active'\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
});
