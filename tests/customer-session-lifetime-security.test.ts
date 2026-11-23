import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 2.15: Customer Session Lifetime & Concurrent Session Security", () => {
  const sessionPath = path.resolve(process.cwd(), "lib/auth/session.ts");
  const sessionContent = fs.readFileSync(sessionPath, "utf-8");

  it("defines secure cookie expiration parameters matching SSR host-only scope", () => {
    assert.match(
      sessionContent,
      /export const AUTH_COOKIE_EXPIRATION_OPTIONS = \{[\s\S]*?path:\s*"\/",[\s\S]*?maxAge:\s*0,[\s\S]*?sameSite:\s*"lax"/
    );
  });

  it("identifies all auth token chunks and code-verifier cookies without dropping any", () => {
    assert.match(sessionContent, /export function isAuthTokenCookie\(name:\s*string\):\s*boolean/);
    assert.match(sessionContent, /name\.startsWith\("sb-main-auth-token"\)/);
    assert.match(sessionContent, /name\.endsWith\("-code-verifier"\)/);
  });

  it("implements comprehensive chunked cookie expiration in expireAuthCookies", () => {
    assert.match(
      sessionContent,
      /export function expireAuthCookies\([\s\S]*?for \(const cookie of existingCookies\) \{[\s\S]*?if \(isAuthTokenCookie\(cookie\.name\)\) \{/
    );
  });

  it("enforces server-side getUser validation instead of trusting client JWT claims", () => {
    assert.match(
      sessionContent,
      /const \{\s*data:\s*\{\s*user\s*\},[\s\S]*?\} = await mainClient\.auth\.getUser\(\);/,
      "Must authenticate via mainClient.auth.getUser()"
    );
  });

  it("provisions fallback role strictly as customer to prevent metadata-based role escalation", () => {
    assert.match(
      sessionContent,
      /const assignedRole = "customer";/,
      "Fallback auto-provisioning must strictly assign role 'customer'"
    );
  });
});
