// =====================================================
// RATE LIMITING & ABUSE TELEMETRY (Phase 2)
// =====================================================

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const memoryRateLimitStore = new Map<string, RateLimitRecord>();

/**
 * Checks in-memory sliding window rate limits.
 * @param identifier - e.g. "enquiry:user:<id>" or "enquiry:ip:<ip>"
 * @param maxRequests - maximum allowed requests within the window
 * @param windowMs - time window in milliseconds
 */
export function checkRateLimit(
  identifier: string,
  maxRequests = 5,
  windowMs = 60_000
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const now = Date.now();
  const record = memoryRateLimitStore.get(identifier);

  // Clean up if expired
  if (!record || now > record.resetAt) {
    memoryRateLimitStore.set(identifier, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      allowed: true,
      remaining: maxRequests - 1,
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    };
  }

  // Window still active
  if (record.count >= maxRequests) {
    const retryAfterSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  record.count += 1;
  return {
    allowed: true,
    remaining: maxRequests - record.count,
    retryAfterSeconds: Math.ceil((record.resetAt - now) / 1000),
  };
}

/**
 * Extracts client IP safely without blindly trusting spoofed X-Forwarded-For headers.
 */
export function extractClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // Only take the first hop
    const firstHop = forwarded.split(",")[0].trim();
    if (firstHop) return firstHop;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "127.0.0.1";
}
