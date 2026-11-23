# CUSTOMER DASHBOARD SECURITY FINDINGS & DATA ISOLATION AUDIT
**Project:** Karmic Ascension  
**Domain:** Customer Security, Authentication, Authorization & Financial Integrity  
**Execution Phase:** Phase 0 — Security Audit Baseline  
**Status:** Complete  

---

## 1. Authentication & Role Enforcement Architecture
- **Guard Mechanism:** Customer route access is protected by `requireCustomerPage()` (redirect guard for UI routes) and `requireCustomerContext()` (exception guard for server actions and mutations) in `lib/auth/customer-guard.ts`.
- **Role Verification:** Authenticated users with roles other than `customer` (such as `astrologer` or `admin`) are strictly rejected with `ForbiddenRoleError` and redirected with `?reason=role_unauthorized`.
- **Public Signup Isolation:** Sign-up actions enforce default role assignment to `customer` and block arbitrary role injection from client-submitted payloads.

---

## 2. Cross-Customer Data Isolation & IDOR Protection
- **Ownership Verification:**
  - `leads`: Scoped strictly by `customer_id = (select auth.uid())`.
  - `customer_bookings`: Scoped strictly by `customer_id = (select auth.uid())`. Customer A cannot view, reschedule, or cancel bookings belonging to Customer B.
  - `consultation_messages` & `conversations`: Scoped to conversation participants (`customer_id = auth.uid() OR astrologer_id = auth.uid()`).
  - `support_tickets`: Scoped strictly by `user_id = auth.uid()`. Customer tickets remain confidential between seeker and authorized admins.
- **Birth Chart & Sensitive Data Encryption:**
  - Sensitive personal data (`date_of_birth`, `time_of_birth`, `birthplace`, exact coordinates) is protected using authenticated AES-256-GCM encryption with randomized IVs and authentication tags.

---

## 3. Financial & Payment Security Architecture
- **Indigenous JyotishPay:**
  - Client-supplied prices are strictly rejected. Booking fees are server-authoritative, derived directly from `astrologer_profiles.consultation_fee`.
  - UPI QR intents are generated server-side with unique transaction reference identifiers (`JSP_...`).
  - UTR submissions undergo format normalization and admin verification before value is credited or released.
- **Wallet & Double-Entry Ledger Invariants:**
  - Consultation escrow debit/credit operations post atomic multi-line journal entries (`debits === credits`) directly affecting canonical General Ledger accounts (`2040` Customer Deposits $\rightarrow$ `2010` Consultation Escrow $\rightarrow$ `4010` Platform Revenue + `2020` Astrologer Payable).
  - Transaction-scoped advisory locking (`pg_advisory_xact_lock`) eliminates double-spending risks.

---

## 4. Rate Limiting & Abuse Prevention
- Customer consultation enquiries and manual booking creation enforce sliding-window rate limits (e.g., maximum 5 enquiries/minute, 20 booking requests/minute) via `checkRateLimit()` in `lib/security/rate-limit.ts`.
- Excessive requests return user-friendly retry-after intervals (`429 Too Many Requests`).
