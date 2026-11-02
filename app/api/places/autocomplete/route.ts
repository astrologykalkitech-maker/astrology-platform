import { NextRequest, NextResponse } from "next/server";
import {
  type OlaPrediction,
  type NormalizedPlaceSuggestion,
  validateInput,
  normalizeOlaPrediction,
  autocompleteCache,
} from "@/lib/location/ola-maps";
import { checkRateLimit, extractClientIp } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export type { OlaPrediction, NormalizedPlaceSuggestion };

/**
 * Determines the appropriate Origin header to satisfy Ola Maps domain restrictions.
 */
function resolveOrigin(request: NextRequest): string {
  const reqOrigin = request.headers.get("origin");
  if (reqOrigin && reqOrigin !== "null") return reqOrigin;

  const reqReferer = request.headers.get("referer");
  if (reqReferer) {
    try {
      const parsed = new URL(reqReferer);
      return parsed.origin;
    } catch {
      // Fall through to configured site URL
    }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (siteUrl) {
    try {
      const parsed = new URL(siteUrl);
      return parsed.origin;
    } catch {
      return siteUrl;
    }
  }

  const host = request.headers.get("host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto") || "http";
    return `${proto}://${host}`;
  }

  return "http://localhost:3000";
}

export async function GET(request: NextRequest) {
  try {
    // Protect the server-held Ola Maps key/quota from anonymous abuse
    const limit = checkRateLimit(`places-autocomplete:${extractClientIp(request)}`, 90, 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Please slow down.", predictions: [] },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }

    const { searchParams } = new URL(request.url);
    const rawInput = searchParams.get("input") ?? searchParams.get("q");

    const validation = validateInput(rawInput);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error,
          predictions: [],
          suggestions: [],
        },
        { status: validation.status || 400 }
      );
    }

    const { trimmed } = validation;

    // Minimum query length of 2 characters
    if (trimmed.length < 2) {
      return NextResponse.json(
        {
          success: true,
          predictions: [],
          suggestions: [],
        },
        {
          headers: {
            "Cache-Control": "private, no-cache, no-store, must-revalidate",
          },
        }
      );
    }

    // High-performance Bounded LRU Cache lookup (< 1ms latency for popular queries)
    const cacheKey = trimmed.toLowerCase();
    const cached = autocompleteCache.get(cacheKey);
    if (cached) {
      return NextResponse.json(
        {
          success: true,
          predictions: cached.predictions,
          suggestions: cached.suggestions,
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
            "X-Cache": "HIT",
          },
        }
      );
    }

    const apiKey = process.env.OLA_MAPS_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: "Ola Maps API key is not configured on the server.",
          predictions: [],
          suggestions: [],
        },
        { status: 500 }
      );
    }

    // Build upstream Ola Maps request securely
    const upstreamUrl = new URL("https://api.olamaps.io/places/v1/autocomplete");
    upstreamUrl.searchParams.set("input", trimmed);
    upstreamUrl.searchParams.set("api_key", apiKey);

    const requestId = crypto.randomUUID();
    const origin = resolveOrigin(request);

    const controller = new AbortController();
    const timeoutDuration = 6000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutDuration);

    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(upstreamUrl.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Request-Id": requestId,
          Origin: origin,
          Referer: `${origin}/`,
        },
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (fetchErr: unknown) {
      clearTimeout(timeoutId);
      const isAbort = fetchErr instanceof Error && fetchErr.name === "AbortError";
      return NextResponse.json(
        {
          success: false,
          error: isAbort ? "Request to Ola Maps timed out." : "Network error contacting Ola Maps service.",
          predictions: [],
          suggestions: [],
        },
        { status: isAbort ? 504 : 502 }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    // Handle upstream HTTP errors gracefully
    if (!upstreamRes.ok) {
      const status = upstreamRes.status;
      let safeError = "Failed to fetch predictions from Ola Maps.";

      if (status === 400) {
        safeError = "Invalid request sent to Ola Maps.";
      } else if (status === 401) {
        safeError = "Ola Maps authentication failed: invalid API key.";
      } else if (status === 403) {
        safeError = "Ola Maps access forbidden or domain unauthorized.";
      } else if (status === 429) {
        safeError = "Ola Maps rate limit exceeded. Please try again shortly.";
      } else if (status >= 500) {
        safeError = "Ola Maps upstream service is temporarily unavailable.";
      }

      return NextResponse.json(
        {
          success: false,
          error: safeError,
          status,
          predictions: [],
          suggestions: [],
        },
        { status: status === 429 ? 429 : status >= 500 ? 502 : status }
      );
    }

    let payload: unknown;
    try {
      payload = await upstreamRes.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Malformed JSON response received from Ola Maps.",
          predictions: [],
          suggestions: [],
        },
        { status: 502 }
      );
    }

    if (!payload || typeof payload !== "object") {
      return NextResponse.json(
        {
          success: false,
          error: "Unexpected response format received from Ola Maps.",
          predictions: [],
          suggestions: [],
        },
        { status: 502 }
      );
    }

    const data = payload as {
      predictions?: OlaPrediction[];
      status?: string;
      error_message?: string;
    };

    if (data.error_message && !Array.isArray(data.predictions)) {
      return NextResponse.json(
        {
          success: false,
          error: data.error_message || "Ola Maps returned an error message.",
          predictions: [],
          suggestions: [],
        },
        { status: 502 }
      );
    }

    const predictions = Array.isArray(data.predictions) ? data.predictions : [];
    const suggestions: NormalizedPlaceSuggestion[] = predictions.map((p, index) =>
      normalizeOlaPrediction(p, index)
    );

    // Populate bounded LRU cache for future instant responses
    if (predictions.length > 0) {
      autocompleteCache.set(cacheKey, { predictions, suggestions });
    }

    return NextResponse.json(
      {
        success: true,
        predictions,
        suggestions,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
          "X-Cache": "MISS",
        },
      }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Internal server error occurred.",
        predictions: [],
        suggestions: [],
      },
      { status: 500 }
    );
  }
}
