// =====================================================
// RATE LIMITING & ABUSE TELEMETRY
// =====================================================
//
// IMPORTANT DEPLOYMENT NOTE:
// The current implementation uses a process-local in-memory store.
// This is sufficient for single-instance deployments.
//
// For multi-instance deployments (Vercel, Railway, ECS, etc.) this store
// is NOT shared between instances. Each instance maintains independent counters,
// which means an attacker can exceed the limit by routing requests across
// different instances.
//
// TO UPGRADE FOR MULTI-INSTANCE PRODUCTION:
// Replace the memoryRateLimitStore with a distributed store such as:
//   - Upstash Redis (recommended for Vercel/serverless): https://upstash.com
//   - @upstash/ratelimit library for atomic increment-and-expire semantics
//   - Redis via ioredis for traditional infrastructure
//
// Until a shared store is configured, rate limiting provides abuse deterrence
// for single-instance deployments but is NOT a hard security boundary.

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const memoryRateLimitStore = new Map<string, RateLimitRecord>();

// Prevent unbounded memory growth: purge expired entries periodically
let lastCleanupAt = Date.now();
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function pruneExpiredEntries(): void {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;
  for (const [key, record] of memoryRateLimitStore) {
    if (now > record.resetAt) {
      memoryRateLimitStore.delete(key);
    }
  }
}

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
  pruneExpiredEntries();

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
 * Extracts the client IP safely.
 *
 * Security considerations:
 * - X-Forwarded-For is a comma-separated list of IPs added by each proxy.
 * - The LAST entry before the trusted proxy is the client's real IP.
 * - However, without knowing exactly how many proxies are in the chain,
 *   we cannot safely strip all appended IPs.
 * - For Vercel/Cloudflare deployments, CF-Connecting-IP / x-real-ip is
 *   the most reliable option since the CDN validates it.
 * - Taking the LAST non-empty X-Forwarded-For value (rightmost) is safer
 *   than taking the first, since the rightmost entry is added by the most
 *   recently traversed trusted proxy, while the leftmost can be spoofed.
 *
 * For production hardening with a known proxy chain, configure the number
 * of trusted proxies and strip that many hops from the right.
 */
export function extractClientIp(request: Request): string {
  return extractClientIpFromHeaders(request.headers);
}

/**
 * Same as extractClientIp but works with a bare Headers object (e.g. `await headers()`
 * inside a server action, where no Request is available).
 */
export function extractClientIpFromHeaders(requestHeaders: { get(name: string): string | null }): string {
  // Cloudflare / most CDNs set this header reliably
  const cfConnecting = requestHeaders.get("cf-connecting-ip");
  if (cfConnecting) return cfConnecting.trim();

  // Vercel sets x-real-ip after validation
  const realIp = requestHeaders.get("x-real-ip");
  if (realIp) return realIp.trim();

  // X-Forwarded-For: rightmost entry is the nearest trusted proxy's record
  // of where the request came from — safer than leftmost which can be forged.
  const forwarded = requestHeaders.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length > 0) {
      // Use rightmost entry (least likely to be spoofed)
      const rightmost = hops[hops.length - 1];
      if (rightmost) return rightmost;
    }
  }

  return "127.0.0.1";
}
