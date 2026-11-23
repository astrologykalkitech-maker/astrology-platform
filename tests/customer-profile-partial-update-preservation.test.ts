import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 1.6: Customer Profile Partial Update Preservation", () => {
  const customerPath = path.resolve(process.cwd(), "app/actions/customer.ts");
  const content = fs.readFileSync(customerPath, "utf-8");

  it("fetches existing profile before updating to preserve omitted birth details", () => {
    assert.match(
      content,
      /const \{ data: existingProfile \} = await supabase\s*\.from\("profiles"\)\s*\.select\([\s\S]*?\)\s*\.eq\("id", user\.id\)/m,
      "Must fetch existing profile records"
    );
    assert.match(
      content,
      /payload\.date_of_birth !== undefined \? payload\.date_of_birth : \(existingProfile\?\.date_of_birth \?\? null\)/,
      "Must resolve date_of_birth preserving existing value if undefined"
    );
    assert.match(
      content,
      /payload\.time_of_birth !== undefined \? payload\.time_of_birth : \(existingProfile\?\.time_of_birth \?\? null\)/,
      "Must resolve time_of_birth preserving existing value if undefined"
    );
    assert.match(
      content,
      /payload\.birthplace !== undefined \? cleanBirthplace : \(existingProfile\?\.birthplace \?\? null\)/,
      "Must resolve birthplace preserving existing value if undefined"
    );
  });
});
