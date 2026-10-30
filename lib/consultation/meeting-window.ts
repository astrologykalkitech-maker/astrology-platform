/**
 * Validates whether the consultation join window is currently active.
 * Allows joining 15 minutes before scheduled_at up to duration_minutes + 60 minutes after.
 */
export function isMeetingWindowActive(
  scheduledAt: string,
  durationMinutes: number,
  nowMs = Date.now()
): { allowed: boolean; reason?: string } {
  const scheduledTime = new Date(scheduledAt).getTime();
  if (isNaN(scheduledTime)) {
    return { allowed: false, reason: "Invalid appointment schedule timestamp." };
  }

  const durationMs = (durationMinutes || 30) * 60 * 1000;
  const earliestJoinTime = scheduledTime - 15 * 60 * 1000;
  const latestJoinTime = scheduledTime + durationMs + 60 * 60 * 1000;

  if (nowMs < earliestJoinTime) {
    return {
      allowed: false,
      reason: "Consultation room unlocks 15 minutes before the scheduled Muhurat time.",
    };
  }

  if (nowMs > latestJoinTime) {
    return {
      allowed: false,
      reason: "This consultation appointment window has concluded.",
    };
  }

  return { allowed: true };
}

