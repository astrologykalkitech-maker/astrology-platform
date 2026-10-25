# JyotishSetu — Security Audit & Hardening Report

## 1. Threat Model & Trust Boundaries
- **Untrusted Zone**: Browser clients, public visitors, unauthenticated users.
- **Semi-Trusted Zone**: Authenticated customers and astrologers.
- **Privileged Zone**: Consultant Admins (`consultant_admin`), Admins (`admin`), Owner Super Admin (`super_admin`).
- **Internal / Private Zone**: Supabase PostgreSQL DB1 & DB2 Service Role, Edge Functions, RPCs.

---

## 2. Security Controls & Audit Findings

### 2.1 Role-Based Access Control & Privilege Escalation Prevention
- **Self-Role Assignment Defense**: Direct client signup explicitly prevents assigning `admin`, `super_admin`, or `consultant_admin`. Only `customer` and `astrologer` are permitted.
- **Last Super Admin Protection**: Database RPC and server action strictly prevent the deletion or demotion of the last remaining Super Admin in DB2.
- **Strict Role Derivation**: User permissions and roles are fetched server-side from `public.profiles` using the user's authentic session id; client-side tokens cannot spoof role values.

### 2.2 Cross-User Data Isolation (IDOR Protections)
- **Customer Leads & Bookings**: Customer A cannot read or modify Customer B's bookings or enquiries. Queries are explicitly scoped by `customer_id = auth.uid()` and enforced via PostgreSQL Row-Level Security (RLS).
- **Astrologer Leads & Earnings**: Astrologer leads are accessible only to the assigned astrologer (`assigned_astrologer_id = auth.uid()`).
- **Consultant Scoping**: Unassigned leads or leads assigned to other consultants are blocked from unauthorized edits.

### 2.3 Listing Moderation Synchronization & Integrity
- **Public Discovery & Booking Shield**: Unapproved, suspended, or rejected astrologers are strictly excluded from:
  1. Public listing searches (`/api/astrologers`).
  2. Public astrologer details (`/customer/astrologers/[slug]`).
  3. Booking creation verification (`createBooking` fails closed if astrologer status is not `approved`).
- **Mandatory Justification**: Rejection, suspension, and change requests require an administrative justification string of at least 10 characters.

### 2.4 Secrets & Credentials Security
- **No Client Leakage**: `SUPABASE_SERVICE_ROLE_KEY` and `DB1_SUPABASE_SERVICE_ROLE_KEY` are used exclusively in server actions and protected API routes (`@/lib/supabase/admin.ts`).
- **Header Hardening**: `next.config.ts` sets `poweredByHeader: false`, HSTS (`max-age=63072000; includeSubDomains; preload`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: strict-origin-when-cross-origin`.

### 2.5 Abuse Prevention & Rate Limiting
- **Anti-Duplication**: Submitting identical enquiries within a 60-second window is rejected.
- **Rate-Limiting**: Enquiries and password reset actions enforce sliding window limits and issue standard `Retry-After` headers.

---

## 3. Residual Risks & Deferrals
- **Payment Gateway**: Financial transaction processing is intentionally deferred per project instructions. Real payments are disabled and all booking values are tracked in a pending state without processing charges.
