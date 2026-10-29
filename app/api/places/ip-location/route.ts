import { NextRequest, NextResponse } from "next/server";
import type { NormalizedReverseGeocode } from "@/lib/location/ola-maps";

export const dynamic = "force-dynamic";

// In-memory cache for resolved IP locations to make repeat requests instant (0ms)
const ipCache = new Map<string, { result: NormalizedReverseGeocode; timestamp: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  const cleanIp = ip.trim();
  return (
    cleanIp === "127.0.0.1" ||
    cleanIp === "::1" ||
    cleanIp === "localhost" ||
    cleanIp.startsWith("10.") ||
    cleanIp.startsWith("192.168.") ||
    cleanIp.startsWith("172.16.") ||
    cleanIp.startsWith("172.17.") ||
    cleanIp.startsWith("172.18.") ||
    cleanIp.startsWith("172.19.") ||
    cleanIp.startsWith("172.20.") ||
    cleanIp.startsWith("172.21.") ||
    cleanIp.startsWith("172.22.") ||
    cleanIp.startsWith("172.23.") ||
    cleanIp.startsWith("172.24.") ||
    cleanIp.startsWith("172.25.") ||
    cleanIp.startsWith("172.26.") ||
    cleanIp.startsWith("172.27.") ||
    cleanIp.startsWith("172.28.") ||
    cleanIp.startsWith("172.29.") ||
    cleanIp.startsWith("172.30.") ||
    cleanIp.startsWith("172.31.")
  );
}

/**
 * Resolves the user's approximate location based on IP address headers or upstream geo-IP services.
 * Uses a resilient multi-provider race with high-performance caching so it never hangs or times out.
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Check native Cloudflare edge geolocation headers (instant, 0ms latency)
    const cfCity = request.headers.get("cf-ipcity");
    const cfRegion = request.headers.get("cf-region");
    const cfCountry = request.headers.get("cf-ipcountry");
    const cfLat = request.headers.get("cf-iplatitude");
    const cfLng = request.headers.get("cf-iplongitude");

    if (cfCity && cfCity !== "XX") {
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
        { headers: { "Cache-Control": "private, max-age=600" } }
      );
    }

    // 2. Extract client IP from proxy headers
    const rawForwarded = request.headers.get("x-forwarded-for");
    const clientIpHeader =
      request.headers.get("cf-connecting-ip") ||
      (rawForwarded ? rawForwarded.split(",")[0].trim() : null) ||
      request.headers.get("x-real-ip");

    const clientIp = clientIpHeader && !isPrivateIp(clientIpHeader) ? clientIpHeader.trim() : null;

    // Check in-memory cache
    const cacheKey = clientIp || "self";
    const cached = ipCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(
        { success: true, result: cached.result, source: "cache" },
        { headers: { "Cache-Control": "private, max-age=600" } }
      );
    }

    // 3. Query multiple ultra-fast geo-IP providers in parallel (Promise.any race)
    const fetchWithTimeout = async (url: string, ms = 5000) => {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; JyotishSetu/1.0)" },
        signal: AbortSignal.timeout(ms),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    };

    const providers = [
      // Provider 1: BigDataCloud (Ultra-fast, high-uptime in India, client & IP lookup)
      async (): Promise<NormalizedReverseGeocode> => {
        const url = clientIp
          ? `https://api.bigdatacloud.net/data/reverse-geocode-client?ip=${clientIp}&localityLanguage=en`
          : `https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en`;
        const data = await fetchWithTimeout(url, 4500);
        if (!data || (!data.city && !data.locality)) {
          throw new Error("bigdatacloud failed");
        }
        const city = (data.city || data.locality || "").trim();
        const state = (data.principalSubdivision || "").trim();
        const country = (data.countryName || "India").trim();
        return {
          formatted_address: [city, state, country].filter(Boolean).join(", "),
          name: city,
          city,
          state,
          country,
          postal_code: data.postcode || undefined,
          latitude: Number(data.latitude) || 28.6139,
          longitude: Number(data.longitude) || 77.209,
          source: "geolocation",
        };
      },

      // Provider 2: ipwho.is (Accurate city, region, lat, lng)
      async (): Promise<NormalizedReverseGeocode> => {
        const data = await fetchWithTimeout(clientIp ? `https://ipwho.is/${clientIp}` : `https://ipwho.is/`, 4500);
        if (!data || data.success === false || !data.city) {
          throw new Error("ipwho.is failed");
        }
        const city = data.city.trim();
        const state = (data.region || "").trim();
        const country = (data.country || "India").trim();
        return {
          formatted_address: [city, state, country].filter(Boolean).join(", "),
          name: city,
          city,
          state,
          country,
          postal_code: data.postal,
          latitude: data.latitude || 28.6139,
          longitude: data.longitude || 77.209,
          source: "geolocation",
        };
      },

      // Provider 3: ip-api.com
      async (): Promise<NormalizedReverseGeocode> => {
        const data = await fetchWithTimeout(clientIp ? `http://ip-api.com/json/${clientIp}` : `http://ip-api.com/json`, 4500);
        if (!data || data.status !== "success" || !data.city) {
          throw new Error("ip-api failed");
        }
        const city = data.city.trim();
        const state = (data.regionName || "").trim();
        const country = (data.country || "India").trim();
        return {
          formatted_address: [city, state, country].filter(Boolean).join(", "),
          name: city,
          city,
          state,
          country,
          postal_code: data.zip,
          latitude: data.lat || 28.6139,
          longitude: data.lon || 77.209,
          source: "geolocation",
        };
      },

      // Provider 4: freeipapi.com
      async (): Promise<NormalizedReverseGeocode> => {
        const data = await fetchWithTimeout(clientIp ? `https://freeipapi.com/api/json/${clientIp}` : `https://freeipapi.com/api/json`, 4500);
        if (!data || !data.cityName) {
          throw new Error("freeipapi failed");
        }
        const city = data.cityName.trim();
        const state = (data.regionName || "").trim();
        const country = (data.countryName || "India").trim();
        return {
          formatted_address: [city, state, country].filter(Boolean).join(", "),
          name: city,
          city,
          state,
          country,
          postal_code: data.zipCode,
          latitude: data.latitude || 28.6139,
          longitude: data.longitude || 77.209,
          source: "geolocation",
        };
      },

      // Provider 5: ipapi.co (fallback)
      async (): Promise<NormalizedReverseGeocode> => {
        const data = await fetchWithTimeout(clientIp ? `https://ipapi.co/${clientIp}/json/` : `https://ipapi.co/json/`, 4500);
        if (!data || data.error || !data.city) {
          throw new Error("ipapi.co failed");
        }
        const city = data.city.trim();
        const state = (data.region || "").trim();
        const country = (data.country_name || "India").trim();
        return {
          formatted_address: [city, state, country].filter(Boolean).join(", "),
          name: city,
          city,
          state,
          country,
          postal_code: data.postal,
          latitude: data.latitude || 28.6139,
          longitude: data.longitude || 77.209,
          source: "geolocation",
        };
      },
    ];

    try {
      const result = await Promise.any(providers.map((p) => p()));

      // Save in cache
      ipCache.set(cacheKey, { result, timestamp: Date.now() });

      return NextResponse.json(
        { success: true, result, source: "ip_service" },
        { headers: { "Cache-Control": "private, max-age=600" } }
      );
    } catch {
      // All providers failed or timed out
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
