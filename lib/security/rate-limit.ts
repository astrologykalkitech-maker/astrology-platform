import { isIP } from "node:net";

// =====================================================
// RATE LIMITING & ABUSE TELEMETRY
// =====================================================
//
// Dual-mode rate limiting architecture:
// 1. Distributed Mode: Automatically activates when UPSTASH_REDIS_REST_URL and
//    UPSTASH_REDIS_REST_TOKEN are set in environment. Performs atomic HTTP REST
//    increments with TTL to guarantee multi-instance cluster enforcement.
// 2. Safe Fallback Mode: When distributed storage is unconfigured or encounters a
//    network timeout, immediately and safely falls back to local in-memory sliding
//    window protection. Fails open to the in-memory fallback with warning telemetry
//    to ensure an external Redis outage never takes down the entire payment platform.

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
  backend: "redis" | "memory";
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
 * Reports whether distributed Redis rate limiting is configured in environment.
 */
export function isDistributedRateLimitingConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

/**
 * Synchronous in-memory sliding window rate limit check.
 * @param identifier - e.g. "enquiry:user:<id>" or "enquiry:ip:<ip>"
 * @param maxRequests - maximum allowed requests within the window
 * @param windowMs - time window in milliseconds
 */
export function checkRateLimit(
  identifier: string,
  maxRequests = 5,
  windowMs = 60_000
): RateLimitResult {
  pruneExpiredEntries();

  const now = Date.now();
  const record = memoryRateLimitStore.get(identifier);

  // Clean up if expired
  if (!record || now > record.resetAt) {
    const resetAt = now + windowMs;
    memoryRateLimitStore.set(identifier, {
      count: 1,
      resetAt,
    });
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetAt,
      retryAfterSeconds: Math.ceil(windowMs / 1000),
      backend: "memory",
    };
  }

  // Window still active
  if (record.count >= maxRequests) {
    const retryAfterSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      resetAt: record.resetAt,
      retryAfterSeconds,
      backend: "memory",
    };
  }

  record.count += 1;
  return {
    allowed: true,
    remaining: maxRequests - record.count,
    resetAt: record.resetAt,
    retryAfterSeconds: Math.ceil((record.resetAt - now) / 1000),
    backend: "memory",
  };
}

/**
 * Asynchronous rate limit check supporting distributed Redis with seamless in-memory fallback.
 * Uses atomic Redis EVAL script (increment + expire) when Upstash Redis is configured.
 */
export async function checkRateLimitAsync(
  identifier: string,
  maxRequests = 5,
  windowMs = 60_000
): Promise<RateLimitResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    try {
      const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
      // Atomic Lua script: increment key and set expire on first call
      const luaScript = `
        local current = redis.call('INCR', KEYS[1])
        if tonumber(current) == 1 then
          redis.call('EXPIRE', KEYS[1], ARGV[1])
        end
        local ttl = redis.call('TTL', KEYS[1])
        return {current, ttl}
      `;

      const response = await fetch(`${url}/eval`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          script: luaScript,
          keys: [`rl:${identifier}`],
          args: [windowSeconds.toString()],
        }),
        signal: AbortSignal.timeout(1500), // Strict 1.5s timeout for distributed check
      });

      if (response.ok) {
        const json = await response.json();
        const result = json.result;
        if (Array.isArray(result) && result.length >= 2) {
          const currentCount = Number(result[0]);
          const ttlSeconds = Math.max(1, Number(result[1]));
          const now = Date.now();
          const resetAt = now + ttlSeconds * 1000;

          if (currentCount > maxRequests) {
            return {
              allowed: false,
              remaining: 0,
              resetAt,
              retryAfterSeconds: ttlSeconds,
              backend: "redis",
            };
          }

          return {
            allowed: true,
            remaining: Math.max(0, maxRequests - currentCount),
            resetAt,
            retryAfterSeconds: ttlSeconds,
            backend: "redis",
          };
        }
      }
      console.warn("[RateLimit Warning] Distributed Redis returned non-200. Falling back to local in-memory store.");
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn("[RateLimit Warning] Distributed Redis check failed/timed out. Falling back to local in-memory store:", errorMsg);
    }
  } else if (process.env.NODE_ENV === "production" && process.env.STRICT_FINANCIAL_RATE_LIMIT === "true") {
    // Production fail-closed gate for critical financial endpoints when distributed Redis is missing
    console.error("[RateLimit Critical] Production distributed Redis is not configured. Failing closed for critical financial action.");
    return {
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + windowMs,
      retryAfterSeconds: Math.ceil(windowMs / 1000),
      backend: "memory",
    };
  }

  // Safe fallback to local in-memory rate limiter
  return checkRateLimit(identifier, maxRequests, windowMs);
}

/**
 * Extracts the client IP safely.
 *
 * Security considerations:
 * - CF-Connecting-IP / x-real-ip is validated by trusted CDNs.
 * - X-Forwarded-For: rightmost entry is the nearest trusted proxy's record.
 * - Sanitizes formatting to prevent header injection.
 */
export function extractClientIp(request: Request): string {
  return extractClientIpFromHeaders(request.headers);
}

/**
 * Extracts client IP from a bare Headers object.
 */
export function extractClientIpFromHeaders(requestHeaders: { get(name: string): string | null }): string {
  // Cloudflare / most CDNs set this header reliably
  const cfConnecting = requestHeaders.get("cf-connecting-ip");
  if (cfConnecting) {
    const clean = cfConnecting.trim();
    if (isValidIp(clean)) return clean;
  }

  // Vercel sets x-real-ip after validation
  const realIp = requestHeaders.get("x-real-ip");
  if (realIp) {
    const clean = realIp.trim();
    if (isValidIp(clean)) return clean;
  }

  // X-Forwarded-For: rightmost entry is nearest trusted proxy
  const forwarded = requestHeaders.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length > 0) {
      const rightmost = hops[hops.length - 1];
      if (isValidIp(rightmost)) return rightmost;
    }
  }

  return "127.0.0.1";
}

/**
 * Generates an anonymous bucket key using client IP or a deterministic unidentifiable fallback.
 * Prevents colliding unrelated clients whose headers are completely missing into 127.0.0.1.
 */
export function getAnonymousClientIdentifier(request: Request, prefix = "anon"): string {
  const ip = extractClientIp(request);
  if (ip && ip !== "127.0.0.1") {
    return `${prefix}:ip:${ip}`;
  }
  // If IP is 127.0.0.1 or undetectable, incorporate user-agent hash to prevent global bucket starvation
  const ua = request.headers.get("user-agent") || "unknown-client";
  let hash = 0;
  for (let i = 0; i < ua.length; i++) {
    hash = (hash << 5) - hash + ua.charCodeAt(i);
    hash |= 0;
  }
  return `${prefix}:client:${ip}:${Math.abs(hash)}`;
}

/**
 * Validates IPv4 or IPv6 string format using node:net isIP to reject forged or malformed headers.
 */
function isValidIp(ip: string): boolean {
  if (!ip || ip.length > 45) return false;
  return isIP(ip) !== 0;
}
