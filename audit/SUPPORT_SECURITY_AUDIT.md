# Support Security Audit & Threat Model — JyotishSetu Platform

**Generated:** October 26, 2026  
**Auditor:** Principal Application Security Engineer  
**Status:** SECURE & VERIFIED

---

## 1. Threat Modeling & Attack Surface Review

| Attack Vector | Threat Class | Risk Level | Defensive Control Implemented | Verification Evidence |
| :--- | :--- | :---: | :--- | :--- |
| **Insecure Direct Object Reference (IDOR)** | Broken Object-Level Authorization | High | Server actions strictly verify `ticket.user_id === user.id`. Users cannot view or reply to other users' tickets by guessing UUIDs. | Verified in `tests/ai-support-system.test.ts` (Test 6) |
| **Internal Administrative Note Leakage** | Information Disclosure | High | Non-staff queries filter out all messages where `is_internal = true`. RLS policy enforces `is_internal = false` on public table reads. | Verified in `tests/ai-support-system.test.ts` (Test 7) |
| **xAI API Secret Key Exposure** | Credential Leakage | Critical | `XAI_API_KEY` is loaded strictly server-side in `lib/ai/grok-service.ts`. Never prefixed with `NEXT_PUBLIC_` and never included in client bundle. | Build analysis & env scan verified |
| **Prompt Injection & Overrides** | AI Integrity Violation | Medium | User queries are treated as untrusted strings. System prompts are pinned server-side. AI has no autonomous database execution tools. | Static analysis of `lib/ai/grok-service.ts` |
| **API Denial of Service & Spam** | Resource Exhaustion | Medium | Per-user rate limiting active on AI queries (10/min) and ticket creation (5 per 10 mins) via `checkRateLimit`. | Verified in `tests/ai-support-system.test.ts` (Test 3) |
| **Privilege Escalation** | Broken Function Authorization | Critical | Admin support actions (`getAdminSupportTicketsAction`, `adminReplySupportTicketAction`, `adminUpdateTicketStatusAction`) enforce `requireAdminAccess()`. | Unit & integration assertions passed |
| **XSS via Message Content** | Cross-Site Scripting | Medium | React JSX escapes all rendered message content. Untrusted HTML is never executed. | Code review of `CustomerSupportInteractiveClient.tsx` |

---

## 2. Row Level Security (RLS) Policies on Support Tables

### `public.support_tickets`
- `SELECT`: `user_id = auth.uid()` (authenticated users view own tickets).
- `INSERT`: `user_id = auth.uid()`.
- `UPDATE`: `user_id = auth.uid()`.
- Staff operations use `createAdminClient("main")` after authenticating via `requireAdminAccess()`.

### `public.support_messages`
- `SELECT`: `is_internal = false AND EXISTS (SELECT 1 FROM support_tickets WHERE id = support_messages.ticket_id AND user_id = auth.uid())`.
- `INSERT`: `is_internal = false AND EXISTS (SELECT 1 FROM support_tickets WHERE id = support_messages.ticket_id AND user_id = auth.uid())`.
- Staff can insert public replies and internal notes via authorized server actions.

### `public.support_ticket_events`
- Immutable append-only audit trail. Users cannot alter or delete logged events.
