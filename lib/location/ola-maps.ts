export interface OlaStructuredFormatting {
  main_text?: string;
  secondary_text?: string;
}

export interface OlaGeometryLocation {
  lat?: number;
  lng?: number;
}

export interface OlaPrediction {
  place_id?: string;
  reference?: string;
  description: string;
  structured_formatting?: OlaStructuredFormatting;
  geometry?: {
    location?: OlaGeometryLocation;
  };
  types?: string[];
  layer?: string[];
}

export interface NormalizedPlaceSuggestion {
  id: string;
  name: string;
  state?: string;
  country: string;
  formatted: string;
  latitude?: number;
  longitude?: number;
  place_id?: string;
  source?: "autocomplete" | "geolocation" | "manual";
}

export interface OlaAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

export interface OlaReverseGeocodeResult {
  formatted_address: string;
  name?: string;
  address_components?: OlaAddressComponent[];
  geometry?: {
    location?: OlaGeometryLocation;
  };
  types?: string[];
}

export interface NormalizedReverseGeocode {
  formatted_address: string;
  name: string;
  city: string;
  state: string;
  country: string;
  postal_code?: string;
  latitude: number;
  longitude: number;
  source: "geolocation";
}

/**
 * Validates and normalizes user search input.
 */
export function validateInput(rawInput: string | null): {
  valid: boolean;
  trimmed: string;
  error?: string;
  status?: number;
} {
  if (rawInput === null || rawInput === undefined) {
    return { valid: false, trimmed: "", error: "Query parameter 'input' is required.", status: 400 };
  }

  const trimmed = rawInput.trim();
  if (trimmed.length === 0) {
    return { valid: false, trimmed: "", error: "Query parameter 'input' cannot be empty.", status: 400 };
  }

  if (trimmed.length > 100) {
    return { valid: false, trimmed, error: "Query parameter 'input' is too long (maximum 100 characters).", status: 400 };
  }

  return { valid: true, trimmed };
}

/**
 * Validates latitude and longitude query parameters.
 */
export function validateCoordinates(latStr: string | null, lngStr: string | null): {
  valid: boolean;
  lat?: number;
  lng?: number;
  error?: string;
} {
  if (!latStr || !lngStr) {
    return { valid: false, error: "Both 'lat' and 'lng' query parameters are required." };
  }

  const lat = Number(latStr);
  const lng = Number(lngStr);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return { valid: false, error: "Coordinates 'lat' and 'lng' must be valid numbers." };
  }

  if (lat < -90 || lat > 90) {
    return { valid: false, error: "Latitude must be between -90 and 90 degrees." };
  }

  if (lng < -180 || lng > 180) {
    return { valid: false, error: "Longitude must be between -180 and 180 degrees." };
  }

  return { valid: true, lat, lng };
}

/**
 * Maps an upstream Ola Maps prediction into a standardized suggestion.
 */
export function normalizeOlaPrediction(prediction: OlaPrediction, index: number): NormalizedPlaceSuggestion {
  const placeId = prediction.place_id || prediction.reference || `ola-place-${index}`;
  const description = prediction.description || "";
  const mainText = prediction.structured_formatting?.main_text || description.split(",")[0]?.trim() || "Location";
  const secondaryText = prediction.structured_formatting?.secondary_text || "";

  let state: string | undefined;
  let country = "India";

  if (secondaryText) {
    const secParts = secondaryText.split(",").map((s) => s.trim()).filter(Boolean);
    if (secParts.length > 0) {
      country = secParts[secParts.length - 1];
    }
    if (secParts.length > 1) {
      state = secParts[0];
    }
  } else {
    const descParts = description.split(",").map((s) => s.trim()).filter(Boolean);
    if (descParts.length > 1) {
      country = descParts[descParts.length - 1];
      state = descParts[1];
    }
  }

  return {
    id: placeId,
    name: mainText,
    state,
    country,
    formatted: description,
    latitude: prediction.geometry?.location?.lat,
    longitude: prediction.geometry?.location?.lng,
    place_id: prediction.place_id,
    source: "autocomplete",
  };
}

/**
 * Maps an upstream Ola Maps reverse-geocode result into a normalized address structure.
 */
export function normalizeReverseGeocodeResult(
  result: OlaReverseGeocodeResult,
  fallbackLat: number,
  fallbackLng: number
): NormalizedReverseGeocode {
  const components = result.address_components || [];
  let locality = "";
  let sublocality = "";
  let adminLevel3 = ""; // Tehsil / Taluk / Sub-district (e.g., Mawana, Hastinapur)
  let adminLevel2 = ""; // District (e.g., Meerut, New Delhi)
  let state = "";
  let country = "India";
  let postalCode: string | undefined;

  for (const comp of components) {
    const types = comp.types || [];
    if (types.includes("locality") || types.includes("city")) {
      if (!locality) locality = comp.long_name;
    }
    if (types.includes("sublocality") || types.includes("sublocality_level_1") || types.includes("neighborhood")) {
      if (!sublocality) sublocality = comp.long_name;
    }
    if (types.includes("administrative_area_level_3") || types.includes("subdistrict") || types.includes("taluk") || types.includes("tehsil")) {
      if (!adminLevel3) adminLevel3 = comp.long_name;
    }
    if (types.includes("administrative_area_level_2") || types.includes("district")) {
      if (!adminLevel2) adminLevel2 = comp.long_name;
    }
    if (types.includes("administrative_area_level_1") || types.includes("state")) {
      if (!state) state = comp.long_name;
    }
    if (types.includes("country")) {
      country = comp.long_name;
    }
    if (types.includes("postal_code")) {
      postalCode = comp.long_name;
    }
  }

  // City priority: Locality > Admin Area Level 3 (Tehsil/Taluk/Town) > District (Admin Area Level 2) > Sublocality
  const city = locality || adminLevel3 || adminLevel2 || sublocality || "";

  const formatted = result.formatted_address || [city, state, country].filter(Boolean).join(", ");
  const name = result.name || city || formatted.split(",")[0]?.trim() || "Current Location";

  return {
    formatted_address: formatted,
    name,
    city: city || name,
    state,
    country,
    postal_code: postalCode,
    latitude: result.geometry?.location?.lat ?? fallbackLat,
    longitude: result.geometry?.location?.lng ?? fallbackLng,
    source: "geolocation",
  };
}

// =====================================================
// BOUNDED HIGH-PERFORMANCE IN-MEMORY LRU / TTL CACHE
// =====================================================

export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class BoundedLRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  constructor(
    private maxEntries: number = 300,
    private defaultTtlMs: number = 300_000 // 5 minutes
  ) {}

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    // Re-insert to refresh LRU recency
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.data;
  }

  set(key: string, data: T, ttlMs?: number): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// Bounded server-side cache instances
export const autocompleteCache = new BoundedLRUCache<{
  predictions: OlaPrediction[];
  suggestions: NormalizedPlaceSuggestion[];
}>(300, 300_000); // 5 min TTL, max 300 entries

export const reverseGeocodeCache = new BoundedLRUCache<NormalizedReverseGeocode>(
  300,
  600_000 // 10 min TTL, max 300 entries
);

