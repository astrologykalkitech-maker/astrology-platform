# ASTROLOGER DASHBOARD SECURITY FINDINGS REPORT
**Date:** November 22, 2026  
**Auditor:** Principal Software Architect & Security Engineer  
**Classification Standard:** Critical (P0), High (P1), Medium (P2), Low (P3/P4)

---

## 1. Executive Security Summary
A comprehensive security review of all astrologer-facing endpoints, server actions, database RPCs, and RLS policies was conducted. While earlier remediations resolved key wallet IDOR and UTR verification issues, several critical authorization boundaries and data-isolation concerns require remediation in Phase 1 before public deployment.

---

## 2. Security Findings Matrix

| Finding ID | Severity | Area | Description | Impact | Affected Files | Remediation Phase |
|---|---|---|---|---|---|---|
| **SEC-01** | **P0 (Critical)** | Authorization & Role Enforcement | `lib/auth/session.ts` and `app/astrologer/(portal)/layout.tsx` must verify that the user profile has an active and approved astrologer record, rejecting customers who manipulate sessions or metadata. | Unauthorized access to portal | `lib/auth/session.ts`, `app/astrologer/(portal)/layout.tsx` | Sub-phase 1.1 |
| **SEC-02** | **P0 (Critical)** | Puja Access Control & IDOR | In `app/actions/astrologer-pujas.ts`, updating puja execution status, location tracking, and recording offline puja collections must strictly verify that `booking.astrologer_id == authenticated_astrologer_id`. | Cross-astrologer modification of rituals & collections | `app/actions/astrologer-pujas.ts`, `supabase/migrations/090_puja_management_system.sql` | Sub-phase 1.2 |
| **SEC-03** | **P0 (Critical)** | Chat Attachment & File Storage Privacy | Attachment uploads in direct chat (`app/actions/direct-chat.ts`, Supabase storage bucket `chat-attachments`) must use private buckets with signed URLs, preventing unauthenticated access via public CDN URLs. | Exposure of private customer birth charts & photos | `app/actions/direct-chat.ts`, Storage bucket RLS policies | Sub-phase 1.3 |
| **SEC-04** | **P0 (Critical)** | Booking Creation & Payment Authorization | `app/api/astrologer/create-booking/route.ts` allows direct creation of bookings. Server-side validation must ensure no astrologer or customer can bypass fee calculation, slot availability, or payment verification. | Unpaid or double-booked consultations | `app/api/astrologer/create-booking/route.ts`, `app/actions/astrologer-availability.ts` | Sub-phase 1.4 |
| **SEC-05** | **P0 (Critical)** | Puja Completion & Commission Ledger Integrity | Declaring completion and offline payments must not automatically accrue commission into wallet without admin verification or verified ledger locking. | Financial loss & unearned payout leakage | `app/actions/astrologer-pujas.ts`, `lib/financial/ledger.ts` | Sub-phase 1.5 |
| **SEC-06** | **P1 (High)** | Beneficiary Ownership Verification | Beneficiary accounts for payouts (`app/actions/astrologer-beneficiaries.ts`) must strictly enforce AES-256-GCM encryption on bank account details and prevent modifying another astrologer's payout routing. | Hijacking of payout funds | `app/actions/astrologer-beneficiaries.ts` | Sub-phase 1.6 |
| **SEC-07** | **P1 (High)** | CRM & Customer Notes Data Isolation | In `app/actions/astrologer-crm.ts`, notes, customer profile views, and past interaction histories must be scoped strictly to customers who have an active or completed booking with that specific astrologer. | Cross-tenant customer privacy violation | `app/actions/astrologer-crm.ts` | Sub-phase 1.7 |
| **SEC-08** | **P1 (High)** | Supabase Service-Role & RLS Bypass Audit | Server actions using `createAdminClient()` must be audited to ensure user IDs are derived strictly from authenticated session JWTs rather than client-supplied function arguments. | IDOR vulnerability on server actions | Multiple `app/actions/astrologer-*.ts` | Sub-phase 1.8 |
| **SEC-09** | **P1 (High)** | RPC Permissions & Function Search Paths | Database functions created in migrations (e.g. `090_puja_management_system.sql`) must have `SET search_path = public, pg_temp` and explicit `REVOKE EXECUTE ON FUNCTION FROM PUBLIC`. | Search path hijacking and privilege escalation | `supabase/migrations/*` | Sub-phase 1.9 |
| **SEC-10** | **P2 (Medium)** | Rate Limiting & Abuse Prevention | Endpoints for booking creation, wallet recharge UTR submission, and astrologer chat messages must be protected by Redis/KV-based rate limiters to prevent DoS and spamming. | Spam, resource exhaustion | `middleware.ts`, `app/api/chat/send/route.ts` | Sub-phase 1.11 |

---

## 3. Mandatory Remediation Strategy
All P0 and P1 security findings are mapped into **Phase 1 (Critical Security Remediation)** with individual, sequentially verifiable sub-phases (1.1 through 1.12). No feature development will proceed until Phase 1 passes all security regression tests.
