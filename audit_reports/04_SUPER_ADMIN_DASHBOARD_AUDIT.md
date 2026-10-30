# JYOTISHSETU — MASTER TECHNICAL AUDIT REPORT
## 04: Super Admin Dashboard, Telemetry & Governance Audit

**Audit Target:** `/super-admin/*` routes and administrative security governance  
**Scope:** 16 App Router pages, 8 administrative components, 4 privileged server actions, dual-database routing, and security audit logging.

---

### 1. Super Admin Feature Inventory & Route Mapping

| Feature Name | Route / Path | Primary Component | Backend Action / API | Database Target & Table | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Admin Overview & Telemetry**| `/super-admin` | `app/super-admin/page.tsx` | `getAdminAnalytics()` | DB1: All core tables; DB2: Audit logs | **Operational** |
| **Astrologer Listings Queue** | `/super-admin/listings` | `ListingsModerationClient.tsx`| `approveListing()`, `rejectListing()` | DB1: `astrologer_profiles` | **Operational** |
| **Central Leads Triage** | `/super-admin/leads` | `CentralLeadsClient.tsx` | `assignLead()`, `updateLeadStatus()` | DB1: `leads`, `astrologer_profiles` | **Operational** |
| **System Bookings Desk** | `/super-admin/bookings` | `AdminBookingsClient.tsx` | `getAllSystemBookings()` | DB1: `customer_bookings` | **Operational** |
| **Customer Account Directory** | `/super-admin/customers`| `AdminCustomersClient.tsx` | `getRegisteredCustomers()` | DB1: `profiles` | **Operational** |
| **Consultants & Staff RBAC** | `/super-admin/consultants`| `StaffManagementClient.tsx` | `assignStaffRole()`, `revokeRole()` | DB2: `admin_permissions`, `profiles` | **Operational** |
| **Immutable Audit Logs** | `/super-admin/audit-logs` | `AuditLogsClient.tsx` | `getAdminAuditLogs()` | DB2: `admin_audit_logs` | **Operational** |
| **Platform Configuration** | `/super-admin/settings` | `PlatformSettingsClient.tsx`| `updatePlatformSettings()` | DB1: `platform_settings` | **Operational** |

---

### 2. Live Telemetry & Analytics Architecture

#### Safe Query Validation & Zero-Suppression Elimination
- **File Reference:** `app/actions/admin-analytics.ts`
- In earlier revisions, failed Supabase queries silently returned null counts that defaulted to `0`.
- **Permanent Fix Implemented:**
  - Built an async, strongly-typed query validator `validateCountQueryResult<T>()`.
  - Distinguishes between a genuine zero-record count (`count === 0` with no error) and a failed query (`error !== null`).
  - If a database query fails, the server action captures the exact diagnostic code, logs safely without leaking credentials, and returns `success: false` with an explicit administrator error message.
  - The UI (`app/super-admin/page.tsx`) renders a discrete error banner with a "Retry" button rather than misleading the administrator with fake zero metrics.

#### Dual-Database Query Segregation
- Customer profiles, astrologer verification records, customer bookings, and platform leads are queried from **DB1 (Main)** via `createAdminClient()` with `DB1_SUPABASE_SERVICE_ROLE_KEY`.
- Administrative roles and security audit entries are queried from **DB2 (Admin)** via `createSeparateAdminClient()` with `ADMIN_SUPABASE_SERVICE_ROLE_KEY`.
- This ensures that administrative audit logs cannot be tampered with even if an SQL injection vulnerability were ever introduced in the public customer database.

---

### 3. Role-Based Access Control (RBAC) & Guard Matrix

- **Guard Module:** `lib/auth/admin-guard.ts`
- **Middleware Integration:** `middleware.ts` intercepts all requests to `/super-admin/*`.
- Evaluates:
  1. Authenticated Supabase session.
  2. Role match in DB2 `profiles.role === 'super_admin'` OR permission record in DB2 `admin_permissions`.
  3. Rejection immediately redirects unauthorized sessions to `/customer/astrologers` with an audit event recorded in DB2 `admin_audit_logs`.
