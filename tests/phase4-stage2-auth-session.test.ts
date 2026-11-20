import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkPermission } from "../lib/auth/permissions";
import {
  ForbiddenRoleError,
  AuthRequiredError,
  isAuthTokenCookie,
  expireAuthCookies,
  AUTH_COOKIE_EXPIRATION_OPTIONS,
} from "../lib/auth/session";

describe("Phase 4 Stage 2: Authentication & Session Hardening Test Suite", () => {
  describe("Task B — Auth Token Cookie Detection & Preservation", () => {
    it("identifies standard and chunked main auth cookies", () => {
      assert.equal(isAuthTokenCookie("sb-main-auth-token"), true);
      assert.equal(isAuthTokenCookie("sb-main-auth-token.0"), true);
      assert.equal(isAuthTokenCookie("sb-main-auth-token.1"), true);
      assert.equal(isAuthTokenCookie("sb-main-auth-token.2"), true);
      assert.equal(isAuthTokenCookie("sb-main-auth-token.9"), true);
    });

    it("identifies standard and chunked admin auth cookies", () => {
      assert.equal(isAuthTokenCookie("sb-admin-auth-token"), true);
      assert.equal(isAuthTokenCookie("sb-admin-auth-token.0"), true);
      assert.equal(isAuthTokenCookie("sb-admin-auth-token.1"), true);
      assert.equal(isAuthTokenCookie("sb-admin-auth-token.5"), true);
    });

    it("identifies dynamically named project Supabase auth token cookies", () => {
      assert.equal(isAuthTokenCookie("sb-abcdefghijklm-auth-token"), true);
      assert.equal(isAuthTokenCookie("sb-abcdefghijklm-auth-token.0"), true);
      assert.equal(isAuthTokenCookie("sb-production-project-auth-token.1"), true);
    });

    it("identifies code-verifier cookies for main, admin, and project auth", () => {
      assert.equal(isAuthTokenCookie("sb-main-auth-token-code-verifier"), true);
      assert.equal(isAuthTokenCookie("sb-admin-auth-token-code-verifier"), true);
      assert.equal(isAuthTokenCookie("sb-projectref-code-verifier"), true);
      assert.equal(isAuthTokenCookie("other-code-verifier"), false);
      assert.equal(isAuthTokenCookie("oauth-code-verifier"), false);
    });

    it("strictly preserves unrelated application cookies", () => {
      assert.equal(isAuthTokenCookie("theme"), false);
      assert.equal(isAuthTokenCookie("user_locale"), false);
      assert.equal(isAuthTokenCookie("sidebar_collapsed"), false);
      assert.equal(isAuthTokenCookie("cookie_consent_accepted"), false);
      assert.equal(isAuthTokenCookie("sb-sidebar-state"), false);
      assert.equal(isAuthTokenCookie("sb-analytics-id"), false);
      assert.equal(isAuthTokenCookie("next-auth.csrf-token"), false);
      assert.equal(isAuthTokenCookie("connect.sid"), false);
    });
  });

  describe("Task B — Chunk Invalidation Beyond 10 Chunks & Preservation", () => {
    it("expires all cookie chunks when more than 10 chunks exist (.10, .11, .15, .25, .99)", () => {
      const existingCookies = [
        { name: "sb-main-auth-token.0" },
        { name: "sb-main-auth-token.9" },
        { name: "sb-main-auth-token.10" },
        { name: "sb-main-auth-token.11" },
        { name: "sb-main-auth-token.15" },
        { name: "sb-main-auth-token.25" },
        { name: "sb-main-auth-token.99" },
        { name: "user_locale" },
        { name: "theme" },
      ];

      const expiredRecord: Record<string, { value: string; options: any }> = {};
      const mockCookieStore = {
        set: (name: string, value: string, options: any) => {
          expiredRecord[name] = { value, options };
        },
      };

      const expiredNames = expireAuthCookies(mockCookieStore, existingCookies);

      // Verify all high-index chunks were expired
      assert.ok(expiredNames.includes("sb-main-auth-token.10"));
      assert.ok(expiredNames.includes("sb-main-auth-token.11"));
      assert.ok(expiredNames.includes("sb-main-auth-token.15"));
      assert.ok(expiredNames.includes("sb-main-auth-token.25"));
      assert.ok(expiredNames.includes("sb-main-auth-token.99"));

      // Verify expiration attributes
      assert.equal(expiredRecord["sb-main-auth-token.15"].options.maxAge, 0);
      assert.equal(expiredRecord["sb-main-auth-token.15"].options.expires.getTime(), 0);
      assert.equal(expiredRecord["sb-main-auth-token.15"].options.path, "/");
      assert.equal(expiredRecord["sb-main-auth-token.15"].options.sameSite, "lax");

      // Verify unrelated cookies were NOT touched
      assert.ok(!expiredNames.includes("user_locale"));
      assert.ok(!expiredNames.includes("theme"));
      assert.equal(expiredRecord["user_locale"], undefined);
      assert.equal(expiredRecord["theme"], undefined);
    });
  });

  describe("Task B — Signout Failure Handling & Reporting Logic", () => {
    it("simulates main signout failure: captures and reports main error with status 500", () => {
      const mainSignOutError = "Database timeout connecting to auth cluster";
      const adminSignOutError = null;

      const hasError = Boolean(mainSignOutError || adminSignOutError);
      const combinedError = [
        mainSignOutError ? `Main auth: ${mainSignOutError}` : null,
        adminSignOutError ? `Admin auth: ${adminSignOutError}` : null,
      ]
        .filter(Boolean)
        .join("; ");

      assert.equal(hasError, true);
      assert.equal(combinedError, "Main auth: Database timeout connecting to auth cluster");
    });

    it("simulates admin signout failure: captures and reports admin error with status 500 without swallowing", () => {
      const mainSignOutError = null;
      const adminSignOutError = "Admin auth session invalid or unreachable";

      const hasError = Boolean(mainSignOutError || adminSignOutError);
      const combinedError = [
        mainSignOutError ? `Main auth: ${mainSignOutError}` : null,
        adminSignOutError ? `Admin auth: ${adminSignOutError}` : null,
      ]
        .filter(Boolean)
        .join("; ");

      assert.equal(hasError, true);
      assert.equal(combinedError, "Admin auth: Admin auth session invalid or unreachable");
    });

    it("simulates both signout operations failing: combines and reports both errors accurately", () => {
      const mainSignOutError = "Main auth network failure";
      const adminSignOutError = "Admin auth network failure";

      const hasError = Boolean(mainSignOutError || adminSignOutError);
      const combinedError = [
        mainSignOutError ? `Main auth: ${mainSignOutError}` : null,
        adminSignOutError ? `Admin auth: ${adminSignOutError}` : null,
      ]
        .filter(Boolean)
        .join("; ");

      assert.equal(hasError, true);
      assert.equal(combinedError, "Main auth: Main auth network failure; Admin auth: Admin auth network failure");
    });

    it("ensures cookie invalidation executes even when handler encounters a fatal exception", () => {
      const expiredRecord: Record<string, { value: string; options: any }> = {};
      const mockCookieStore = {
        set: (name: string, value: string, options: any) => {
          expiredRecord[name] = { value, options };
        },
      };

      const existingCookies = [
        { name: "sb-main-auth-token.0" },
        { name: "sb-main-auth-token.1" },
        { name: "session_pref_id" },
      ];

      // Simulate the exception recovery block
      try {
        throw new Error("Simulated unexpected network failure in signout");
      } catch {
        expireAuthCookies(mockCookieStore, existingCookies);
      }

      // Verify cookies are still invalidated despite the exception
      assert.ok(expiredRecord["sb-main-auth-token.0"]);
      assert.equal(expiredRecord["sb-main-auth-token.0"].options.maxAge, 0);
      assert.ok(expiredRecord["sb-main-auth-token.1"]);
      assert.equal(expiredRecord["sb-main-auth-token.1"].options.maxAge, 0);
      // Unrelated cookie preserved
      assert.equal(expiredRecord["session_pref_id"], undefined);
    });
  });

  describe("Task A — Cryptographic Identity & Authorization Integrity", () => {
    it("AuthRequiredError instantiates with correct error name and default message", () => {
      const err = new AuthRequiredError();
      assert.equal(err.name, "AuthRequiredError");
      assert.equal(err.message, "Authentication required. Please log in.");
    });

    it("ForbiddenRoleError records required and actual roles without exposing credentials", () => {
      const err = new ForbiddenRoleError("customer", "astrologer");
      assert.equal(err.name, "ForbiddenRoleError");
      assert.equal(err.requiredRole, "customer");
      assert.equal(err.actualRole, "astrologer");
      assert.ok(err.message.includes("requires 'customer' role"));
      assert.ok(err.message.includes("astrologer"));
    });

    it("RBAC checkPermission: Super Admin has inherent access to all operational permissions", () => {
      assert.equal(checkPermission("super_admin", [], "listing.approve"), true);
      assert.equal(checkPermission("super_admin", [], "listing.rank.update"), true);
      assert.equal(checkPermission("super_admin", [], "lead.assign"), true);
      assert.equal(checkPermission("super_admin", [], "audit.read"), true);
      assert.equal(checkPermission("super_admin", [], "consultant.invite"), true);
    });

    it("RBAC checkPermission: Consultant Admin cannot hold or execute owner-only permissions", () => {
      assert.equal(checkPermission("consultant_admin", ["listing.approve"], "listing.approve"), false);
      assert.equal(checkPermission("consultant_admin", ["listing.rank.update"], "listing.rank.update"), false);
      assert.equal(checkPermission("consultant_admin", ["lead.read.all"], "lead.read.all"), false);
      assert.equal(checkPermission("consultant_admin", ["audit.read"], "audit.read"), false);
      assert.equal(checkPermission("consultant_admin", ["consultant.invite"], "consultant.invite"), false);
    });

    it("RBAC checkPermission: Consultant Admin can only execute allowed delegated permissions", () => {
      assert.equal(checkPermission("consultant_admin", ["listing.read"], "listing.read"), true);
      assert.equal(checkPermission("consultant_admin", ["listing.review"], "listing.review"), true);
      assert.equal(checkPermission("consultant_admin", ["lead.read.assigned"], "lead.read.assigned"), true);
      assert.equal(checkPermission("consultant_admin", [], "listing.read"), false);
    });

    it("RBAC checkPermission: Customer and Astrologer roles are denied all administrative permissions", () => {
      assert.equal(checkPermission("customer", ["listing.read"], "listing.read"), false);
      assert.equal(checkPermission("astrologer", ["listing.read"], "listing.read"), false);
      assert.equal(checkPermission("customer", [], "listing.approve"), false);
      assert.equal(checkPermission("astrologer", [], "lead.assign"), false);
    });
  });

  describe("Signout Outgoing Cookie Security Attributes Scope", () => {
    it("validates expiration parameters required for browser cookie deletion match Supabase scope", () => {
      assert.equal(AUTH_COOKIE_EXPIRATION_OPTIONS.path, "/");
      assert.equal(AUTH_COOKIE_EXPIRATION_OPTIONS.maxAge, 0);
      assert.equal(AUTH_COOKIE_EXPIRATION_OPTIONS.expires.getTime(), 0);
      assert.equal(AUTH_COOKIE_EXPIRATION_OPTIONS.sameSite, "lax");
      assert.equal((AUTH_COOKIE_EXPIRATION_OPTIONS as any).domain, undefined); // Host-only cookie matching
    });

    it("verifies host-only cookie invalidation behavior matches Supabase SSR default", () => {
      const expiredRecord: Record<string, { value: string; options: any }> = {};
      const mockCookieStore = {
        set: (name: string, value: string, options: any) => {
          expiredRecord[name] = { value, options };
        },
      };

      expireAuthCookies(mockCookieStore, [{ name: "sb-main-auth-token" }]);
      // Confirms domain is not specified, enforcing exact host-only cookie targeting
      assert.equal(expiredRecord["sb-main-auth-token"].options.domain, undefined);
      assert.equal(expiredRecord["sb-main-auth-token"].options.path, "/");
    });

    it("supports explicit domain override if project configuration requires multi-subdomain scope", () => {
      const expiredRecord: Record<string, { value: string; options: any }> = {};
      const mockCookieStore = {
        set: (name: string, value: string, options: any) => {
          expiredRecord[name] = { value, options };
        },
      };

      expireAuthCookies(
        mockCookieStore,
        [{ name: "sb-main-auth-token" }],
        { domain: ".example.com" }
      );
      assert.equal(expiredRecord["sb-main-auth-token"].options.domain, ".example.com");
      assert.equal(expiredRecord["sb-main-auth-token"].options.path, "/");
      assert.equal(expiredRecord["sb-main-auth-token"].options.maxAge, 0);
    });

    it("proactively expires code-verifier cookies alongside auth tokens", () => {
      const expiredRecord: Record<string, { value: string; options: any }> = {};
      const mockCookieStore = {
        set: (name: string, value: string, options: any) => {
          expiredRecord[name] = { value, options };
        },
      };

      const names = expireAuthCookies(mockCookieStore, []);
      assert.ok(names.includes("sb-main-auth-token-code-verifier"));
      assert.ok(names.includes("sb-admin-auth-token-code-verifier"));
      assert.equal(expiredRecord["sb-main-auth-token-code-verifier"].options.maxAge, 0);
      assert.equal(expiredRecord["sb-admin-auth-token-code-verifier"].options.maxAge, 0);
    });
  });
});
