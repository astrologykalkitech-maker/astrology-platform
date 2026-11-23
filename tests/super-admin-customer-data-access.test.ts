import { test } from "node:test";
import assert from "node:assert/strict";
import { redactSensitiveData, sanitizeLogMessage, REDACTED_MARKER } from "../lib/security/redact";
import fs from "node:fs";
import path from "node:path";

test("Sub-phase 1.4: Customer Data Access Restrictions & PII Redaction", async (t) => {
  await t.test("redactSensitiveData redacts sensitive customer PII and credential fields", () => {
    const rawPayload = {
      user_id: "c0000000-0000-4000-8000-000000000001",
      full_name: "Test Customer",
      password: "secretPassword123!",
      token: "jwt.sample.token",
      phone_number: "+919876543210",
      date_of_birth: "1990-05-15",
      time_of_birth: "14:30:00",
      birthplace: "New Delhi, India",
      pan_number: "ABCDE1234F",
      aadhaar: "123456789012",
      gov_id: "ID-999888",
      nested: {
        access_token: "secretAccessToken",
        dob: "1990-05-15",
        operational_id: "op-12345",
      },
    };

    const redacted = redactSensitiveData(rawPayload) as Record<string, any>;

    // Operational and non-sensitive identifiers are preserved
    assert.strictEqual(redacted.user_id, "c0000000-0000-4000-8000-000000000001");
    assert.strictEqual(redacted.full_name, "Test Customer");
    assert.strictEqual(redacted.nested.operational_id, "op-12345");

    // All sensitive PII & credentials must be replaced by REDACTED_MARKER
    assert.strictEqual(redacted.password, REDACTED_MARKER);
    assert.strictEqual(redacted.token, REDACTED_MARKER);
    assert.strictEqual(redacted.phone_number, REDACTED_MARKER);
    assert.strictEqual(redacted.date_of_birth, REDACTED_MARKER);
    assert.strictEqual(redacted.time_of_birth, REDACTED_MARKER);
    assert.strictEqual(redacted.birthplace, REDACTED_MARKER);
    assert.strictEqual(redacted.pan_number, REDACTED_MARKER);
    assert.strictEqual(redacted.aadhaar, REDACTED_MARKER);
    assert.strictEqual(redacted.gov_id, REDACTED_MARKER);
    assert.strictEqual(redacted.nested.access_token, REDACTED_MARKER);
    assert.strictEqual(redacted.nested.dob, REDACTED_MARKER);
  });

  await t.test("sanitizeLogMessage redacts bearer tokens, query secrets and passwords from error logs", () => {
    const rawError = "Failed with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 and password=SuperSecret";
    const sanitized = sanitizeLogMessage(rawError);
    assert.ok(!sanitized.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"), "Bearer token must be redacted");
    assert.ok(!sanitized.includes("SuperSecret"), "Password value must be redacted");
  });

  await t.test("Admin customer actions strictly shield PII and enforce Super Admin privilege", () => {
    const actionsPath = path.resolve(process.cwd(), "app/actions/admin-customers.ts");
    assert.ok(fs.existsSync(actionsPath), "admin-customers.ts must exist");
    const content = fs.readFileSync(actionsPath, "utf-8");

    // Ensure getAdminCustomers enforces requireSuperAdmin
    assert.match(content, /await requireSuperAdmin\(\)/, "Must enforce requireSuperAdmin for customer lists");
    
    // Ensure soft deletion / privacy deletion anonymizes profile PII
    assert.match(content, /full_name:\s*["']\[Deleted Customer\]["']/, "Customer deletion must anonymize name");
    assert.match(content, /phone:\s*null/, "Customer deletion must purge phone");
    assert.match(content, /date_of_birth:\s*null/, "Customer deletion must purge date_of_birth");
    assert.match(content, /birthplace:\s*null/, "Customer deletion must purge birthplace");
  });
});
