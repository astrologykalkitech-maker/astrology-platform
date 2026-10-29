import test from "node:test";
import assert from "node:assert/strict";
import {
  BoundedLRUCache,
  autocompleteCache,
  reverseGeocodeCache,
  type NormalizedPlaceSuggestion,
  type NormalizedReverseGeocode,
} from "../lib/location/ola-maps";

test("BoundedLRUCache: Basic set, get, has, and size", () => {
  const cache = new BoundedLRUCache<string>(10, 10_000);
  assert.equal(cache.size(), 0);
  assert.equal(cache.has("mumbai"), false);
  assert.equal(cache.get("mumbai"), undefined);

  cache.set("mumbai", "Mumbai, Maharashtra, India");
  assert.equal(cache.size(), 1);
  assert.equal(cache.has("mumbai"), true);
  assert.equal(cache.get("mumbai"), "Mumbai, Maharashtra, India");
});

test("BoundedLRUCache: Evicts oldest entries when reaching max capacity (LRU)", () => {
  const cache = new BoundedLRUCache<number>(3, 60_000);

  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);
  assert.equal(cache.size(), 3);

  // Access "a" to make it most recently used
  assert.equal(cache.get("a"), 1);

  // Insert "d": capacity reached, oldest unaccessed key ("b") should be evicted
  cache.set("d", 4);
  assert.equal(cache.size(), 3);
  assert.equal(cache.has("b"), false, "'b' should have been evicted as LRU");
  assert.equal(cache.has("a"), true, "'a' was accessed and should be retained");
  assert.equal(cache.has("c"), true);
  assert.equal(cache.has("d"), true);
});

test("BoundedLRUCache: Expired TTL entries are safely discarded", async () => {
  const cache = new BoundedLRUCache<string>(10, 50); // 50ms TTL

  cache.set("quick", "expires soon");
  assert.equal(cache.has("quick"), true);
  assert.equal(cache.get("quick"), "expires soon");

  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.equal(cache.has("quick"), false);
  assert.equal(cache.get("quick"), undefined);
});

test("BoundedLRUCache: clear() and delete() operate cleanly", () => {
  const cache = new BoundedLRUCache<string>(10, 10_000);
  cache.set("one", "1");
  cache.set("two", "2");

  assert.equal(cache.delete("one"), true);
  assert.equal(cache.has("one"), false);
  assert.equal(cache.size(), 1);

  cache.clear();
  assert.equal(cache.size(), 0);
  assert.equal(cache.get("two"), undefined);
});

test("Performance Benchmark: BoundedLRUCache 10,000 lookups execute in < 15ms (< 0.002ms each)", () => {
  const cache = new BoundedLRUCache<NormalizedPlaceSuggestion>(100, 60_000);
  const sample: NormalizedPlaceSuggestion = {
    id: "ola-platform:12600",
    name: "Mumbai",
    state: "Maharashtra",
    country: "India",
    formatted: "Mumbai, Maharashtra, India",
    latitude: 19.115393,
    longitude: 72.873716,
    place_id: "ola-platform:12600",
    source: "autocomplete",
  };

  cache.set("mumbai", sample);

  const start = performance.now();
  for (let i = 0; i < 10_000; i++) {
    const val = cache.get("mumbai");
    assert.ok(val !== undefined);
  }
  const duration = performance.now() - start;

  assert.ok(duration < 15, `10,000 in-memory cache lookups took ${duration.toFixed(2)}ms`);
});

test("Location Caches: Global autocompleteCache and reverseGeocodeCache instances are operational", () => {
  autocompleteCache.clear();
  reverseGeocodeCache.clear();

  autocompleteCache.set("delhi", {
    predictions: [],
    suggestions: [
      {
        id: "delhi-1",
        name: "Delhi",
        country: "India",
        formatted: "Delhi, India",
        source: "autocomplete",
      },
    ],
  });

  const geoSample: NormalizedReverseGeocode = {
    formatted_address: "Connaught Place, New Delhi, Delhi, 110001, India",
    name: "Connaught Place",
    city: "New Delhi",
    state: "Delhi",
    country: "India",
    postal_code: "110001",
    latitude: 28.6304,
    longitude: 77.2177,
    source: "geolocation",
  };
  reverseGeocodeCache.set("28.6304,77.2177", geoSample);

  assert.equal(autocompleteCache.has("delhi"), true);
  assert.equal(reverseGeocodeCache.has("28.6304,77.2177"), true);
  assert.equal(reverseGeocodeCache.get("28.6304,77.2177")?.city, "New Delhi");
});

