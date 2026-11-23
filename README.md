# Karmic Ascension — Enterprise Vedic Astrology & Consultation Platform

[![Next.js](https://img.shields.io/badge/Next.js-16.4.2_App_Router-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.0-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL_%26_RLS-3ECF8E?logo=supabase)](https://supabase.com/)
[![LiveKit](https://img.shields.io/badge/LiveKit-In--House_WebRTC-black?logo=livekit)](https://livekit.io/)
[![Tests](https://img.shields.io/badge/Tests-167%2F167_Passing_(100%25)-brightgreen)]()
[![TypeCheck](https://img.shields.io/badge/TypeScript-0_Errors-brightgreen)]()
[![Build](https://img.shields.io/badge/Build-Production_Ready-success)]()

**Karmic Ascension** is an enterprise-grade, multi-tenant Vedic astrology consultation platform built with **Next.js 16 (App Router)**, **TypeScript**, **Tailwind CSS v4**, **Supabase (Dual PostgreSQL with RLS)**, and **LiveKit WebRTC**. It connects seekers with verified Vedic astrologers for real-time video/voice/chat consultations, automated Kundli calculations, double-entry financial accounting, multi-channel notification infrastructure, and end-to-end booking life cycles.

---

## 🏛️ Platform Architecture Overview

Karmic Ascension operates across a high-availability dual-database split architecture (**DB1 + DB2**) ensuring zero cross-tenant leakage, rigorous security boundaries, and high-performance real-time synchronization:

```
                                  [ Karmic Ascension Gateway ]
                                  (Next.js App Router 16)
                                             |
            +--------------------+-----------+-----------+--------------------+
            |                    |                       |                    |
            v                    v                       v                    v
      [Public Portal]    [Customer Portal]      [Astrologer Portal]   [Super Admin / Admin]
     Discovery & Leads  Vedic Tools & Consults  Practice & Seeker CRM Telemetry & Moderation
            |                    |                       |                    |
            +--------------------+-----------+-----------+--------------------+
                                             |
                                             v
                      +---------------------------------------------+
                      |         Dual-Database Architecture          |
                      |                                             |
                      |   [DB1: Platform & Operational Store]       |
                      |   - Seekers, Astrologer Profiles, Reviews   |
                      |   - Kundli Milans, Panchang, Rituals        |
                      |   - Booking Intervals & Availability Slots  |
                      |   - Double-Entry General Ledger (Paise)     |
                      |   - LiveKit WebRTC Session Metadata         |
                      |                                             |
                      |   [DB2: Administrative & Moderation Store]  |
                      |   - Super Admin RBAC & Audit Trails         |
                      |   - Astrologer Approval & Verification KYC  |
                      |   - Central Lead Ingestion & Qualification  |
                      |   - Statutory 30-Day Data Retention Audits  |
                      +---------------------------------------------+
```

---

## ✨ Core Functional Modules

### 1. Customer & Seeker Portal (`/customer`)
- **Astrologer Discovery:** Directory of verified Vedic mentors filtered by specialization, language, rating, and availability.
- **Booking Engine:** Concurrency-safe slot reservation protected by transactional database advisory locks (`pg_advisory_xact_lock`), DB availability checks, and server-side pricing snapshots (Migration 092).
- **Vedic Tools Suite:**
  - Janam Kundli generation (Lagna, Navamsha D-9, planetary strengths).
  - Ashtakoota 36 Guna Milan compatibility scoring.
  - Daily Hindu Panchang (Tithi, Nakshatra, Yoga, Karana, Rahu Kaal).
  - Vedic Protection Ritual catalog fulfillment.
- **Consultation Meetings:** LiveKit WebRTC video/audio calls with waiting room admission control, participant token security, and real-time messaging.
- **Privacy & Data Portability:** Downloadable JSON data archive (Right to Portability) and 30-day statutory account deletion requests.

### 2. Astrologer Professional Portal (`/astrologer`)
- **Practice & Consultation CRM:** Real-time lead queues, consultation requests, and past booking logs.
- **Dynamic Session Controls:** Availability scheduling, break rules, and emergency session terminations.
- **Atomic Consultation Completion:** Executes Migration 095 (`complete_astrologer_consultation_atomic`) to synchronize meeting termination, in-app seeker alerts, and commission accruals.
- **Banking & Payout Security:** Bank account numbers, IFSC codes, and UPI IDs encrypted at rest with AES-256-GCM and entity-specific Additional Authenticated Data (AAD) binding (Migration 094).
- **Subscription Lifecycle:** Tier status tracking (Free vs Professional) with complimentary extensions and additive renewal lead quota accumulation.

### 3. Super Admin & Governance Portal (`/super-admin`)
- **Granular RBAC:** Explicit capability guards (`listing.approve`, `listing.review`, `requireSuperAdmin()`).
- **Financial Double-Entry General Ledger:**
  - Standardized accounts: `1010` (Gateway Clearing), `2010` (Escrow), `2020` (Astrologer Payable), `4010` (Marketplace Commission), `4020` (Subscription Revenue), `5010` (Gateway Fee), `5020` (Refund Expense).
  - Exact integer paise balance parity ($\sum \text{debits} = \sum \text{credits}$) and `ON DELETE RESTRICT` protection.
  - Timing-safe HMAC SHA-256 and MAC webhook validation with atomic idempotency claims.
  - Manual UTR review with anti-self-review safeguards.
- **Lead Qualification & Distribution:** Real-time lead assignment (`perform_atomic_lead_assignment`) mirrored across DB1 and DB2.
- **Statutory Data Retention & GDPR/DPDP Dashboard:** Approval, rejection, and automated execution workers for 30-day account deletion requests.
- **Emergency Broadcasts:** Authoritative LiveKit room termination and broadcast notifications.

---

## 🔒 Security Architecture & Guarantees

1. **Fail-Closed Admin Client**: Privileged database clients halt immediately if service credentials are missing or misconfigured.
2. **Entity-Bound Cryptography**: Beneficiary banking details use AES-256-GCM with AAD binding (`astrologer_payout_beneficiaries:<id>:<field>`), preventing ciphertext relocation across accounts.
3. **Immutable General Ledger**: `financial_journal_lines` enforces `ON DELETE RESTRICT` on headers and accounts. Deleting users anonymizes personal PII while preserving legal accounting records.
4. **Anti-IDOR Protection**: Consultations, direct messages, leads, and customer profiles enforce explicit ownership checks at both the database RLS layer and the server action layer.
5. **Safe Redirect Defense**: All post-authentication redirects pass through [`lib/security/safe-redirect.ts`](file:///d:/Company%20Projects/Astrology%20website/lib/security/safe-redirect.ts) to prevent open-redirect vulnerabilities.
6. **RLS Query Optimization**: Over 40 RLS policies utilize the `(select auth.uid())` subquery caching pattern, eliminating per-row JWT re-evaluation overhead.
7. **Timeout Protection**: Administrative database operations enforce a 10-second `fetchWithTimeout` ceiling via `AbortController`, preventing hung connections.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `v20.x` or later
- **Package Manager**: `npm` or `pnpm`
- **Database**: PostgreSQL (Supabase or self-hosted)
- **WebRTC**: LiveKit Cloud or self-hosted instance

### Environment Configuration

Create a `.env.local` file in the project root:

```env
# Next.js App
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Primary Operational Database (DB1)
NEXT_PUBLIC_SUPABASE_URL="https://your-db1-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-db1-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-db1-service-role-key"

# Administrative & Moderation Database (DB2)
ADMIN_SUPABASE_URL="https://your-db2-project.supabase.co"
ADMIN_SUPABASE_SERVICE_ROLE_KEY="your-db2-service-role-key"

# LiveKit WebRTC Configuration
LIVEKIT_API_KEY="your-livekit-api-key"
LIVEKIT_API_SECRET="your-livekit-api-secret"
NEXT_PUBLIC_LIVEKIT_WS_URL="wss://your-livekit-project.livekit.cloud"

# Cryptography & Financial Encryption Key (32-byte / 64-hex string)
FINANCIAL_ENCRYPTION_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

# Payment Gateways & Notifications (Optional in local dev)
INSTAMOJO_API_KEY="your-instamojo-api-key"
INSTAMOJO_AUTH_TOKEN="your-instamojo-auth-token"
INSTAMOJO_SALT="your-instamojo-salt"
VAPID_PRIVATE_KEY=""
RESEND_API_KEY=""
```

### Installation & Development

```bash
# 1. Install dependencies
npm install

# 2. Run database setup migrations in Supabase SQL editor:
# Apply supabase/CONSOLIDATED_SETUP.sql
# Apply supabase/migrations/090 through 096

# 3. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## 🧪 Comprehensive Test Suite & Quality Assurance

The platform features an automated test runner suite covering unit, integration, and security regression checks:

```bash
# Run the full regression test suite (167 tests across 44 suites)
npm test

# Run TypeScript type safety verification
npx tsc --noEmit
```

### Verified Test Suites (100% Pass Rate)

| Suite Group | Key Capabilities Verified | Status |
| :--- | :--- | :--- |
| **Security & RBAC** | Privileged actions, IDOR payload protection, KYC moderation, Referral RLS | **PASS (100%)** |
| **Dual-DB Coordination** | Cross-DB enquiry creation, atomic lead assignment, fault isolation | **PASS (100%)** |
| **Booking & Availability** | Concurrency advisory locks, DB interval overlaps, atomic session closure | **PASS (100%)** |
| **Financial Ledger** | Double-entry paise parity, manual UTR review, HMAC webhook idempotency, AES-256-GCM AAD encryption | **PASS (100%)** |
| **Subscriptions & Quotas** | Dynamic plans, complimentary grants, calendar-aware cycle transitions, audit trails | **PASS (100%)** |
| **Notifications & Support** | Multi-channel delivery telemetry, dead-letter diagnostics, support ticket escalation | **PASS (100%)** |
| **Privacy & GDPR/DPDP** | 30-day grace period, birth data purging, data export portability, ledger preservation | **PASS (100%)** |
| **Responsiveness & Perf** | Mobile sticky bottom bars, drawers, high-frequency query indexes, RLS caching, Next.js font preloading | **PASS (100%)** |

---

## 📄 License & Attribution

Copyright © 2026 Karmic Ascension. All rights reserved.  
Built for secure, authentic, and real-time Vedic astrology consultations.
