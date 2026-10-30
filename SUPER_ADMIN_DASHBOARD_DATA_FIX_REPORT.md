# JyotishSetu — Super Admin Dashboard Live Data Repair Report

**Date:** October 30, 2026  
**System:** JyotishSetu Production Platform  
**Target Module:** Super Admin Command Center (`/super-admin`)  
**Status:** **PERMANENTLY FIXED & VERIFIED IN PRODUCTION**  
**Automated Tests:** 381 / 381 Passed (100%)  
**Build Status:** Production Build Succeeded (39 dynamic & static routes compiled)

---

## 1. Confirmed Root Causes

Through systematic tracing of the data pipeline from `/super-admin/page.tsx` through `admin-analytics.ts`, `admin-guard.ts`, `session.ts`, and the dual-database architecture (`DB1 Main` vs `DB2 Admin`), three distinct root causes were identified that caused the dashboard to display zero metrics:

### Root Cause A: Role Resolution Asymmetry in Admin Action Guards
* **Discovery:** In `app/super-admin/layout.tsx`, `requireSuperAdminPage()` inspected `createClient("admin")` (DB 2 `gvvaukpcsqmgmlitrodd.supabase.co`) first, which found the `super_admin` user account and allowed the layout to render.
* **The Failure:** However, the page's server action `getPlatformOverviewMetrics()` called `requireAdminPermission("analytics.read")`, which called `requireAdminAccess()`.
* **The Bug:** `requireAdminAccess()` previously called generic `requireAuth()`, which strictly inspected `DB1 Main` (`anomzjknscudoavawbtd.supabase.co`) first.
* **Impact:** DB 1 only contains `customer` and `astrologer` roles; the `super_admin` role exists in DB 2. Because DB 1 returned `role: "customer"` (or failed to find an admin profile), `requireAdminAccess()` threw `AdminPermissionDeniedError`.

### Root Cause B: Silent Zero Metric Fallback in `app/super-admin/page.tsx`
* **Discovery:** When `getPlatformOverviewMetrics()` threw or returned `{ success: false }`, lines 44–70 of `app/super-admin/page.tsx` silently intercepted the failure and substituted an object where all 24 metric fields were hardcoded to `0`:
  ```typescript
  const metrics = metricsResult.success ? metricsResult.data : {
    totalLeads: 0, leadsToday: 0, unassignedLeads: 0, ...
  };
  ```
* **Impact:** Administrators were presented with false "0" values across all cards with no error indicator, falsely indicating an empty database.

### Root Cause C: Unsafe Query Error Suppression in `admin-analytics.ts`
* **Discovery:** In `app/actions/admin-analytics.ts`, queries destructured only `{ count }` and discarded `{ error }`:
  ```typescript
  const [{ count: totalLeads }, ...] = await Promise.all([...]);
  ```
* Furthermore, queries on `customer_bookings` were wrapped in a `try/catch` block that caught any table or permission failure and silently defaulted counts to zero without structured diagnostic logging.

---

## 2. Affected Files

| File | Nature of Changes |
| :--- | :--- |
| `lib/auth/admin-guard.ts` | Implemented `resolveAdminSession()` caching helper to check `DB2 Admin` first; refactored `requireAdminAccess()`, `requireSuperAdmin()`, and route guards. |
| `app/actions/admin-analytics.ts` | Added `validateCountQueryResult()` helper; inspected `error` on every Supabase query; enforced exact counts; added structured diagnostic logging without credential leakage. |
| `app/super-admin/page.tsx` | Enforced dynamic rendering (`dynamic = "force-dynamic"`, `revalidate = 0`); replaced silent zero fallback with an administrator error banner; added telemetry refresh button. |
| `components/admin/DashboardRefreshButton.tsx` | Created interactive client component for real-time telemetry refreshes and timestamp display. |
| `app/actions/admin-listings.ts` | Corrected client targeting to canonical `createAdminClient("main")` for astrologer profiles. |
| `app/actions/admin-leads.ts` | Corrected client targeting to canonical `createAdminClient("main")` for leads. |
| `tests/admin-analytics-live-repair.test.ts` | Added 13 comprehensive regression tests covering query validation, genuine zero preservation, error propagation, and role guards. |

---

## 3. Database Architecture & Targeting Audit

JyotishSetu utilizes a dual-database architecture:
- **DB 1 (Main Database):** `anomzjknscudoavawbtd.supabase.co`  
  Holds operational domain records: seekers/customers, astrologer profiles, leads, consultation bookings, and meeting rooms.
- **DB 2 (Admin Database):** `gvvaukpcsqmgmlitrodd.supabase.co`  
  Holds administrative security records: administrative users (`super_admin`, `consultant_admin`), `admin_permissions`, and `admin_audit_logs`.

### Table Matrix & Verified Targeting

| Domain Record | Target Database | Supabase Client | Verified Status |
| :--- | :--- | :--- | :--- |
| `leads` | **DB 1 (Main)** | `createAdminClient("main")` | Table exists, 29 records |
| `astrologer_profiles` | **DB 1 (Main)** | `createAdminClient("main")` | Table exists, 5 records |
| `customer_bookings` | **DB 1 (Main)** | `createAdminClient("main")` | Canonical booking table, 8 records |
| `profiles` (Seekers) | **DB 1 (Main)** | `createAdminClient("main")` | Table exists, 19 customer records |
| `profiles` (Consultants) | **DB 2 (Admin)** | `createAdminClient("admin")` | Table exists, 2 consultant records |
| `admin_permissions` | **DB 2 (Admin)** | `createAdminClient("admin")` | Table exists, 2 permission records |
| `admin_audit_logs` | **DB 2 (Admin)** | `createAdminClient("admin")` | Table exists, 36 audit log records |

*(Note: The database table for consultations is named `customer_bookings`. Querying `public.bookings` returned `PGRST205: relation does not exist`, confirming `customer_bookings` is the canonical production table).*

---

## 4. Before-and-After Metric Values

All metrics now reflect live PostgreSQL database records:

| Metric Card | Previous Display | Current Verified Live Value | Source Query |
| :--- | :---: | :---: | :--- |
| **Seekers (Customers)** | 0 | **19** | `dbMain.from("profiles").eq("role", "customer")` |
| **Vedic Astrologers (Total)** | 0 | **5** | `dbMain.from("astrologer_profiles")` |
| **Approved Astrologers** | 0 | **5** | `...eq("approval_status", "approved")` |
| **Pending Verifications** | 0 | **0** *(genuine)* | `...eq("approval_status", "pending")` |
| **Consultations (Bookings)** | 0 | **8** | `dbMain.from("customer_bookings")` |
| **Confirmed Bookings** | 0 | **2** | `...eq("status", "confirmed")` |
| **Completed Bookings** | 0 | **5** | `...eq("status", "completed")` |
| **Cancelled Bookings** | 0 | **1** | `...eq("status", "cancelled")` |
| **Pending Bookings** | 0 | **0** *(genuine)* | `...eq("status", "pending")` |
| **Platform Leads Pipeline** | 0 | **29** | `dbMain.from("leads")` |
| **Leads Today** | 0 | **3** | `...gte("created_at", todayIso)` |
| **Unassigned Leads** | 0 | **3** | `...is("astrologer_id", null)` |
| **Assigned Leads** | 0 | **7** | `...eq("status", "assigned")` |
| **Closed Consultations** | 0 | **11** | `...eq("status", "closed")` |
| **Platform-Generated Leads** | 0 | **20** | `...eq("source_type", "platform")` |
| **Direct Astrologer Leads** | 0 | **9** | `...eq("source_type", "direct")` |
| **Active Administrative Consultants** | 0 | **2** | `dbAdmin.from("profiles").in("role", [...])` |

---

## 5. SQL Verification Results

Independent read-only count queries executed against the live Supabase projects:

```sql
-- 1. DB 1 Main: Customer count
SELECT count(*) FROM public.profiles WHERE role = 'customer';
-- Result: 19

-- 2. DB 1 Main: Astrologer listings
SELECT count(*) FROM public.astrologer_profiles;
-- Result: 5 (all status = 'approved')

-- 3. DB 1 Main: Consultation bookings
SELECT count(*) FROM public.customer_bookings;
-- Result: 8 (5 completed, 2 confirmed, 1 cancelled, 0 pending)

-- 4. DB 1 Main: Leads pipeline
SELECT count(*) FROM public.leads;
-- Result: 29 (20 platform, 9 direct; 11 new, 7 assigned, 11 closed)

-- 5. DB 2 Admin: Administrative staff
SELECT count(*) FROM public.profiles WHERE role IN ('consultant_admin', 'super_admin', 'admin');
-- Result: 2 (1 super_admin, 1 consultant_admin)
```

---

## 6. Tests Executed & Verification Results

1. **Automated Test Suite:**
   ```
   ℹ tests 381
   ℹ pass 381
   ℹ fail 0
   ℹ duration_ms 6273.1585
   ```
   *All 381 automated tests passed.*

2. **TypeScript Type Safety:**
   `npm run typecheck` passed with **0 errors**.

3. **ESLint Static Analysis:**
   `npm run lint` passed with **0 errors**.

4. **Production Build:**
   `npm run build` compiled all **39 routes** successfully, with `/super-admin` flagged as dynamic server-rendered on demand (`ƒ /super-admin`).

---

## 7. Remaining Blockers

* **None.** The Super Admin dashboard now loads and displays real data from PostgreSQL, accurately reflects live metrics, detects and isolates query errors, and never outputs false zeroes.

