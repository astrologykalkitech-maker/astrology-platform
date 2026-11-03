import test from "node:test";
import assert from "node:assert/strict";
import { calculatePanchang } from "../lib/astrology/panchang";

test("Panchang Accuracy: Sub-hour Timezones & Coordinates", () => {
  // Test Case 1: Indian Standard Time (+5:30) - New Delhi
  const panchangDelhi = calculatePanchang(new Date("2024-10-15T06:00:00Z"), {
    latitude: 28.6139,
    longitude: 77.2090,
    cityName: "New Delhi",
    timezoneOffsetHours: 5.5,
  });

  assert.ok(panchangDelhi.tithi.name.length > 0);
  assert.ok(panchangDelhi.nakshatra.name.length > 0);
  assert.ok(panchangDelhi.yoga.name.length > 0);
  assert.ok(panchangDelhi.karana.name.length > 0);
  assert.ok(panchangDelhi.vara.dayName.length > 0);
  assert.equal(panchangDelhi.location.city, "New Delhi");
  assert.equal(panchangDelhi.location.timezoneOffsetHours, 5.5);

  // Test Case 2: Nepal Time (+5:45) - Kathmandu
  const panchangKathmandu = calculatePanchang(new Date("2024-10-15T06:00:00Z"), {
    latitude: 27.7172,
    longitude: 85.3240,
    cityName: "Kathmandu",
    timezoneOffsetHours: 5.75,
  });

  assert.equal(panchangKathmandu.location.timezoneOffsetHours, 5.75);
  assert.ok(panchangKathmandu.solarInfo.sunrise.length > 0);
  assert.ok(panchangKathmandu.solarInfo.sunset.length > 0);

  // Test Case 3: Western DST Timezone (New York, EDT UTC -4)
  const panchangNYC = calculatePanchang(new Date("2024-07-15T12:00:00Z"), {
    latitude: 40.7128,
    longitude: -74.0060,
    cityName: "New York",
    timezoneOffsetHours: -4,
  });

  assert.equal(panchangNYC.location.timezoneOffsetHours, -4);
  assert.ok(panchangNYC.tithi.number >= 1 && panchangNYC.tithi.number <= 30);
});

test("Panchang Accuracy: Authentic Muhurats & Choghadiya Sequence", () => {
  const panchang = calculatePanchang(new Date("2024-10-15T06:00:00Z"), {
    latitude: 28.6139,
    longitude: 77.2090,
    cityName: "New Delhi",
    timezoneOffsetHours: 5.5,
  });

  // Verify Inauspicious Muhurats presence
  assert.ok(panchang.rahukalam.start.includes(":"));
  assert.ok(panchang.yamaganda.start.includes(":"));
  assert.ok(panchang.gulikakalam.start.includes(":"));

  // Verify Auspicious Muhurats
  assert.ok(panchang.brahmaMuhurat.start.includes(":"));
  assert.ok(panchang.abhijitMuhurat.start.includes(":"));

  // Verify Choghadiya segments (8 Day + 8 Night)
  assert.equal(panchang.dayChoghadiya.length, 8);
  assert.equal(panchang.nightChoghadiya.length, 8);

  for (const c of panchang.dayChoghadiya) {
    assert.ok(["Amrit", "Shubh", "Labh", "Char", "Rog", "Kaal", "Udveg"].includes(c.name));
    assert.ok(c.type.length > 0);
  }
});

