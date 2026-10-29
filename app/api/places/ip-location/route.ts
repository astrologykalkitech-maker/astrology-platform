import { NextRequest, NextResponse } from "next/server";
import type { NormalizedReverseGeocode } from "@/lib/location/ola-maps";

export const dynamic = "force-dynamic";

/**
 * Resolves the user's approximate location based on IP address headers or upstream geo-IP services.
 * Serves as a deterministic, resilient fallback when device GPS/hardware geolocation
 * times out or is unavailable on laptops/PCs without GPS chips.
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Check native Cloudflare edge geolocation headers (instant, 0ms latency)
    const cfCity = request.headers.get("cf-ipcity");
    const cfRegion = request.headers.get("cf-region");
    const cfCountry = request.headers.get("cf-ipcountry");
    const cfLat = request.headers.get("cf-iplatitude");
    const cfLng = request.headers.get("cf-iplongitude");

    if (cfCity) {
      const city = cfCity.trim();
      const state = (cfRegion || "").trim();
      const country = (cfCountry || "India").trim();
      const latitude = cfLat ? parseFloat(cfLat) : 28.6139;
      const longitude = cfLng ? parseFloat(cfLng) : 77.209;

      const formatted = [city, state, country].filter(Boolean).join(", ");
      const result: NormalizedReverseGeocode = {
        formatted_address: formatted,
        name: city,
        city,
        state,
        country,
        latitude,
        longitude,
        source: "geolocation",
      };

      return NextResponse.json(
        { success: true, result, source: "cloudflare_edge" },
        {
          headers: {
            "Cache-Control": "private, max-age=300",
          },
        }
      );
    }

    // 2. Fallback for localhost / local networks without Cloudflare headers
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    try {
      const res = await fetch("https://ipapi.co/json/", {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; JyotishSetu/1.0)",
        },
        signal: controller.signal,
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.city && !data.error) {
          const city = data.city;
          const state = data.region || "";
          const country = data.country_name || "India";
          const latitude = data.latitude || 28.6139;
          const longitude = data.longitude || 77.209;
          const postalCode = data.postal || undefined;

          const formatted = [city, state, country].filter(Boolean).join(", ");
          const result: NormalizedReverseGeocode = {
            formatted_address: formatted,
            name: city,
            city,
            state,
            country,
            postal_code: postalCode,
            latitude,
            longitude,
            source: "geolocation",
          };

          return NextResponse.json(
            { success: true, result, source: "ip_service" },
            {
              headers: {
                "Cache-Control": "private, max-age=300",
              },
            }
          );
        }
      }
    } catch {
      // Graceful fallback below
    } finally {
      clearTimeout(timeoutId);
    }

    return NextResponse.json(
      {
        success: false,
        error: "Unable to detect IP location.",
        result: null,
      },
      { status: 404 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "IP location resolution failed.",
        result: null,
      },
      { status: 500 }
    );
  }
}

