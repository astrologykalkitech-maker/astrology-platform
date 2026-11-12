import test from "node:test";
import assert from "node:assert/strict";
import { RITUAL_CATALOG } from "../lib/astrology/protection-rituals-catalog";

test("Protection Rituals Catalog: Comprehensive Vedic Catalog Integrity", () => {
  assert.ok(RITUAL_CATALOG.length >= 8, "Catalog must contain comprehensive traditional rituals");

  const categories = new Set(RITUAL_CATALOG.map((r) => r.category));
  assert.ok(categories.has("evil_eye"), "Must have evil_eye category");
  assert.ok(categories.has("negative_energy"), "Must have negative_energy category");
  assert.ok(categories.has("home"), "Must have home category");
  assert.ok(categories.has("spiritual"), "Must have spiritual category");
  assert.ok(categories.has("personal"), "Must have personal category");
  assert.ok(categories.has("vedic"), "Must have vedic category");

  for (const ritual of RITUAL_CATALOG) {
    assert.ok(ritual.title && ritual.title.length > 5, `Ritual ${ritual.id} must have a descriptive title`);
    assert.ok(ritual.purpose && ritual.purpose.length > 10, `Ritual ${ritual.id} must have a clear purpose`);
    assert.ok(ritual.instructions && ritual.instructions.length >= 3, `Ritual ${ritual.id} must have step-by-step instructions`);
    assert.ok(ritual.required_materials && ritual.required_materials.length >= 1, `Ritual ${ritual.id} must list materials`);
    assert.ok(ritual.duration_minutes > 0, `Ritual ${ritual.id} must have a positive duration`);
    assert.ok(ritual.frequency && ritual.frequency.length > 0, `Ritual ${ritual.id} must state frequency`);
    assert.ok(ritual.precautions, `Ritual ${ritual.id} must specify safety precautions`);
    assert.ok(ritual.alternative, `Ritual ${ritual.id} must specify a gentle alternative`);
  }
});

test("Protection Rituals Security: No Fear-Based Guarantee Claims", () => {
  for (const ritual of RITUAL_CATALOG) {
    const text = (ritual.purpose + " " + ritual.description).toLowerCase();
    assert.equal(text.includes("guaranteed to cure"), false, "Must not claim to cure diseases");
    assert.equal(text.includes("eliminates all doshas completely"), false, "Must not make unrealistic miraculous claims");
    assert.equal(text.includes("prevents all accidents"), false, "Must not promise accident immunity");
  }
});

