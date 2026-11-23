import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 2.5: Email Verification Badge & Status Handling", () => {
  const customerActionsPath = path.resolve(process.cwd(), "app/actions/customer.ts");
  const clientPath = path.resolve(process.cwd(), "app/customer/(portal)/profile/CustomerProfileClient.tsx");

  const actionsContent = fs.readFileSync(customerActionsPath, "utf-8");
  const clientContent = fs.readFileSync(clientPath, "utf-8");

  it("checks email_confirmed_at in getCustomerFullProfile to calculate emailVerified", () => {
    assert.match(
      actionsContent,
      /emailVerified:\s*Boolean\(user\.email_confirmed_at\)/,
      "getCustomerFullProfile must evaluate Boolean(user.email_confirmed_at)"
    );
  });

  it("checks email_confirmed_at in getCustomerDashboardData to calculate emailVerified", () => {
    assert.match(
      actionsContent,
      /const isEmailVerified = Boolean\(user\.email_confirmed_at\);/,
      "getCustomerDashboardData must evaluate Boolean(user.email_confirmed_at)"
    );
  });

  it("renders Email Verified badge when initialProfile.emailVerified is true", () => {
    assert.match(
      clientContent,
      /initialProfile\.emailVerified \? \(\s*<span className="inline-flex items-center gap-1 text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 px-2 py-0\.5 rounded-full text-\[11px\]">\s*<CheckCircle2 className="h-3 w-3" \/> Email Verified\s*<\/span>/,
      "Must display emerald Email Verified badge when email is confirmed"
    );
  });

  it("renders Email Pending Verification badge when initialProfile.emailVerified is false", () => {
    assert.match(
      clientContent,
      /<span className="inline-flex items-center gap-1 text-amber-700 font-medium bg-amber-50 border border-amber-200 px-2 py-0\.5 rounded-full text-\[11px\]">\s*<Shield className="h-3 w-3" \/> Email Pending Verification\s*<\/span>/,
      "Must display amber Email Pending Verification badge when email is unconfirmed"
    );
  });
});
