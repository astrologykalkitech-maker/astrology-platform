import { NextRequest, NextResponse } from "next/server";
import {
  validateCoordinates,
  normalizeReverseGeocodeResult,
  reverseGeocodeCache,
  type OlaReverseGeocodeResult,
} from "@/lib/location/ola-maps";

export const dynamic = "force-dynamic";

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
    const { searchParams } = new URL(request.url);
    const latStr = searchParams.get("lat");
    const lngStr = searchParams.get("lng");

    const validation = validateCoordinates(latStr, lngStr);
    if (!validation.valid || validation.lat === undefined || validation.lng === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error || "Valid 'lat' and 'lng' query parameters are required.",
          result: null,
        },
        { status: 400 }
      );
    }

    const { lat, lng } = validation;

    // High-performance Bounded LRU Cache lookup (~11m spatial bucket)
    const coordKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const cached = reverseGeocodeCache.get(coordKey);
    if (cached) {
      return NextResponse.json(
        {
          success: true,
          result: cached,
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "public, max-age=600, stale-while-revalidate=1200",
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
          result: null,
        },
        { status: 500 }
      );
    }

    // Build upstream Ola Maps reverse-geocode URL securely
    const upstreamUrl = new URL("https://api.olamaps.io/places/v1/reverse-geocode");
    upstreamUrl.searchParams.set("latlng", `${lat},${lng}`);
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
          error: isAbort ? "Request to Ola Maps reverse geocoding timed out." : "Network error contacting Ola Maps.",
          result: null,
        },
        { status: isAbort ? 504 : 502 }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!upstreamRes.ok) {
      const status = upstreamRes.status;
      let safeError = "Failed to reverse geocode coordinates.";

      if (status === 400) {
        safeError = "Invalid coordinates sent to Ola Maps.";
      } else if (status === 401) {
        safeError = "Ola Maps authentication failed: invalid API key.";
      } else if (status === 403) {
        safeError = "Ola Maps access forbidden or domain unauthorized.";
      } else if (status === 429) {
        safeError = "Ola Maps rate limit exceeded. Please try again shortly.";
      } else if (status >= 500) {
        safeError = "Ola Maps reverse geocoding service is temporarily unavailable.";
      }

      return NextResponse.json(
        {
          success: false,
          error: safeError,
          status,
          result: null,
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
          error: "Malformed response received from Ola Maps reverse geocoding.",
          result: null,
        },
        { status: 502 }
      );
    }

    const data = payload as {
      results?: OlaReverseGeocodeResult[];
      error_message?: string;
    };

    if (data.error_message && (!data.results || data.results.length === 0)) {
      return NextResponse.json(
        {
          success: false,
          error: data.error_message || "Ola Maps returned an error message.",
          result: null,
        },
        { status: 502 }
      );
    }

    const firstResult = Array.isArray(data.results) && data.results.length > 0 ? data.results[0] : null;

    if (!firstResult) {
      return NextResponse.json(
        {
          success: false,
          error: "No address found for the provided coordinates.",
          result: {
            formatted_address: `Coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
            name: "Current Location",
            city: "",
            state: "",
            country: "India",
            latitude: lat,
            longitude: lng,
            source: "geolocation",
          },
        },
        { status: 200 }
      );
    }

    const normalized = normalizeReverseGeocodeResult(firstResult, lat, lng);

    // Populate bounded LRU cache
    reverseGeocodeCache.set(coordKey, normalized);

    return NextResponse.json(
      {
        success: true,
        result: normalized,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, max-age=600, stale-while-revalidate=1200",
          "X-Cache": "MISS",
        },
      }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Internal server error occurred.",
        result: null,
      },
      { status: 500 }
    );
  }
}

