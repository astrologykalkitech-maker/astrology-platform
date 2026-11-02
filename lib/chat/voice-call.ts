import type { VoiceCall, VoiceCallStatus } from "@/lib/types/database.types";

export const LIVE_VOICE_CALL_STATUSES: VoiceCallStatus[] = [
  "ringing",
  "accepted",
  "active",
];
export const VOICE_CALL_RING_TIMEOUT_MS = 45_000;
export const VOICE_CALL_STALE_TIMEOUT_MS = 60_000;

export function isLiveVoiceCallStatus(status: VoiceCallStatus) {
  return LIVE_VOICE_CALL_STATUSES.includes(status);
}

export function isVoiceCallRingExpired(call: VoiceCall, now = Date.now()) {
  return (
    call.status === "ringing" &&
    now - new Date(call.created_at).getTime() >= VOICE_CALL_RING_TIMEOUT_MS
  );
}

export function getVoiceCallDurationSeconds(call: VoiceCall, now = Date.now()) {
  if (!call.started_at) return 0;
  const endTime = call.ended_at ? new Date(call.ended_at).getTime() : now;
  return Math.max(0, Math.floor((endTime - new Date(call.started_at).getTime()) / 1000));
}
