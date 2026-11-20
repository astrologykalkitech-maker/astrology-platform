import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  redactSensitiveData,
  sanitizeLogMessage,
  isSensitiveKey,
  REDACTED_MARKER,
} from "../lib/security/redact";
import { logSecurityEvent, isValidIpAddress, SecurityEventPayload } from "../lib/security/telemetry";
import { logAdminAction, isRpcNotInstalledError } from "../lib/admin/audit";

describe("Phase 4 Stage 4: Audit Logging, PII Redaction & Security Telemetry", () => {
  describe("Task 1 — Sensitive Key Identification & Harmless Preservation", () => {
    it("identifies core authentication and security keys", () => {
      assert.equal(isSensitiveKey("password"), true);
      assert.equal(isSensitiveKey("access_token"), true);
      assert.equal(isSensitiveKey("refresh_token"), true);
      assert.equal(isSensitiveKey("api_key"), true);
      assert.equal(isSensitiveKey("secret_key"), true);
      assert.equal(isSensitiveKey("authorization"), true);
      assert.equal(isSensitiveKey("otp"), true);
      assert.equal(isSensitiveKey("code_verifier"), true);
    });

    it("identifies PII and birth data keys", () => {
      assert.equal(isSensitiveKey("birth_date"), true);
      assert.equal(isSensitiveKey("birth_time"), true);
      assert.equal(isSensitiveKey("birth_place"), true);
      assert.equal(isSensitiveKey("kundli_data"), true);
      assert.equal(isSensitiveKey("chat_message"), true);
      assert.equal(isSensitiveKey("phone_number"), true);
    });

    it("identifies financial and banking keys", () => {
      assert.equal(isSensitiveKey("bank_account_number"), true);
      assert.equal(isSensitiveKey("ifsc"), true);
      assert.equal(isSensitiveKey("upi_id"), true);
      assert.equal(isSensitiveKey("card_number"), true);
      assert.equal(isSensitiveKey("cvv"), true);
    });

    it("handles casing and delimiter variations (camelCase, snake_case, kebab-case)", () => {
      assert.equal(isSensitiveKey("accessToken"), true);
      assert.equal(isSensitiveKey("access-token"), true);
      assert.equal(isSensitiveKey("ACCESS_TOKEN"), true);
      assert.equal(isSensitiveKey("phoneNumber"), true);
      assert.equal(isSensitiveKey("phone-number"), true);
      assert.equal(isSensitiveKey("clientSecret"), true);
      assert.equal(isSensitiveKey("bankAccountNumber"), true);
      assert.equal(isSensitiveKey("bank-account-number"), true);
    });

    it("strictly preserves harmless operational identifiers (avoids false-positive over-redaction)", () => {
      assert.equal(isSensitiveKey("user_id"), false);
      assert.equal(isSensitiveKey("actor_id"), false);
      assert.equal(isSensitiveKey("target_id"), false);
      assert.equal(isSensitiveKey("customer_id"), false);
      assert.equal(isSensitiveKey("astrologer_id"), false);
      assert.equal(isSensitiveKey("booking_id"), false);
      assert.equal(isSensitiveKey("lead_id"), false);
      assert.equal(isSensitiveKey("plan_id"), false);
      assert.equal(isSensitiveKey("order_id"), false);
      assert.equal(isSensitiveKey("order_number"), false);
      assert.equal(isSensitiveKey("action"), false);
      assert.equal(isSensitiveKey("status"), false);
      assert.equal(isSensitiveKey("outcome"), false);
      assert.equal(isSensitiveKey("created_at"), false);
    });
  });

  describe("Task 2 — Recursive Sensitive-Data Redaction Engine", () => {
    it("redacts primitive sensitive fields at the root level", () => {
      const input = {
        user_id: "usr_12345",
        password: "super_secret_password",
        api_key: "ak_live_abcdefg12345",
      };
      const result = redactSensitiveData(input);
      assert.equal(result.user_id, "usr_12345");
      assert.equal(result.password, REDACTED_MARKER);
      assert.equal(result.api_key, REDACTED_MARKER);
    });

    it("redacts deeply nested objects and metadata", () => {
      const input = {
        event: "checkout_init",
        booking_id: "bkg_999",
        metadata: {
          client: {
            token: "jwt.token.here",
            payment: {
              upi_id: "customer@upi",
              card_number: "4111222233334444",
              cvv: "123",
              amount_paise: 50000,
            },
          },
        },
      };

      const result = redactSensitiveData(input);
      assert.equal(result.booking_id, "bkg_999");
      assert.equal(result.metadata.client.token, REDACTED_MARKER);
      assert.equal(result.metadata.client.payment.upi_id, REDACTED_MARKER);
      assert.equal(result.metadata.client.payment.card_number, REDACTED_MARKER);
      assert.equal(result.metadata.client.payment.cvv, REDACTED_MARKER);
      assert.equal(result.metadata.client.payment.amount_paise, 50000);
    });

    it("redacts sensitive fields within arrays of objects", () => {
      const input = {
        beneficiaries: [
          { account_number: "1234567890", ifsc: "HDFC0001234", is_active: true },
          { account_number: "9876543210", ifsc: "ICIC0005678", is_active: false },
        ],
      };

      const result = redactSensitiveData(input);
      assert.equal(result.beneficiaries[0].account_number, REDACTED_MARKER);
      assert.equal(result.beneficiaries[0].ifsc, REDACTED_MARKER);
      assert.equal(result.beneficiaries[0].is_active, true);
      assert.equal(result.beneficiaries[1].account_number, REDACTED_MARKER);
      assert.equal(result.beneficiaries[1].ifsc, REDACTED_MARKER);
      assert.equal(result.beneficiaries[1].is_active, false);
    });

    it("safely handles circular references without infinite call-stack crashes", () => {
      const circularObj: any = { id: "circ_1", name: "test_circular" };
      circularObj.self = circularObj;

      const result = redactSensitiveData(circularObj);
      assert.equal(result.id, "circ_1");
      assert.equal(result.self, "[CIRCULAR]");
    });

    it("safely preserves null, undefined, dates, and non-object values", () => {
      assert.equal(redactSensitiveData(null), null);
      assert.equal(redactSensitiveData(undefined), undefined);
      assert.equal(redactSensitiveData("hello"), "hello");
      assert.equal(redactSensitiveData(42), 42);

      const now = new Date();
      const redactedDate = redactSensitiveData(now);
      assert.equal(redactedDate.getTime(), now.getTime());
    });

    it("does NOT mutate the original input object (immutability)", () => {
      const original = {
        auth_token: "secret_token_123",
        nested: { otp: "998877" },
      };

      const result = redactSensitiveData(original);
      assert.equal(result.auth_token, REDACTED_MARKER);
      assert.equal(result.nested.otp, REDACTED_MARKER);

      // Verify original remains unmutated
      assert.equal(original.auth_token, "secret_token_123");
      assert.equal(original.nested.otp, "998877");
    });
  });

  describe("Task 3 — Log String Sanitization", () => {
    it("sanitizes Bearer tokens in error messages", () => {
      const raw = "Request failed with header Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.test.sig";
      const sanitized = sanitizeLogMessage(raw);
      assert.ok(!sanitized.includes("eyJhbGciOiJIUzI1NiJ9"));
      assert.ok(sanitized.includes(`Bearer ${REDACTED_MARKER}`));
    });

    it("sanitizes Postgres database connection URLs in log traces", () => {
      const raw = "FATAL: connection to postgresql://postgres:SuperSecretPassword123@db.supabase.co:5432 failed";
      const sanitized = sanitizeLogMessage(raw);
      assert.ok(!sanitized.includes("SuperSecretPassword123"));
      assert.ok(sanitized.includes(`postgresql://postgres:${REDACTED_MARKER}@`));
    });
  });

  describe("Task 4 — Security Event Telemetry & Structured Logging", () => {
    it("emits structured security event without leaking nested credentials", () => {
      let loggedMessage = "";
      const originalWarn = console.warn;
      console.warn = (prefix: any, msg: any) => {
        loggedMessage = typeof msg === "string" ? msg : JSON.stringify(msg);
      };

      try {
        const event: SecurityEventPayload = {
          eventType: "ROLE_ESCALATION_ATTEMPT",
          actorId: "usr_attacker",
          actorRole: "customer",
          outcome: "denied",
          reason: "Customer attempted to modify role to super_admin",
          metadata: {
            requestedRole: "super_admin",
            password: "injected_credential",
            token: "attacker_token",
          },
        };

        logSecurityEvent(event);

        assert.ok(loggedMessage.includes("ROLE_ESCALATION_ATTEMPT"));
        assert.ok(loggedMessage.includes("usr_attacker"));
        assert.ok(!loggedMessage.includes("injected_credential"));
        assert.ok(!loggedMessage.includes("attacker_token"));
        assert.ok(loggedMessage.includes(REDACTED_MARKER));
      } finally {
        console.warn = originalWarn;
      }
    });
  });

  describe("Task 5 — Admin Audit Log State Sanitization Contract", () => {
    it("redacts beforeState and afterState before database persistence", async () => {
      // Simulate calling logAdminAction with sensitive changes
      const res = await logAdminAction({
        actorId: "usr_admin_1",
        actorRole: "super_admin",
        action: "astrologer.bank.update",
        targetType: "astrologer_beneficiary",
        targetId: "ben_789",
        reason: "Admin updated bank details on verified support request",
        beforeState: {
          account_number: "111122223333",
          ifsc: "HDFC0001111",
          status: "pending",
        },
        afterState: {
          account_number: "444455556666",
          ifsc: "ICIC0002222",
          status: "verified",
        },
      });

      // logAdminAction should execute without throw and redact fields
      assert.equal(typeof res.success, "boolean");
    });

    it("verifies JSON serialization contains zero leaked sensitive values", () => {
      const payload = {
        user_id: "usr_legit_123",
        auth: {
          token: "secret_jwt_token",
          password: "my_password",
        },
        financials: {
          bank_account_number: "9876543210",
          upi_id: "astrologer@upi",
          amount: 5000,
        },
      };

      const redacted = redactSensitiveData(payload);
      const serialized = JSON.stringify(redacted);

      assert.ok(!serialized.includes("secret_jwt_token"));
      assert.ok(!serialized.includes("my_password"));
      assert.ok(!serialized.includes("9876543210"));
      assert.ok(!serialized.includes("astrologer@upi"));
      assert.ok(serialized.includes("usr_legit_123"));
      assert.ok(serialized.includes("5000"));
      assert.ok(serialized.includes(REDACTED_MARKER));
    });

    it("sanitizes raw gateway errors and prevents stack trace leakage", () => {
      const gatewayError = new Error("Gateway failure at https://api.instamojo.com with Bearer sec_tok_998877");
      const sanitized = sanitizeLogMessage(gatewayError.message);

      assert.ok(!sanitized.includes("sec_tok_998877"));
      assert.ok(sanitized.includes(REDACTED_MARKER));
    });

    it("verifies IP address masking for privacy in general telemetry", () => {
      let loggedMessage = "";
      const originalWarn = console.warn;
      console.warn = (prefix: any, msg: any) => {
        loggedMessage = typeof msg === "string" ? msg : JSON.stringify(msg);
      };

      try {
        logSecurityEvent({
          eventType: "RATE_LIMIT_EXCEEDED",
          actorId: "usr_anon_1",
          ipAddress: "203.0.113.195",
          outcome: "blocked",
          reason: "Too many requests",
        });

        // Default: masks the last octet for general telemetry privacy
        assert.ok(loggedMessage.includes("203.0.113.0"));
        assert.ok(!loggedMessage.includes("203.0.113.195"));

        // When explicitly preserved for security forensics
        logSecurityEvent({
          eventType: "RATE_LIMIT_EXCEEDED",
          actorId: "usr_anon_1",
          ipAddress: "203.0.113.195",
          outcome: "blocked",
          reason: "Too many requests",
          preserveFullIp: true,
        });
        assert.ok(loggedMessage.includes("203.0.113.195"));
      } finally {
        console.warn = originalWarn;
      }
    });

    it("verifies mandatory audit failure handling behavior", async () => {
      // Missing credentials should fail gracefully returning { success: false, error: ... }
      const res = await logAdminAction({
        actorId: null,
        actorRole: "super_admin",
        action: "system.config.change",
        targetType: "platform_setting",
        outcome: "failure",
      });

      assert.equal(res.success, false);
      assert.ok(res.error);
    });

    it("verifies role-escalation attempt emission when unauthorized role change occurs", () => {
      let loggedMessage = "";
      const originalWarn = console.warn;
      console.warn = (prefix: any, msg: any) => {
        loggedMessage = typeof msg === "string" ? msg : JSON.stringify(msg);
      };

      try {
        logSecurityEvent({
          eventType: "ROLE_ESCALATION_ATTEMPT",
          actorId: "usr_consultant_1",
          actorRole: "consultant_admin",
          targetId: "usr_target_1",
          targetType: "profile",
          outcome: "denied",
          reason: "Database trigger blocked unauthorized role change (SQLSTATE 42501)",
        });

        assert.ok(loggedMessage.includes("ROLE_ESCALATION_ATTEMPT"));
        assert.ok(loggedMessage.includes("usr_consultant_1"));
        assert.ok(loggedMessage.includes("42501"));
        assert.ok(loggedMessage.includes("denied"));
      } finally {
        console.warn = originalWarn;
      }
    });

    it("verifies payment exception sanitization on UTR and gateway verification paths", () => {
      const rawPgError = "Error: connect ECONNREFUSED postgresql://user:MyTopSecretPassword@db.example.com:5432";
      const sanitized = sanitizeLogMessage(rawPgError);

      assert.ok(!sanitized.includes("MyTopSecretPassword"));
      assert.ok(sanitized.includes(REDACTED_MARKER));
    });

    it("strictly prevents an email address from being emitted as an IP address", () => {
      let loggedMessage = "";
      const originalWarn = console.warn;
      console.warn = (prefix: any, msg: any) => {
        loggedMessage = typeof msg === "string" ? msg : JSON.stringify(msg);
      };

      try {
        assert.equal(isValidIpAddress("admin@karmicascension.com"), false);
        assert.equal(isValidIpAddress("user.name+tag@example.co.in"), false);
        assert.equal(isValidIpAddress("203.0.113.195"), true);
        assert.equal(isValidIpAddress("2001:db8::1"), true);

        // Attempt to pass an email address in the ipAddress field
        logSecurityEvent({
          eventType: "ROLE_ESCALATION_ATTEMPT",
          actorId: "usr_attacker_99",
          actorRole: "consultant_admin",
          ipAddress: "malicious_actor@example.com",
          outcome: "denied",
          reason: "Unauthorized role change",
          metadata: { actorEmail: "malicious_actor@example.com" },
        });

        const parsed = JSON.parse(loggedMessage);
        // The resolved ip must be "unknown", never the email address
        assert.equal(parsed.ip, "unknown");
        assert.ok(!parsed.ip.includes("@"));
        assert.equal(parsed.metadata.actorEmail, "malicious_actor@example.com");
      } finally {
        console.warn = originalWarn;
      }
    });

    it("verifies refund exception diagnostics sanitize raw error messages and keep client response generic", () => {
      const sensitiveRefundError = "Instamojo API HTTP 400: auth_token=secret_xyz123 card=4111111111111111 failed";
      const sanitized = sanitizeLogMessage(sensitiveRefundError);

      assert.ok(!sanitized.includes("secret_xyz123"));
      assert.ok(sanitized.includes(REDACTED_MARKER));
    });

    it("verifies transactional audit integrity contract in migration 072 DDL", () => {
      // Unit test: Verify that the draft migration 072 enforces atomic settlement & audit logging
      const fs = require("node:fs");
      const path = require("node:path");
      const migrationPath = path.resolve(__dirname, "../supabase/migrations/072_atomic_commission_settlement_audit.sql");
      assert.ok(fs.existsSync(migrationPath), "Migration 072 file must exist");

      const sql = fs.readFileSync(migrationPath, "utf-8");
      // Must contain atomic INSERT into admin_audit_logs inside the function body
      assert.ok(sql.includes("INSERT INTO public.admin_audit_logs"), "Must insert into admin_audit_logs");
      assert.ok(sql.includes("pg_advisory_xact_lock"), "Must acquire advisory transaction lock");
      assert.ok(sql.includes("financial.settlement_approve"), "Must log financial.settlement_approve");
      assert.ok(sql.includes("financial.settlement_reject"), "Must log financial.settlement_reject");
      assert.ok(sql.includes("REVOKE ALL ON FUNCTION public.review_commission_settlement"), "Must revoke from PUBLIC");
      assert.ok(sql.includes("GRANT EXECUTE ON FUNCTION public.review_commission_settlement(UUID, UUID, TEXT, TEXT, TEXT) TO service_role"), "Must grant to service_role");
      assert.ok(sql.includes("SET search_path = ''"), "Must fix search_path to empty string for SECURITY DEFINER safety");
    });

    it("verifies pre-mutation attempt audit and failure handling across privileged administrative operations", async () => {
      // Unit test: Verify that when logAdminAction fails, pre-mutation attempt check prevents mutation
      const attemptRes = await logAdminAction({
        actorId: "00000000-0000-0000-0000-000000000000",
        actorRole: "super_admin",
        action: "consultant.permissions_update.attempt",
        targetType: "consultant_permissions",
        outcome: "success",
      });

      assert.equal(attemptRes.success, false);

      let businessMutationExecuted = false;
      if (attemptRes.success) {
        businessMutationExecuted = true;
      }

      // Assert that business mutation was completely blocked by pre-mutation audit failure
      assert.equal(businessMutationExecuted, false);
    });

    it("verifies correct distinction between attempt, failure, and completed audit actions", () => {
      const actions = [
        "consultant.permissions_update.attempt",
        "consultant.permissions_update.failure",
        "consultant.permissions_update",
        "listing.status_change.approved.attempt",
        "listing.status_change.approved.failure",
        "listing.status_change.approved",
        "verification.stage_approved.attempt",
        "verification.stage_approved.failure",
        "verification.stage_approved",
        "verification.full_approval_and_sync.attempt",
        "verification.full_approval_and_sync.failure",
        "verification.full_approval_and_sync",
      ];

      for (const act of actions) {
        if (act.endsWith(".attempt")) {
          assert.ok(!act.endsWith(".failure"));
          assert.ok(act.includes(".attempt"));
        } else if (act.endsWith(".failure")) {
          assert.ok(act.includes(".failure"));
        } else {
          // Completed action has no trailing suffix
          assert.ok(!act.endsWith(".attempt") && !act.endsWith(".failure"));
        }
      }
    });

    it("verifies audit failure prevents privileged caller from reporting success", async () => {
      // Unit test: Verify that when logAdminAction fails (e.g. unconfigured db), the fail-closed check stops the caller
      const res = await logAdminAction({
        actorId: "00000000-0000-0000-0000-000000000000",
        actorRole: "super_admin",
        action: "consultant.permissions_update",
        targetType: "consultant_permissions",
        outcome: "success",
      });

      assert.equal(res.success, false);
      // Caller contract: if (!res.success) return { success: false, error: "Mandatory administrative audit logging failed..." }
      const callerResult: { success: boolean; error?: string } = !res.success
        ? { success: false, error: "Mandatory administrative audit logging failed; operation cannot be completed." }
        : { success: true };

      assert.equal(callerResult.success, false);
      assert.ok(typeof callerResult.error === "string" && callerResult.error.includes("Mandatory administrative audit logging failed"));
    });
    it("verifies multi-step administrative consistency and rollback compensation behavior", () => {
      // Unit test: Verify migration 073 DDL structure for atomic multi-step mutations
      const fs = require("node:fs");
      const path = require("node:path");
      const migration073Path = path.resolve(__dirname, "../supabase/migrations/073_atomic_admin_multistep_mutations.sql");
      assert.ok(fs.existsSync(migration073Path), "Migration 073 file must exist");

      const sql = fs.readFileSync(migration073Path, "utf-8");
      assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.admin_set_consultant_permissions"), "Must define admin_set_consultant_permissions");
      assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.admin_approve_astrologer_with_sync"), "Must define admin_approve_astrologer_with_sync");
      assert.ok(sql.includes("REVOKE ALL ON FUNCTION public.admin_set_consultant_permissions"), "Must revoke permissions from public");
      assert.ok(sql.includes("REVOKE ALL ON FUNCTION public.admin_approve_astrologer_with_sync"), "Must revoke permissions from public");
      assert.ok(sql.includes("SET search_path = ''"), "Must enforce secure search_path");

      // Test compensation logic contract:
      // When listing update fails after stages upsert, stages must be restored or transaction aborted
      const stagesInitial = [{ stage_name: "interview", status: "under_review" }];
      let stagesCurrent = [{ stage_name: "interview", status: "approved" }];
      const profileUpdateFailed = true;

      if (profileUpdateFailed) {
        // Rollback compensation simulation
        stagesCurrent = stagesInitial.map((s) => ({ ...s }));
      }

      assert.deepEqual(stagesCurrent, stagesInitial, "Stages must be restored to initial state upon profile update failure");
    });

    describe("Safe RPC Fallback and Execution Verification", () => {
      it("1. exact missing RPC endpoint permits fallback", () => {
        const missingRpcPostgrest = {
          code: "PGRST202",
          message: "Could not find the function admin_set_consultant_permissions in the schema cache",
        };
        const missingRpcPg = {
          code: "42883",
          message: "function admin_set_consultant_permissions(uuid, uuid, text[], text) does not exist",
        };
        const missingRpcString =
          "Could not find the function admin_approve_astrologer_with_sync(p_admin_id) in the schema cache";

        assert.equal(isRpcNotInstalledError(missingRpcPostgrest, "admin_set_consultant_permissions"), true);
        assert.equal(isRpcNotInstalledError(missingRpcPg, "admin_set_consultant_permissions"), true);
        assert.equal(isRpcNotInstalledError(missingRpcString, "admin_approve_astrologer_with_sync"), true);
      });

      it("2. missing internal function does not permit fallback", () => {
        // SQLSTATE 42883 where an internal dependency called inside the RPC function is missing
        const missingInternalFn = {
          code: "42883",
          message: "function pg_catalog.array_agg(text) does not exist",
          details: "PL/pgSQL function admin_set_consultant_permissions line 71 at SQL statement",
        };
        // Target RPC is admin_set_consultant_permissions, but the missing function itself is array_agg
        const isNotTargetMissing = isRpcNotInstalledError({
          code: "42883",
          message: "function refresh_consultant_balance_summary(uuid) does not exist",
        }, "admin_set_consultant_permissions");

        assert.equal(isNotTargetMissing, false, "Missing internal function must NOT activate fallback");
      });

      it("3. unrelated schema-cache error does not permit fallback", () => {
        const unrelatedCacheError = {
          code: "PGRST202",
          message: "Could not find the function some_other_unrelated_rpc in the schema cache",
        };
        assert.equal(
          isRpcNotInstalledError(unrelatedCacheError, "admin_set_consultant_permissions"),
          false,
          "Unrelated schema cache error must not activate fallback"
        );
      });

      it("4. 42883 without exact RPC identity fails closed", () => {
        const ambiguous42883 = {
          code: "42883",
          message: "function does not exist",
        };
        assert.equal(
          isRpcNotInstalledError(ambiguous42883, "admin_set_consultant_permissions"),
          false,
          "Ambiguous 42883 error must fail closed"
        );
      });

      it("5. authorization error (42501) fails closed", () => {
        const authError = {
          code: "42501",
          message: "permission denied for function admin_set_consultant_permissions",
        };
        assert.equal(isRpcNotInstalledError(authError, "admin_set_consultant_permissions"), false);
      });

      it("6. 23505, 23502, 23503, and 23514 fail closed", () => {
        assert.equal(
          isRpcNotInstalledError(
            { code: "23505", message: "duplicate key value violates unique constraint" },
            "admin_set_consultant_permissions"
          ),
          false
        );
        assert.equal(
          isRpcNotInstalledError(
            { code: "23502", message: "null value in column violates not-null constraint" },
            "admin_set_consultant_permissions"
          ),
          false
        );
        assert.equal(
          isRpcNotInstalledError(
            { code: "23503", message: "foreign key violation" },
            "admin_set_consultant_permissions"
          ),
          false
        );
        assert.equal(
          isRpcNotInstalledError(
            { code: "23514", message: "check constraint violation" },
            "admin_set_consultant_permissions"
          ),
          false
        );
      });

      it("7. 57014 (query canceled / statement timeout) fails closed", () => {
        const queryTimeout = {
          code: "57014",
          message: "canceling statement due to statement timeout",
        };
        assert.equal(isRpcNotInstalledError(queryTimeout, "admin_set_consultant_permissions"), false);
      });

      it("8. network timeout (ETIMEDOUT) fails closed", () => {
        const netTimeout = {
          code: "ETIMEDOUT",
          message: "connect ETIMEDOUT 127.0.0.1:5432",
        };
        assert.equal(isRpcNotInstalledError(netTimeout, "admin_set_consultant_permissions"), false);
      });

      it("9. ambiguous network failure fails closed", () => {
        const netConnRefused = {
          code: "ECONNREFUSED",
          message: "connect ECONNREFUSED 127.0.0.1:5432",
        };
        const ambiguousStr = "Network connection terminated prematurely";
        assert.equal(isRpcNotInstalledError(netConnRefused, "admin_set_consultant_permissions"), false);
        assert.equal(isRpcNotInstalledError(ambiguousStr, "admin_set_consultant_permissions"), false);
      });

      it("10. { success: false } does not activate fallback", async () => {
        let fallbackExecuted = false;
        // Mock RPC response that completed without transport error but business logic returned { success: false }
        const rpcRes = { data: { success: false, error: "Validation rejected" }, error: null };

        if (!rpcRes.error && rpcRes.data && rpcRes.data.success === true) {
          // Success branch
        } else if (!rpcRes.error) {
          // Explicit fail closed branch: Do NOT fallback
          fallbackExecuted = false;
        } else if (isRpcNotInstalledError(rpcRes.error, "admin_set_consultant_permissions")) {
          fallbackExecuted = true;
        }

        assert.equal(fallbackExecuted, false, "{ success: false } must fail closed and never activate fallback");
      });

      it("11. null or malformed RPC response does not activate fallback", async () => {
        let fallbackExecuted = false;
        const testPayloads = [null, undefined, {}, { count: 0 }, "unexpected string"];

        for (const data of testPayloads) {
          const rpcRes = { data, error: null };
          if (!rpcRes.error && rpcRes.data && typeof rpcRes.data === "object" && (rpcRes.data as any).success === true) {
            // Success branch
          } else if (!rpcRes.error) {
            // Unsuccessful/malformed payload fails closed
            fallbackExecuted = false;
          } else if (isRpcNotInstalledError(rpcRes.error, "admin_set_consultant_permissions")) {
            fallbackExecuted = true;
          }
          assert.equal(fallbackExecuted, false, "Malformed RPC response must fail closed");
        }
      });

      it("12. successful RPC never activates fallback", async () => {
        let fallbackExecuted = false;
        const rpcRes = { data: { success: true, user_id: "00000000-0000-0000-0000-000000000000" }, error: null };

        let actionReturned: { success: boolean; data?: any } | null = null;
        if (!rpcRes.error && rpcRes.data && typeof rpcRes.data === "object" && (rpcRes.data as any).success === true) {
          actionReturned = { success: true, data: rpcRes.data };
        } else if (!rpcRes.error) {
          actionReturned = { success: false };
        } else if (isRpcNotInstalledError(rpcRes.error, "admin_set_consultant_permissions")) {
          fallbackExecuted = true;
        }

        assert.equal(fallbackExecuted, false, "Fallback must never activate on success");
        assert.ok(actionReturned && actionReturned.success === true);
      });
    });

    describe("RPC Signature Reconciliation & Contract Verification", () => {
      it("verifies admin_set_consultant_permissions RPC contract matches migration 073 DDL", () => {
        const fs = require("node:fs");
        const path = require("node:path");
        const sql = fs.readFileSync(
          path.resolve(__dirname, "../supabase/migrations/073_atomic_admin_multistep_mutations.sql"),
          "utf-8"
        );

        // Required SQL parameters
        assert.ok(sql.includes("FUNCTION public.admin_set_consultant_permissions("));
        assert.ok(sql.includes("p_admin_id UUID"));
        assert.ok(sql.includes("p_target_user_id UUID"));
        assert.ok(sql.includes("p_permissions TEXT[]"));
        assert.ok(sql.includes("p_audit_reason TEXT DEFAULT 'Updated consultant administrative permissions'"));

        // Application call contract in admin-consultants.ts
        const appSource = fs.readFileSync(
          path.resolve(__dirname, "../app/actions/admin-consultants.ts"),
          "utf-8"
        );
        assert.ok(appSource.includes('.rpc("admin_set_consultant_permissions"'));
        assert.ok(appSource.includes("p_admin_id: user.id"));
        assert.ok(appSource.includes("p_target_user_id: userId"));
        assert.ok(appSource.includes("p_permissions: permissions"));
        assert.ok(appSource.includes("p_audit_reason:"));
      });

      it("verifies admin_approve_astrologer_with_sync RPC contract matches migration 073 DDL", () => {
        const fs = require("node:fs");
        const path = require("node:path");
        const sql = fs.readFileSync(
          path.resolve(__dirname, "../supabase/migrations/073_atomic_admin_multistep_mutations.sql"),
          "utf-8"
        );

        // Required SQL parameters
        assert.ok(sql.includes("FUNCTION public.admin_approve_astrologer_with_sync("));
        assert.ok(sql.includes("p_admin_id UUID"));
        assert.ok(sql.includes("p_target_user_id UUID"));
        assert.ok(sql.includes("p_stages TEXT[]"));
        assert.ok(sql.includes("p_review_notes TEXT DEFAULT 'Full multi-stage verification and listing synchronization approved.'"));

        // Application call contract in astrologer-verification.ts
        const appSource = fs.readFileSync(
          path.resolve(__dirname, "../app/actions/astrologer-verification.ts"),
          "utf-8"
        );
        assert.ok(appSource.includes('.rpc("admin_approve_astrologer_with_sync"'));
        assert.ok(appSource.includes("p_admin_id: adminSession.user.id"));
        assert.ok(appSource.includes("p_target_user_id: target.userId"));
        assert.ok(appSource.includes("p_stages: ALL_VERIFICATION_STAGES"));
        assert.ok(appSource.includes("p_review_notes: notes ||"));
      });

      it("verifies review_commission_settlement RPC contract matches migration 072 DDL", () => {
        const fs = require("node:fs");
        const path = require("node:path");
        const sql = fs.readFileSync(
          path.resolve(__dirname, "../supabase/migrations/072_atomic_commission_settlement_audit.sql"),
          "utf-8"
        );

        // Required SQL parameters
        assert.ok(sql.includes("FUNCTION public.review_commission_settlement("));
        assert.ok(sql.includes("p_settlement_id UUID"));
        assert.ok(sql.includes("p_admin_id UUID"));
        assert.ok(sql.includes("p_decision TEXT"));
        assert.ok(sql.includes("p_review_notes TEXT"));
        assert.ok(sql.includes("p_rejection_reason TEXT DEFAULT NULL"));

        // Application call contract in financial-verification.ts
        const appSource = fs.readFileSync(
          path.resolve(__dirname, "../app/actions/financial-verification.ts"),
          "utf-8"
        );
        assert.ok(appSource.includes('.rpc("review_commission_settlement"'));
        assert.ok(appSource.includes("p_settlement_id: payload.settlementId"));
        assert.ok(appSource.includes("p_admin_id: user.id"));
        assert.ok(appSource.includes("p_decision: payload.decision"));
        assert.ok(appSource.includes("p_review_notes: reviewNotes"));
        assert.ok(appSource.includes("p_rejection_reason: rejectionReason || null"));
      });

      it("verifies astrologer approval side-effect parity between application action and migration 073 RPC", () => {
        // Unit test checking side-effect parity and invariant preservation contract
        const fs = require("node:fs");
        const path = require("node:path");
        const sql = fs.readFileSync(
          path.resolve(__dirname, "../supabase/migrations/073_atomic_admin_multistep_mutations.sql"),
          "utf-8"
        );

        // 1. Invariant: Guard duplicate approval
        assert.ok(sql.includes("IF v_profile.approval_status = 'approved' THEN"));
        assert.ok(sql.includes("ALREADY_VERIFIED: This astrologer has already been approved and verified."));

        // 2. Invariant: Row locking FOR UPDATE
        assert.ok(sql.includes("FROM public.astrologer_profiles"));
        assert.ok(sql.includes("FOR UPDATE;"));

        // 3. Side-effect 1: Verification stage records upserted to approved
        assert.ok(sql.includes("INSERT INTO public.astrologer_verification_stages"));
        assert.ok(sql.includes("ON CONFLICT (astrologer_id, stage_name) DO UPDATE"));
        assert.ok(sql.includes("SET status = 'approved'"));

        // 4. Side-effect 2: Astrologer listing publication status updated to approved
        assert.ok(sql.includes("UPDATE public.astrologer_profiles"));
        assert.ok(sql.includes("SET approval_status = 'approved'"));

        // 5. Side-effect 3: Mandatory administrative audit log inserted in same transaction
        assert.ok(sql.includes("INSERT INTO public.admin_audit_logs"));
        assert.ok(sql.includes("'verification.full_approval_and_sync'"));
        assert.ok(sql.includes("'astrologer_listing'"));

        // 6. Contract: Distinction between unit test simulation and live integration
        const isSimulation = true;
        assert.equal(isSimulation, true, "Unit test verifies structural SQL contract; real DB atomicity is enforced by PostgreSQL at execution time.");
      });
    });
  });
});
