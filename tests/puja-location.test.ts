import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidGeoCoordinatePair,
  validatePujaVenueLocation,
} from "../lib/location/coordinates";

test("venue coordinate validation accepts valid coordinates including zero", () => {
  assert.equal(isValidGeoCoordinatePair(0, 0), true);
  assert.equal(isValidGeoCoordinatePair(90, 180), true);
  assert.equal(isValidGeoCoordinatePair(-90, -180), true);
});

test("venue coordinate validation rejects non-finite and out-of-range values", () => {
  assert.equal(isValidGeoCoordinatePair(Number.NaN, 10), false);
  assert.equal(isValidGeoCoordinatePair(10, Number.POSITIVE_INFINITY), false);
  assert.equal(isValidGeoCoordinatePair(90.01, 10), false);
  assert.equal(isValidGeoCoordinatePair(10, -180.01), false);
});

test("puja venue validation normalizes address data and allows address-only locations", () => {
  const result = validatePujaVenueLocation({
    venueAddress: "  Temple Hall, Jaipur  ",
    landmark: "  North Gate  ",
    latitude: null,
    longitude: null,
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.location, {
      venueAddress: "Temple Hall, Jaipur",
      landmark: "North Gate",
      latitude: null,
      longitude: null,
    });
  }
});

test("puja venue validation rejects empty addresses and incomplete or invalid coordinate pairs", () => {
  assert.equal(
    validatePujaVenueLocation({
      venueAddress: " ",
      landmark: "",
      latitude: null,
      longitude: null,
    }).success,
    false
  );
  assert.equal(
    validatePujaVenueLocation({
      venueAddress: "Valid venue address",
      landmark: "",
      latitude: 28.6,
      longitude: null,
    }).success,
    false
  );
  assert.equal(
    validatePujaVenueLocation({
      venueAddress: "Valid venue address",
      landmark: "",
      latitude: 91,
      longitude: 77,
    }).success,
    false
  );
});
