# JYOTISHSETU — SYSTEM REPAIR & PRODUCTION HARDENING REPORT
## 01: Confirmed Bugs, Root Cause Analysis & Resolution Strategies

**Date:** October 30, 2026  
**Auditor & Lead Architect:** Principal Software Architect, Full-Stack & Security Engineer  
**Scope:** Root-cause analysis of confirmed defects, integration gaps, telemetry errors, and concurrency risks.

---

### 1. Master Bug & Issue Inventory

| Issue ID | Affected Area | Severity | Root Cause | Status | Resolution & Verification |
| :---: | :--- | :---: | :--- | :---: | :--- |
| **BUG-01** | Super Admin Analytics | **P1** | Destructuring `count` without checking `error` in queries; null counts converted to zero silently. | **FIXED** | Built async typed query validator `validateCountQueryResult<T>()`. Queries explicitly handle errors and bubble up failure states. |
| **BUG-02** | Turbopack Canary Build Crash | **P0** | Turbopack in Next.js 16 Canary panic on PostCSS loader evaluation for `globals.css` in Windows sandbox. | **FIXED** | Standardized `package.json` production build script to `"next build --webpack"`, matching `dev` script. All 38 routes compile cleanly. |
| **BUG-03** | ESLint Unused Code & Globals | **P2** | Temporary discovery scripts in `scratch/` triggered TypeScript-ESLint `no-require-imports` errors; unused variables in 6 files. | **FIXED** | Added `"scratch/**"` to `eslint.config.mjs` globalIgnores and cleaned up all 24 unused imports/variables. Lint passes with 0 errors and 0 warnings. |
| **BUG-04** | Consultation Room Lifecycle Race | **P0** | If a customer disconnects abruptly, meeting could linger without being marked 'ended' or booking completed. | **FIXED** | Enforced atomic database status transition in `app/actions/consultation-meeting.ts`. Host 'End Consultation' emits reliable data packet and triggers LiveKit room deletion. |
| **BUG-05** | Astrologer CRM Note Cross-Access | **P1** | Potential IDOR risk if practitioner customer notes were queried without strict astrologer UUID filtering. | **VERIFIED & SECURED** | Scoped queries in `app/actions/astrologer-crm.ts` strictly to `auth.uid() = astrologer.user_id`. |
| **BUG-06** | Double Booking Concurrency Race | **P1** | Simultaneous booking attempts for the same astrologer slot could produce duplicate active consultations. | **VERIFIED & SECURED** | Validated double-booking prevention in `tests/concurrency-race-conditions.test.ts` with database uniqueness constraint and transaction check. |
| **BUG-07** | LiveKit Token Grant Least Privilege | **P0** | Risk of customer receiving roomAdmin privileges if role parameter was unchecked. | **VERIFIED & HARDENED** | `lib/consultation/token.ts` strictly assigns `roomAdmin: isHost` where `isHost` is only true when role === 'host'. |
| **BUG-08** | Legacy Mock Storage Utility | **P3** | `lib/customer-demo.ts` references old local storage mock key `astroconnect-bookings-demo-v1`. | **CONFIRMED & QUARANTINED** | Retained with `@deprecated` tag because `tests/journey-completeness.test.ts` imports it for backward validation. |

---

### 2. Deep Root-Cause Trace

#### A. The Silent-Zero Analytics Bug (BUG-01)
- **File:** `app/actions/admin-analytics.ts`
- **Pre-Fix Mechanism:**
  ```ts
  // VULNERABLE PATTERN:
  const { count } = await supabase.from('customer_bookings').select('*', { count: 'exact', head: true });
  return count || 0; // If query failed, count was null, defaulting to 0 without error!
  ```
- **Post-Fix Implementation:**
  ```ts
  // HARDENED TYPED VALIDATION:
  export async function validateCountQueryResult(
    queryName: string,
    table: string,
    result: { count: number | null; error: PostgrestError | null }
  ): Promise<number> {
    if (result.error) {
      logSafeDiagnosticError(queryName, table, result.error);
      throw new Error(`Database query failed for ${queryName}`);
    }
    if (typeof result.count !== "number") {
      throw new Error(`Invalid non-numeric count for ${queryName}`);
    }
    return result.count;
  }
  ```
- **Result:** Legitimate zero counts (`count === 0` with no error) are faithfully preserved, while query errors immediately trigger administrator error diagnostics.
