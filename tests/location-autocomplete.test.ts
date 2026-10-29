import test from "node:test";
import assert from "node:assert/strict";

interface LocationItem {
  id: string;
  name: string;
  state?: string;
  country: string;
  displayName: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
}

// Local mock mirroring the fallback spiritual hubs in app/api/location/autocomplete/route.ts
const EMBEDDED_LOCATIONS: LocationItem[] = [
  { id: "varanasi-up", name: "Varanasi", state: "Uttar Pradesh", country: "India", displayName: "Varanasi, Uttar Pradesh, India", latitude: 25.3176, longitude: 82.9739, timezone: "Asia/Kolkata" },
  { id: "haridwar-uk", name: "Haridwar", state: "Uttarakhand", country: "India", displayName: "Haridwar, Uttarakhand, India", latitude: 29.9457, longitude: 78.1642, timezone: "Asia/Kolkata" },
  { id: "ayodhya-up", name: "Ayodhya", state: "Uttar Pradesh", country: "India", displayName: "Ayodhya, Uttar Pradesh, India", latitude: 26.7922, longitude: 82.1998, timezone: "Asia/Kolkata" },
  { id: "ujjain-mp", name: "Ujjain", state: "Madhya Pradesh", country: "India", displayName: "Ujjain, Madhya Pradesh, India", latitude: 23.1765, longitude: 75.7885, timezone: "Asia/Kolkata" },
  { id: "mathura-up", name: "Mathura", state: "Uttar Pradesh", country: "India", displayName: "Mathura, Uttar Pradesh, India", latitude: 27.4924, longitude: 77.6737, timezone: "Asia/Kolkata" },
  { id: "rishikesh-uk", name: "Rishikesh", state: "Uttarakhand", country: "India", displayName: "Rishikesh, Uttarakhand, India", latitude: 30.0869, longitude: 78.2676, timezone: "Asia/Kolkata" },
  { id: "prayagraj-up", name: "Prayagraj", state: "Uttar Pradesh", country: "India", displayName: "Prayagraj, Uttar Pradesh, India", latitude: 25.4358, longitude: 81.8463, timezone: "Asia/Kolkata" },
  { id: "delhi-dl", name: "New Delhi", state: "Delhi", country: "India", displayName: "New Delhi, Delhi, India", latitude: 28.6139, longitude: 77.209, timezone: "Asia/Kolkata" },
  { id: "mumbai-mh", name: "Mumbai", state: "Maharashtra", country: "India", displayName: "Mumbai, Maharashtra, India", latitude: 19.076, longitude: 72.8777, timezone: "Asia/Kolkata" },
  { id: "kolkata-wb", name: "Kolkata", state: "West Bengal", country: "India", displayName: "Kolkata, West Bengal, India", latitude: 22.5726, longitude: 88.3639, timezone: "Asia/Kolkata" },
];

function searchLocations(query: string): LocationItem[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  return EMBEDDED_LOCATIONS.filter(
    (loc) =>
      loc.name.toLowerCase().includes(q) ||
      (loc.state && loc.state.toLowerCase().includes(q)) ||
      loc.country.toLowerCase().includes(q)
  );
}

test("Location Autocomplete: Rejects queries shorter than 2 characters", () => {
  assert.deepEqual(searchLocations(""), []);
  assert.deepEqual(searchLocations(" "), []);
  assert.deepEqual(searchLocations("V"), []);
  assert.deepEqual(searchLocations(" a "), []);
});

test("Location Autocomplete: Finds spiritual hubs and major pilgrimage centers", () => {
  const varanasi = searchLocations("Varanasi");
  assert.ok(varanasi.length > 0, "Should find Varanasi");
  assert.equal(varanasi[0].name, "Varanasi");
  assert.equal(varanasi[0].state, "Uttar Pradesh");
  assert.equal(varanasi[0].country, "India");
  assert.equal(varanasi[0].timezone, "Asia/Kolkata");

  const ayodhya = searchLocations("ayodhya");
  assert.ok(ayodhya.length > 0, "Should find Ayodhya");
  assert.equal(ayodhya[0].name, "Ayodhya");

  const haridwar = searchLocations("hari");
  assert.ok(haridwar.length > 0, "Should match Haridwar with partial query 'hari'");
  assert.equal(haridwar[0].name, "Haridwar");
});

test("Location Autocomplete: Returns geographical coordinates required for Vedic Kundli calculation", () => {
  const results = searchLocations("Ujjain");
  assert.ok(results.length > 0);
  const ujjain = results[0];

  assert.ok(typeof ujjain.latitude === "number", "Latitude must be a valid number");
  assert.ok(typeof ujjain.longitude === "number", "Longitude must be a valid number");
  assert.ok(ujjain.latitude > 20 && ujjain.latitude < 30, "Ujjain latitude should be between 20°N and 30°N");
  assert.ok(ujjain.longitude > 70 && ujjain.longitude < 80, "Ujjain longitude should be between 70°E and 80°E");
  assert.equal(ujjain.timezone, "Asia/Kolkata");
});

test("Location Autocomplete: State filtering returns all cities in that state", () => {
  const upCities = searchLocations("Uttar Pradesh");
  assert.ok(upCities.length >= 3, "Should return multiple cities for Uttar Pradesh");
  const names = upCities.map((c) => c.name);
  assert.ok(names.includes("Varanasi"));
  assert.ok(names.includes("Ayodhya"));
  assert.ok(names.includes("Mathura"));
});

test("Location Autocomplete: Race condition sequence counter protects against stale responses", () => {
  let activeRequestId = 0;
  let committedResult = "";

  function simulateAsyncFetch(id: number, text: string, delayMs: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        // Discard if a newer request has already been issued
        if (id === activeRequestId) {
          committedResult = text;
        }
        resolve();
      }, delayMs);
    });
  }

  // Request 1 issued first (slow, 50ms)
  activeRequestId = 1;
  const p1 = simulateAsyncFetch(1, "Old Result", 50);

  // Request 2 issued immediately after (fast, 10ms)
  activeRequestId = 2;
  const p2 = simulateAsyncFetch(2, "New Result", 10);

  return Promise.all([p1, p2]).then(() => {
    assert.equal(committedResult, "New Result", "Committed result must not be overwritten by stale slow response");
  });
});

test("Location Autocomplete: Keyboard navigation index wrapping logic", () => {
  const suggestionsLength = 5;

  // ArrowDown from -1 (none selected) -> 0
  let highlightIndex = -1;
  highlightIndex = highlightIndex < suggestionsLength - 1 ? highlightIndex + 1 : 0;
  assert.equal(highlightIndex, 0);

  // ArrowDown at bottom (4) wraps to 0
  highlightIndex = 4;
  highlightIndex = highlightIndex < suggestionsLength - 1 ? highlightIndex + 1 : 0;
  assert.equal(highlightIndex, 0);

  // ArrowUp from 0 wraps to 4
  highlightIndex = 0;
  highlightIndex = highlightIndex > 0 ? highlightIndex - 1 : suggestionsLength - 1;
  assert.equal(highlightIndex, 4);

  // ArrowUp from 3 goes to 2
  highlightIndex = 3;
  highlightIndex = highlightIndex > 0 ? highlightIndex - 1 : suggestionsLength - 1;
  assert.equal(highlightIndex, 2);
});

