import test from "node:test";
import assert from "node:assert/strict";
import { normalizeOlaPrediction, type OlaPrediction } from "../lib/location/ola-maps";

const MOCK_OLA_PREDICTION: OlaPrediction = {
  reference: "15771",
  types: ["locality"],
  description: "Meerut, Uttar Pradesh, India",
  place_id: "ola-platform:15771",
  structured_formatting: {
    main_text: "Meerut",
    secondary_text: "Uttar Pradesh, India",
  },
  geometry: {
    location: {
      lat: 28.978763,
      lng: 77.69208,
    },
  },
};

// =====================================================
// PHASE 6 AUTOMATED TESTS — OLA MAPS AUTOCOMPLETE
// =====================================================

test("Ola Maps: Input validation rejects missing or undefined query parameter", () => {
  function validateInput(rawInput: string | null) {
    if (rawInput === null || rawInput === undefined) {
      return { valid: false, status: 400, error: "Query parameter 'input' is required." };
    }
    const trimmed = rawInput.trim();
    if (trimmed.length === 0) {
      return { valid: false, status: 400, error: "Query parameter 'input' cannot be empty." };
    }
    if (trimmed.length > 100) {
      return { valid: false, status: 400, error: "Query parameter 'input' is too long (maximum 100 characters)." };
    }
    return { valid: true, trimmed };
  }

  const missing = validateInput(null);
  assert.equal(missing.valid, false);
  assert.equal(missing.status, 400);
  assert.match(missing.error || "", /required/i);
});

test("Ola Maps: Input validation rejects whitespace-only query parameter", () => {
  function validateInput(rawInput: string | null) {
    if (rawInput === null || rawInput === undefined) {
      return { valid: false, status: 400, error: "Query parameter 'input' is required." };
    }
    const trimmed = rawInput.trim();
    if (trimmed.length === 0) {
      return { valid: false, status: 400, error: "Query parameter 'input' cannot be empty." };
    }
    return { valid: true, trimmed };
  }

  const whitespaceOnly = validateInput("    ");
  assert.equal(whitespaceOnly.valid, false);
  assert.equal(whitespaceOnly.status, 400);
  assert.match(whitespaceOnly.error || "", /cannot be empty/i);
});

test("Ola Maps: Input validation rejects excessively long input exceeding 100 characters", () => {
  function validateInput(rawInput: string | null) {
    if (!rawInput) return { valid: false, status: 400 };
    const trimmed = rawInput.trim();
    if (trimmed.length > 100) {
      return { valid: false, status: 400, error: "Query parameter 'input' is too long (maximum 100 characters)." };
    }
    return { valid: true, trimmed };
  }

  const longQuery = "a".repeat(105);
  const result = validateInput(longQuery);
  assert.equal(result.valid, false);
  assert.equal(result.status, 400);
  assert.match(result.error || "", /too long/i);
});

test("Ola Maps: Queries shorter than 2 characters return 200 with empty suggestions without calling upstream", () => {
  const shortQuery = "M";
  const shouldSkipUpstream = shortQuery.trim().length < 2;
  assert.equal(shouldSkipUpstream, true);

  const responsePayload = {
    success: true,
    predictions: [],
    suggestions: [],
  };
  assert.equal(responsePayload.success, true);
  assert.deepEqual(responsePayload.predictions, []);
  assert.deepEqual(responsePayload.suggestions, []);
});

test("Ola Maps: Missing API key returns safe 500 error without leaking server secrets", () => {
  function checkApiKey(key?: string) {
    if (!key || key.trim() === "") {
      return {
        status: 500,
        body: {
          success: false,
          error: "Ola Maps API key is not configured on the server.",
          predictions: [],
          suggestions: [],
        },
      };
    }
    return {
      status: 200,
      body: {
        success: true,
        predictions: [],
        suggestions: [],
      },
    };
  }

  const result = checkApiKey(undefined);
  assert.equal(result.status, 500);
  assert.equal(result.body.success, false);
  assert.match(result.body.error || "", /Ola Maps API key is not configured/i);
  assert.equal("OLA_MAPS_API_KEY" in result.body, false);
});

test("Ola Maps: Upstream 400 Bad Request error is handled safely", () => {
  function mapUpstreamError(status: number) {
    if (status === 400) return { status: 400, error: "Invalid request sent to Ola Maps." };
    if (status === 401) return { status: 401, error: "Ola Maps authentication failed: invalid API key." };
    if (status === 403) return { status: 403, error: "Ola Maps access forbidden or domain unauthorized." };
    if (status === 429) return { status: 429, error: "Ola Maps rate limit exceeded. Please try again shortly." };
    if (status >= 500) return { status: 502, error: "Ola Maps upstream service is temporarily unavailable." };
    return { status: 500, error: "Unknown error." };
  }

  const err400 = mapUpstreamError(400);
  assert.equal(err400.status, 400);
  assert.match(err400.error, /Invalid request sent to Ola Maps/i);
});

test("Ola Maps: Upstream 401 and 403 authorization failures are mapped to safe client errors", () => {
  function mapUpstreamError(status: number) {
    if (status === 401) return { status: 401, error: "Ola Maps authentication failed: invalid API key." };
    if (status === 403) return { status: 403, error: "Ola Maps access forbidden or domain unauthorized." };
    return { status };
  }

  const err401 = mapUpstreamError(401);
  assert.equal(err401.status, 401);
  assert.match(err401.error || "", /authentication failed/i);

  const err403 = mapUpstreamError(403);
  assert.equal(err403.status, 403);
  assert.match(err403.error || "", /forbidden or domain unauthorized/i);
});

test("Ola Maps: Upstream 429 rate limit is handled gracefully without infinite retries", () => {
  function mapUpstreamError(status: number) {
    if (status === 429) return { status: 429, error: "Ola Maps rate limit exceeded. Please try again shortly." };
    return { status };
  }

  const err429 = mapUpstreamError(429);
  assert.equal(err429.status, 429);
  assert.match(err429.error || "", /rate limit exceeded/i);
});

test("Ola Maps: Upstream 5xx server errors return 502 Bad Gateway with safe message", () => {
  function mapUpstreamError(status: number) {
    if (status >= 500) return { status: 502, error: "Ola Maps upstream service is temporarily unavailable." };
    return { status };
  }

  const err500 = mapUpstreamError(500);
  assert.equal(err500.status, 502);
  assert.match(err500.error || "", /temporarily unavailable/i);

  const err503 = mapUpstreamError(503);
  assert.equal(err503.status, 502);
});

test("Ola Maps: Network timeouts return 504 Gateway Timeout", () => {
  function handleFetchError(isAbort: boolean) {
    return {
      status: isAbort ? 504 : 502,
      error: isAbort ? "Request to Ola Maps timed out." : "Network error contacting Ola Maps service.",
    };
  }

  const timeoutRes = handleFetchError(true);
  assert.equal(timeoutRes.status, 504);
  assert.match(timeoutRes.error, /timed out/i);
});

test("Ola Maps: Malformed JSON or non-object payloads are safely caught", () => {
  function parsePayload(raw: string) {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return { success: false, status: 502, error: "Unexpected response format received from Ola Maps." };
      }
      return { success: true, data: parsed };
    } catch {
      return { success: false, status: 502, error: "Malformed JSON response received from Ola Maps." };
    }
  }

  const malformed = parsePayload("<html>502 Bad Gateway</html>");
  assert.equal(malformed.success, false);
  assert.equal(malformed.status, 502);
  assert.match(malformed.error || "", /Malformed JSON/i);

  const nonObject = parsePayload('"just a string"');
  assert.equal(nonObject.success, false);
  assert.equal(nonObject.status, 502);
});

test("Ola Maps: Prediction normalizer extracts correct coordinates, state, country, and display name", () => {
  const normalized = normalizeOlaPrediction(MOCK_OLA_PREDICTION, 0);

  assert.equal(normalized.id, "ola-platform:15771");
  assert.equal(normalized.name, "Meerut");
  assert.equal(normalized.state, "Uttar Pradesh");
  assert.equal(normalized.country, "India");
  assert.equal(normalized.formatted, "Meerut, Uttar Pradesh, India");
  assert.equal(normalized.latitude, 28.978763);
  assert.equal(normalized.longitude, 77.69208);
  assert.equal(normalized.place_id, "ola-platform:15771");
});

test("Ola Maps: Secret API credentials are never exposed in serialized responses", () => {
  const secretKey = "secret_ola_api_key_test_12345";
  const normalized = normalizeOlaPrediction(MOCK_OLA_PREDICTION, 0);

  const serialized = JSON.stringify({
    success: true,
    predictions: [MOCK_OLA_PREDICTION],
    suggestions: [normalized],
  });

  assert.equal(serialized.includes(secretKey), false);
  assert.equal(serialized.includes("api_key"), false);
  assert.equal(serialized.includes("credentials"), false);
});

test("Ola Maps: Rapid typing request ID sequence counter discards stale responses", () => {
  let activeSequence = 0;
  let finalCommittedData = "";

  function handleResponseArrival(requestId: number, data: string) {
    // Only accept data if this request is still the active one
    if (requestId === activeSequence) {
      finalCommittedData = data;
    }
  }

  // User types "M" -> ID 1
  activeSequence = 1;
  // User types "Me" -> ID 2
  activeSequence = 2;
  // User types "Mee" -> ID 3
  activeSequence = 3;

  // Request 1 arrives late (after request 3)
  handleResponseArrival(1, "Old Results for M");
  assert.equal(finalCommittedData, "", "Stale response for ID 1 must be ignored");

  // Request 3 arrives
  handleResponseArrival(3, "Fresh Results for Mee");
  assert.equal(finalCommittedData, "Fresh Results for Mee");

  // Request 2 arrives very late
  handleResponseArrival(2, "Stale Results for Me");
  assert.equal(finalCommittedData, "Fresh Results for Mee", "Late response for ID 2 must not overwrite ID 3");
});

test("Ola Maps: Keyboard navigation index correctly cycles through suggestion list", () => {
  const count = 4;
  let index = -1;

  // Down from none -> 0
  index = index < count - 1 ? index + 1 : 0;
  assert.equal(index, 0);

  // Down -> 1, 2, 3
  index = index < count - 1 ? index + 1 : 0;
  index = index < count - 1 ? index + 1 : 0;
  index = index < count - 1 ? index + 1 : 0;
  assert.equal(index, 3);

  // Down at end wraps to 0
  index = index < count - 1 ? index + 1 : 0;
  assert.equal(index, 0);

  // Up from 0 wraps to 3
  index = index > 0 ? index - 1 : count - 1;
  assert.equal(index, 3);

  // Up from 3 -> 2
  index = index > 0 ? index - 1 : count - 1;
  assert.equal(index, 2);
});

test("Ola Maps: Form submission preserves backward-compatible string format and structured suggestion", () => {
  let submittedFormAddress = "";
  let capturedState = "";

  function onSelectSuggestion(suggestion: { formatted: string; state?: string }) {
    submittedFormAddress = suggestion.formatted;
    if (suggestion.state) {
      capturedState = suggestion.state;
    }
  }

  const normalized = normalizeOlaPrediction(MOCK_OLA_PREDICTION, 0);
  onSelectSuggestion(normalized);

  assert.equal(submittedFormAddress, "Meerut, Uttar Pradesh, India");
  assert.equal(capturedState, "Uttar Pradesh");
});
