import { NextRequest, NextResponse } from "next/server";
import { normalizeOlaPrediction, type OlaPrediction } from "@/lib/location/ola-maps";
import { checkRateLimit, extractClientIp } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export interface LocationSuggestion {
  id: string;
  name: string;
  state?: string;
  country: string;
  formatted: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  place_id?: string;
}

// Embedded high-accuracy database of major Indian cities, pilgrimage centers,
// state capitals, and top international destinations for astrology patrons.
// Used as deterministic fallback when offline, rate-limited, or for instant matching.
const EMBEDDED_LOCATIONS: LocationSuggestion[] = [
  // Spiritual & Pilgrimage Centers (India)
  { id: "emb-1", name: "Varanasi", state: "Uttar Pradesh", country: "India", formatted: "Varanasi, Uttar Pradesh, India", latitude: 25.3176, longitude: 82.9739, timezone: "Asia/Kolkata" },
  { id: "emb-2", name: "Haridwar", state: "Uttarakhand", country: "India", formatted: "Haridwar, Uttarakhand, India", latitude: 29.9457, longitude: 78.1642, timezone: "Asia/Kolkata" },
  { id: "emb-3", name: "Rishikesh", state: "Uttarakhand", country: "India", formatted: "Rishikesh, Uttarakhand, India", latitude: 30.0869, longitude: 78.2676, timezone: "Asia/Kolkata" },
  { id: "emb-4", name: "Ayodhya", state: "Uttar Pradesh", country: "India", formatted: "Ayodhya, Uttar Pradesh, India", latitude: 26.7922, longitude: 82.1998, timezone: "Asia/Kolkata" },
  { id: "emb-5", name: "Prayagraj", state: "Uttar Pradesh", country: "India", formatted: "Prayagraj, Uttar Pradesh, India", latitude: 25.4358, longitude: 81.8463, timezone: "Asia/Kolkata" },
  { id: "emb-6", name: "Mathura", state: "Uttar Pradesh", country: "India", formatted: "Mathura, Uttar Pradesh, India", latitude: 27.4924, longitude: 77.6737, timezone: "Asia/Kolkata" },
  { id: "emb-7", name: "Vrindavan", state: "Uttar Pradesh", country: "India", formatted: "Vrindavan, Uttar Pradesh, India", latitude: 27.5806, longitude: 77.7006, timezone: "Asia/Kolkata" },
  { id: "emb-8", name: "Ujjain", state: "Madhya Pradesh", country: "India", formatted: "Ujjain, Madhya Pradesh, India", latitude: 23.1765, longitude: 75.7885, timezone: "Asia/Kolkata" },
  { id: "emb-9", name: "Puri", state: "Odisha", country: "India", formatted: "Puri, Odisha, India", latitude: 19.8135, longitude: 85.8312, timezone: "Asia/Kolkata" },
  { id: "emb-10", name: "Tirupati", state: "Andhra Pradesh", country: "India", formatted: "Tirupati, Andhra Pradesh, India", latitude: 13.6288, longitude: 79.4192, timezone: "Asia/Kolkata" },
  { id: "emb-11", name: "Madurai", state: "Tamil Nadu", country: "India", formatted: "Madurai, Tamil Nadu, India", latitude: 9.9252, longitude: 78.1198, timezone: "Asia/Kolkata" },
  { id: "emb-12", name: "Kanchipuram", state: "Tamil Nadu", country: "India", formatted: "Kanchipuram, Tamil Nadu, India", latitude: 12.8342, longitude: 79.7036, timezone: "Asia/Kolkata" },
  { id: "emb-13", name: "Rameswaram", state: "Tamil Nadu", country: "India", formatted: "Rameswaram, Tamil Nadu, India", latitude: 9.2876, longitude: 79.3129, timezone: "Asia/Kolkata" },
  { id: "emb-14", name: "Gaya", state: "Bihar", country: "India", formatted: "Gaya, Bihar, India", latitude: 24.7914, longitude: 85.0002, timezone: "Asia/Kolkata" },
  { id: "emb-15", name: "Dwarka", state: "Gujarat", country: "India", formatted: "Dwarka, Gujarat, India", latitude: 22.2442, longitude: 68.9685, timezone: "Asia/Kolkata" },
  { id: "emb-16", name: "Somnath", state: "Gujarat", country: "India", formatted: "Somnath, Gujarat, India", latitude: 20.8880, longitude: 70.4012, timezone: "Asia/Kolkata" },
  { id: "emb-17", name: "Shirdi", state: "Maharashtra", country: "India", formatted: "Shirdi, Maharashtra, India", latitude: 19.7645, longitude: 74.4762, timezone: "Asia/Kolkata" },
  { id: "emb-18", name: "Kedarnath", state: "Uttarakhand", country: "India", formatted: "Kedarnath, Uttarakhand, India", latitude: 30.7352, longitude: 79.0669, timezone: "Asia/Kolkata" },
  { id: "emb-19", name: "Badrinath", state: "Uttarakhand", country: "India", formatted: "Badrinath, Uttarakhand, India", latitude: 30.7433, longitude: 79.4938, timezone: "Asia/Kolkata" },
  { id: "emb-20", name: "Amritsar", state: "Punjab", country: "India", formatted: "Amritsar, Punjab, India", latitude: 31.6340, longitude: 74.8723, timezone: "Asia/Kolkata" },

  // Major Indian Metros and Tier-1/2 Hubs
  { id: "emb-21", name: "New Delhi", state: "Delhi", country: "India", formatted: "New Delhi, Delhi, India", latitude: 28.6139, longitude: 77.2090, timezone: "Asia/Kolkata" },
  { id: "emb-22", name: "Delhi", state: "Delhi", country: "India", formatted: "Delhi, India", latitude: 28.6692, longitude: 77.1025, timezone: "Asia/Kolkata" },
  { id: "emb-23", name: "Mumbai", state: "Maharashtra", country: "India", formatted: "Mumbai, Maharashtra, India", latitude: 19.0760, longitude: 72.8777, timezone: "Asia/Kolkata" },
  { id: "emb-24", name: "Bengaluru", state: "Karnataka", country: "India", formatted: "Bengaluru, Karnataka, India", latitude: 12.9716, longitude: 77.5946, timezone: "Asia/Kolkata" },
  { id: "emb-25", name: "Hyderabad", state: "Telangana", country: "India", formatted: "Hyderabad, Telangana, India", latitude: 17.3850, longitude: 78.4867, timezone: "Asia/Kolkata" },
  { id: "emb-26", name: "Chennai", state: "Tamil Nadu", country: "India", formatted: "Chennai, Tamil Nadu, India", latitude: 13.0827, longitude: 80.2707, timezone: "Asia/Kolkata" },
  { id: "emb-27", name: "Kolkata", state: "West Bengal", country: "India", formatted: "Kolkata, West Bengal, India", latitude: 22.5726, longitude: 88.3639, timezone: "Asia/Kolkata" },
  { id: "emb-28", name: "Ahmedabad", state: "Gujarat", country: "India", formatted: "Ahmedabad, Gujarat, India", latitude: 23.0225, longitude: 72.5714, timezone: "Asia/Kolkata" },
  { id: "emb-29", name: "Pune", state: "Maharashtra", country: "India", formatted: "Pune, Maharashtra, India", latitude: 18.5204, longitude: 73.8567, timezone: "Asia/Kolkata" },
  { id: "emb-30", name: "Jaipur", state: "Rajasthan", country: "India", formatted: "Jaipur, Rajasthan, India", latitude: 26.9124, longitude: 75.7873, timezone: "Asia/Kolkata" },
  { id: "emb-31", name: "Lucknow", state: "Uttar Pradesh", country: "India", formatted: "Lucknow, Uttar Pradesh, India", latitude: 26.8467, longitude: 80.9462, timezone: "Asia/Kolkata" },
  { id: "emb-32", name: "Kanpur", state: "Uttar Pradesh", country: "India", formatted: "Kanpur, Uttar Pradesh, India", latitude: 26.4499, longitude: 80.3319, timezone: "Asia/Kolkata" },
  { id: "emb-33", name: "Noida", state: "Uttar Pradesh", country: "India", formatted: "Noida, Uttar Pradesh, India", latitude: 28.5355, longitude: 77.3910, timezone: "Asia/Kolkata" },
  { id: "emb-34", name: "Gurugram", state: "Haryana", country: "India", formatted: "Gurugram, Haryana, India", latitude: 28.4595, longitude: 77.0266, timezone: "Asia/Kolkata" },
  { id: "emb-35", name: "Chandigarh", state: "Chandigarh", country: "India", formatted: "Chandigarh, India", latitude: 30.7333, longitude: 76.7794, timezone: "Asia/Kolkata" },
  { id: "emb-36", name: "Indore", state: "Madhya Pradesh", country: "India", formatted: "Indore, Madhya Pradesh, India", latitude: 22.7196, longitude: 75.8577, timezone: "Asia/Kolkata" },
  { id: "emb-37", name: "Bhopal", state: "Madhya Pradesh", country: "India", formatted: "Bhopal, Madhya Pradesh, India", latitude: 23.2599, longitude: 77.4126, timezone: "Asia/Kolkata" },
  { id: "emb-38", name: "Nagpur", state: "Maharashtra", country: "India", formatted: "Nagpur, Maharashtra, India", latitude: 21.1458, longitude: 79.0882, timezone: "Asia/Kolkata" },
  { id: "emb-39", name: "Surat", state: "Gujarat", country: "India", formatted: "Surat, Gujarat, India", latitude: 21.1702, longitude: 72.8311, timezone: "Asia/Kolkata" },
  { id: "emb-40", name: "Vadodara", state: "Gujarat", country: "India", formatted: "Vadodara, Gujarat, India", latitude: 22.3072, longitude: 73.1812, timezone: "Asia/Kolkata" },
  { id: "emb-41", name: "Patna", state: "Bihar", country: "India", formatted: "Patna, Bihar, India", latitude: 25.5941, longitude: 85.1376, timezone: "Asia/Kolkata" },
  { id: "emb-42", name: "Ranchi", state: "Jharkhand", country: "India", formatted: "Ranchi, Jharkhand, India", latitude: 23.3441, longitude: 85.3096, timezone: "Asia/Kolkata" },
  { id: "emb-43", name: "Jamshedpur", state: "Jharkhand", country: "India", formatted: "Jamshedpur, Jharkhand, India", latitude: 22.8046, longitude: 86.2029, timezone: "Asia/Kolkata" },
  { id: "emb-44", name: "Bhubaneswar", state: "Odisha", country: "India", formatted: "Bhubaneswar, Odisha, India", latitude: 20.2961, longitude: 85.8245, timezone: "Asia/Kolkata" },
  { id: "emb-45", name: "Guwahati", state: "Assam", country: "India", formatted: "Guwahati, Assam, India", latitude: 26.1445, longitude: 91.7362, timezone: "Asia/Kolkata" },
  { id: "emb-46", name: "Dehradun", state: "Uttarakhand", country: "India", formatted: "Dehradun, Uttarakhand, India", latitude: 30.3165, longitude: 78.0322, timezone: "Asia/Kolkata" },
  { id: "emb-47", name: "Shimla", state: "Himachal Pradesh", country: "India", formatted: "Shimla, Himachal Pradesh, India", latitude: 31.1048, longitude: 77.1734, timezone: "Asia/Kolkata" },
  { id: "emb-48", name: "Kochi", state: "Kerala", country: "India", formatted: "Kochi, Kerala, India", latitude: 9.9312, longitude: 76.2673, timezone: "Asia/Kolkata" },
  { id: "emb-49", name: "Thiruvananthapuram", state: "Kerala", country: "India", formatted: "Thiruvananthapuram, Kerala, India", latitude: 8.5241, longitude: 76.9366, timezone: "Asia/Kolkata" },
  { id: "emb-50", name: "Visakhapatnam", state: "Andhra Pradesh", country: "India", formatted: "Visakhapatnam, Andhra Pradesh, India", latitude: 17.6868, longitude: 83.2185, timezone: "Asia/Kolkata" },
  { id: "emb-51", name: "Agra", state: "Uttar Pradesh", country: "India", formatted: "Agra, Uttar Pradesh, India", latitude: 27.1767, longitude: 78.0081, timezone: "Asia/Kolkata" },
  { id: "emb-52", name: "Meerut", state: "Uttar Pradesh", country: "India", formatted: "Meerut, Uttar Pradesh, India", latitude: 28.9845, longitude: 77.7064, timezone: "Asia/Kolkata" },
  { id: "emb-53", name: "Jodhpur", state: "Rajasthan", country: "India", formatted: "Jodhpur, Rajasthan, India", latitude: 26.2389, longitude: 73.0243, timezone: "Asia/Kolkata" },
  { id: "emb-54", name: "Udaipur", state: "Rajasthan", country: "India", formatted: "Udaipur, Rajasthan, India", latitude: 24.5854, longitude: 73.7125, timezone: "Asia/Kolkata" },

  // Global Hubs for International Astrology Patrons
  { id: "emb-101", name: "Kathmandu", state: "Bagmati", country: "Nepal", formatted: "Kathmandu, Nepal", latitude: 27.7172, longitude: 85.3240, timezone: "Asia/Kathmandu" },
  { id: "emb-102", name: "Pokhara", state: "Gandaki", country: "Nepal", formatted: "Pokhara, Nepal", latitude: 28.2096, longitude: 83.9856, timezone: "Asia/Kathmandu" },
  { id: "emb-103", name: "London", state: "England", country: "United Kingdom", formatted: "London, England, United Kingdom", latitude: 51.5074, longitude: -0.1278, timezone: "Europe/London" },
  { id: "emb-104", name: "New York", state: "New York", country: "United States", formatted: "New York, NY, United States", latitude: 40.7128, longitude: -74.0060, timezone: "America/New_York" },
  { id: "emb-105", name: "San Francisco", state: "California", country: "United States", formatted: "San Francisco, CA, United States", latitude: 37.7749, longitude: -122.4194, timezone: "America/Los_Angeles" },
  { id: "emb-106", name: "Toronto", state: "Ontario", country: "Canada", formatted: "Toronto, Ontario, Canada", latitude: 43.6532, longitude: -79.3832, timezone: "America/Toronto" },
  { id: "emb-107", name: "Vancouver", state: "British Columbia", country: "Canada", formatted: "Vancouver, British Columbia, Canada", latitude: 49.2827, longitude: -123.1207, timezone: "America/Vancouver" },
  { id: "emb-108", name: "Dubai", state: "Dubai", country: "United Arab Emirates", formatted: "Dubai, United Arab Emirates", latitude: 25.2048, longitude: 55.2708, timezone: "Asia/Dubai" },
  { id: "emb-109", name: "Singapore", country: "Singapore", formatted: "Singapore", latitude: 1.3521, longitude: 103.8198, timezone: "Asia/Singapore" },
  { id: "emb-110", name: "Sydney", state: "New South Wales", country: "Australia", formatted: "Sydney, New South Wales, Australia", latitude: -33.8688, longitude: 151.2093, timezone: "Australia/Sydney" },
  { id: "emb-111", name: "Melbourne", state: "Victoria", country: "Australia", formatted: "Melbourne, Victoria, Australia", latitude: -37.8136, longitude: 144.9631, timezone: "Australia/Melbourne" },
];

/**
 * Searches the local embedded knowledge base for instant matching.
 */
function searchEmbedded(query: string, limit = 8): LocationSuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return EMBEDDED_LOCATIONS.filter((item) => {
    const nameMatch = item.name.toLowerCase().includes(q);
    const stateMatch = item.state ? item.state.toLowerCase().includes(q) : false;
    const countryMatch = item.country.toLowerCase().includes(q);
    const formattedMatch = item.formatted.toLowerCase().includes(q);
    return nameMatch || stateMatch || countryMatch || formattedMatch;
  }).slice(0, limit);
}

/**
 * Queries Ola Maps Autocomplete API.
 */
async function fetchOlaMaps(query: string, apiKey: string, limit = 8, origin = "http://localhost:3000"): Promise<LocationSuggestion[]> {
  const url = new URL("https://api.olamaps.io/places/v1/autocomplete");
  url.searchParams.set("input", query);
  url.searchParams.set("api_key", apiKey);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Request-Id": crypto.randomUUID(),
        Origin: origin,
        Referer: `${origin}/`,
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) return [];

    const data = (await res.json()) as {
      predictions?: OlaPrediction[];
    };

    if (!Array.isArray(data.predictions)) return [];

    return data.predictions.slice(0, limit).map((p, index) => {
      const normalized = normalizeOlaPrediction(p, index);
      return {
        id: normalized.id,
        name: normalized.name,
        state: normalized.state,
        country: normalized.country,
        formatted: normalized.formatted,
        latitude: normalized.latitude,
        longitude: normalized.longitude,
        place_id: normalized.place_id,
      };
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Queries Open-Meteo Geocoding API.
 */
async function fetchOpenMeteo(query: string, limit = 8): Promise<LocationSuggestion[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    query
  )}&count=${limit}&language=en&format=json`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
      next: { revalidate: 86400 },
    });

    if (!res.ok) return [];

    const data = (await res.json()) as {
      results?: Array<{
        id: number;
        name: string;
        latitude?: number;
        longitude?: number;
        country?: string;
        admin1?: string;
        timezone?: string;
      }>;
    };

    if (!Array.isArray(data.results)) return [];

    return data.results.map((r) => {
      const parts = [r.name];
      if (r.admin1 && r.admin1 !== r.name) parts.push(r.admin1);
      if (r.country) parts.push(r.country);

      return {
        id: `om-${r.id}`,
        name: r.name,
        state: r.admin1,
        country: r.country || "World",
        formatted: parts.join(", "),
        latitude: r.latitude,
        longitude: r.longitude,
        timezone: r.timezone,
      };
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET(request: NextRequest) {
  try {
    // Protect the server-held Ola Maps key/quota from anonymous abuse
    const rateCheck = checkRateLimit(`location-autocomplete:${extractClientIp(request)}`, 90, 60_000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Please slow down.", suggestions: [] },
        { status: 429, headers: { "Retry-After": String(rateCheck.retryAfterSeconds) } }
      );
    }

    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("input") || searchParams.get("q") || "").trim();

    if (!query || query.length < 2) {
      return NextResponse.json({
        success: true,
        suggestions: [],
      });
    }

    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 8), 1), 20);

    const olaKey = process.env.OLA_MAPS_API_KEY?.trim();
    let suggestions: LocationSuggestion[] = [];

    // 1. Primary: Ola Maps by Krutrim Cloud
    if (olaKey) {
      const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
      suggestions = await fetchOlaMaps(query, olaKey, limit, origin);
    }

    // 2. Secondary: Open-Meteo Geocoding
    if (suggestions.length === 0) {
      suggestions = await fetchOpenMeteo(query, limit);
    }

    // 3. Fallback: Embedded locations
    const localMatches = searchEmbedded(query, limit);
    const combinedMap = new Map<string, LocationSuggestion>();

    for (const item of [...suggestions, ...localMatches]) {
      const key = item.formatted.toLowerCase().replace(/[\s,]+/g, " ");
      if (!combinedMap.has(key)) {
        combinedMap.set(key, item);
      }
      if (combinedMap.size >= limit) break;
    }

    return NextResponse.json(
      {
        success: true,
        suggestions: Array.from(combinedMap.values()),
      },
      {
        headers: {
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
        },
      }
    );
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to fetch location suggestions.",
        suggestions: [],
      },
      { status: 500 }
    );
  }
}
