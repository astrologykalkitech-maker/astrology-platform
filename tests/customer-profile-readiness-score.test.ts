import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 2.12: Profile Readiness Score Calculation & Visual Ring", () => {
  const clientPath = path.resolve(process.cwd(), "app/customer/(portal)/profile/CustomerProfileClient.tsx");
  const clientContent = fs.readFileSync(clientPath, "utf-8");

  it("calculates profile readiness score across all 6 core attributes", () => {
    assert.match(
      clientContent,
      /const fields = \[\s*Boolean\(fullName\.trim\(\)\),\s*Boolean\(initialProfile\.emailVerified\),\s*Boolean\(phone\.trim\(\)\),\s*Boolean\(dateOfBirth\),\s*Boolean\(timeOfBirth\),\s*Boolean\(birthplace\.trim\(\)\),\s*\];/
    );
    assert.match(
      clientContent,
      /const completedCount = fields\.filter\(Boolean\)\.length;\s*const readinessPercent = Math\.round\(\(completedCount \/ fields\.length\) \* 100\);/
    );
  });

  it("renders Kundli Readiness percentage display and dynamic guidance text", () => {
    assert.match(clientContent, /Kundli Readiness/);
    assert.match(clientContent, /\{readinessPercent\}%/);
    assert.match(
      clientContent,
      /readinessPercent === 100\s*\?\s*"All birth data complete for high-precision astrologer charts\."\s*:\s*"Add birth time & place for exact planetary lagna calculations\."/
    );
  });
});
