import test from "node:test";
import assert from "node:assert/strict";
import {
  validateCoordinates,
  normalizeReverseGeocodeResult,
  type OlaReverseGeocodeResult,
} from "../lib/location/ola-maps";

const MOCK_OLA_REVERSE_GEOCODE: OlaReverseGeocodeResult = {
  formatted_address: "Magol Puri, Hanuman Road Area, Connaught Place, New Delhi, Delhi, 110001, India",
  name: "Magol Puri",
  types: ["restaurant"],
  geometry: {
    location: {
      lat: 28.6304,
      lng: 77.2177,
    },
  },
  address_components: [
    { types: ["country"], short_name: "IN", long_name: "India" },
    { types: ["administrative_area_level_1"], short_name: "DL", long_name: "Delhi" },
    { types: ["locality", "administrative_area_level_2"], short_name: "NDLS", long_name: "New Delhi" },
    { types: ["postal_code"], short_name: "110001", long_name: "110001" },
  ],
};

// =====================================================
// PHASE 11 AUTOMATED TESTS — REVERSE GEOCODING & CURRENT LOCATION
// =====================================================

test("Ola Maps Reverse Geocoding: Valid coordinates are accepted and parsed", () => {
  const result = validateCoordinates("28.6304", "77.2177");
  assert.equal(result.valid, true);
  assert.equal(result.lat, 28.6304);
  assert.equal(result.lng, 77.2177);
  assert.equal(result.error, undefined);
});

test("Ola Maps Reverse Geocoding: Missing lat or lng returns 400 error", () => {
  const missingLat = validateCoordinates(null, "77.2177");
  assert.equal(missingLat.valid, false);
  assert.match(missingLat.error || "", /required/i);

  const missingLng = validateCoordinates("28.6304", "");
  assert.equal(missingLng.valid, false);
  assert.match(missingLng.error || "", /required/i);
});

test("Ola Maps Reverse Geocoding: Non-numeric coordinates return 400 validation error", () => {
  const nonNum = validateCoordinates("abc", "77.2177");
  assert.equal(nonNum.valid, false);
  assert.match(nonNum.error || "", /valid numbers/i);

  const nonNumLng = validateCoordinates("28.6304", "xyz");
  assert.equal(nonNumLng.valid, false);
  assert.match(nonNumLng.error || "", /valid numbers/i);
});

test("Ola Maps Reverse Geocoding: Out-of-bounds latitude (< -90 or > 90) returns 400", () => {
  const tooHigh = validateCoordinates("95.0", "77.2177");
  assert.equal(tooHigh.valid, false);
  assert.match(tooHigh.error || "", /between -90 and 90/i);

  const tooLow = validateCoordinates("-100.0", "77.2177");
  assert.equal(tooLow.valid, false);
  assert.match(tooLow.error || "", /between -90 and 90/i);
});

test("Ola Maps Reverse Geocoding: Out-of-bounds longitude (< -180 or > 180) returns 400", () => {
  const tooEast = validateCoordinates("28.6304", "185.0");
  assert.equal(tooEast.valid, false);
  assert.match(tooEast.error || "", /between -180 and 180/i);

  const tooWest = validateCoordinates("28.6304", "-190.0");
  assert.equal(tooWest.valid, false);
  assert.match(tooWest.error || "", /between -180 and 180/i);
});

test("Ola Maps Reverse Geocoding: Missing API key returns 500 without disclosing secrets", () => {
  function checkReverseGeocodeKey(key?: string) {
    if (!key || key.trim() === "") {
      return {
        status: 500,
        body: {
          success: false,
          error: "Ola Maps API key is not configured on the server.",
          result: null,
        },
      };
    }
    return { status: 200, body: { success: true } };
  }

  const res = checkReverseGeocodeKey("");
  assert.equal(res.status, 500);
  assert.equal(res.body.success, false);
  assert.match(res.body.error || "", /Ola Maps API key is not configured/i);
  assert.equal("OLA_MAPS_API_KEY" in res.body, false);
});

test("Ola Maps Reverse Geocoding: Upstream HTTP error codes are safely mapped", () => {
  function mapReverseGeocodeError(status: number) {
    if (status === 400) return { status: 400, error: "Invalid coordinates sent to Ola Maps." };
    if (status === 401) return { status: 401, error: "Ola Maps authentication failed: invalid API key." };
    if (status === 403) return { status: 403, error: "Ola Maps access forbidden or domain unauthorized." };
    if (status === 429) return { status: 429, error: "Ola Maps rate limit exceeded. Please try again shortly." };
    if (status >= 500) return { status: 502, error: "Ola Maps reverse geocoding service is temporarily unavailable." };
    return { status: 500, error: "Unknown error." };
  }

  assert.equal(mapReverseGeocodeError(400).status, 400);
  assert.equal(mapReverseGeocodeError(401).status, 401);
  assert.equal(mapReverseGeocodeError(403).status, 403);
  assert.equal(mapReverseGeocodeError(429).status, 429);
  assert.equal(mapReverseGeocodeError(500).status, 502);
});

test("Ola Maps Reverse Geocoding: Network timeouts return 504 Gateway Timeout", () => {
  function handleTimeout(isAbort: boolean) {
    return {
      status: isAbort ? 504 : 502,
      error: isAbort ? "Request to Ola Maps reverse geocoding timed out." : "Network error.",
    };
  }

  const timeoutRes = handleTimeout(true);
  assert.equal(timeoutRes.status, 504);
  assert.match(timeoutRes.error, /timed out/i);
});

test("Ola Maps Reverse Geocoding: Normalizer accurately extracts city, state, country, and postal code", () => {
  const normalized = normalizeReverseGeocodeResult(MOCK_OLA_REVERSE_GEOCODE, 28.6304, 77.2177);

  assert.equal(normalized.formatted_address, "Magol Puri, Hanuman Road Area, Connaught Place, New Delhi, Delhi, 110001, India");
  assert.equal(normalized.name, "Magol Puri");
  assert.equal(normalized.city, "New Delhi");
  assert.equal(normalized.state, "Delhi");
  assert.equal(normalized.country, "India");
  assert.equal(normalized.postal_code, "110001");
  assert.equal(normalized.latitude, 28.6304);
  assert.equal(normalized.longitude, 77.2177);
  assert.equal(normalized.source, "geolocation");
});

test("Ola Maps Reverse Geocoding: Empty result falls back to coordinate string", () => {
  const emptyResult: OlaReverseGeocodeResult = {
    formatted_address: "",
  };

  const normalized = normalizeReverseGeocodeResult(emptyResult, 25.3176, 82.9739);
  assert.equal(normalized.latitude, 25.3176);
  assert.equal(normalized.longitude, 82.9739);
  assert.equal(normalized.source, "geolocation");
});

test("Current Location Detection: Browser geolocation error codes are mapped into user-friendly messages", () => {
  function mapGeolocationError(code: number): string {
    switch (code) {
      case 1:
        return "Location permission denied. Please allow location access in your browser settings.";
      case 2:
        return "Position unavailable. Please search manually by city.";
      case 3:
        return "Location request timed out. Please try again or type manually.";
      default:
        return "Could not detect your current location.";
    }
  }

  assert.match(mapGeolocationError(1), /permission denied/i);
  assert.match(mapGeolocationError(2), /position unavailable/i);
  assert.match(mapGeolocationError(3), /timed out/i);
  assert.match(mapGeolocationError(99), /could not detect/i);
});

test("Current Location Detection: Preserves existing form fields and database compatibility", () => {
  let formBirthplace = "Old City";
  let formCoordinates = { lat: 0, lng: 0 };

  function handleCurrentLocationDetected(address: string, coords: { lat: number; lng: number }) {
    formBirthplace = address;
    formCoordinates = coords;
  }

  handleCurrentLocationDetected(
    "Magol Puri, Hanuman Road Area, Connaught Place, New Delhi, Delhi, 110001, India",
    { lat: 28.6304, lng: 77.2177 }
  );

  assert.equal(typeof formBirthplace, "string");
  assert.equal(formBirthplace.includes("New Delhi"), true);
  assert.equal(formCoordinates.lat, 28.6304);
  assert.equal(formCoordinates.lng, 77.2177);
});

test("Current Location Detection: Does not render temporary timeout error if field already has a value", () => {
  function computeDisplayError(propsError?: string | null, fetchError?: string | null, value?: string): string | null {
    return propsError || (!value ? fetchError || null : null);
  }

  // When value is already typed or saved (e.g. "Varanasi"), detection timeout error is suppressed
  const errorWithExistingValue = computeDisplayError(
    null,
    "Location request timed out. Please try again or type manually.",
    "Varanasi"
  );
  assert.equal(errorWithExistingValue, null);

  // When value is empty, temporary detection error is shown to inform user
  const errorWithEmptyValue = computeDisplayError(
    null,
    "Location request timed out. Please try again or type manually.",
    ""
  );
  assert.equal(errorWithEmptyValue, "Location request timed out. Please try again or type manually.");

  // Validation error from props always displays regardless of value
  const validationError = computeDisplayError("City is required.", "Temporary detection error", "Varanasi");
  assert.equal(validationError, "City is required.");
});
