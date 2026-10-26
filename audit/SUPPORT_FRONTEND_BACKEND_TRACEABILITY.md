# Support Frontend/Backend Traceability Matrix — JyotishSetu Platform

**Generated:** October 26, 2026  
**Auditor:** Principal Full-Stack Engineer  
**Status:** RECONCILED & COMPLETE

---

## 1. Frontend-to-Backend Traceability

| UI Entry Point & Interaction | Component File & Event Handler | Server Action / API Handler | Database Operations & Tables | Cache / Notification Invalidation | Test File |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Customer: Ask AI Care** | `CustomerSupportInteractiveClient.tsx` -> `handleSendAi()` | `askSupportAiAction()` | None (Stateful session query via Grok / grounding) | None | `tests/ai-support-system.test.ts` |
| **Customer: Escalate to Ticket** | `CustomerSupportInteractiveClient.tsx` -> `handleSubmitTicket()` | `createSupportTicketAction()` | `INSERT INTO public.support_tickets`, `INSERT INTO public.support_messages`, `INSERT INTO public.support_ticket_events` | Local ticket refresh, Super Admin queue updated | `tests/ai-support-system.test.ts` |
| **Customer: View Tickets** | `CustomerSupportInteractiveClient.tsx` -> `loadTickets()` | `getUserSupportTicketsAction()` | `SELECT FROM public.support_tickets WHERE user_id = auth.uid()` | RLS enforced | `tests/ai-support-system.test.ts` |
| **Customer: Open Ticket** | `CustomerSupportInteractiveClient.tsx` -> `handleOpenTicket()` | `getSupportTicketDetailsAction()` | `SELECT FROM public.support_messages WHERE ticket_id = $1 AND is_internal = false` | Scoped to owner | `tests/ai-support-system.test.ts` |
| **Customer: Reply to Admin** | `CustomerSupportInteractiveClient.tsx` -> `handleSendReply()` | `addSupportTicketMessageAction()` | `INSERT INTO public.support_messages`, `UPDATE support_tickets SET status = 'waiting_for_support'` | Updates ticket conversation | `tests/ai-support-system.test.ts` |
| **Astrologer: Ask AI Care** | `AstrologerSupportInteractiveClient.tsx` -> `handleSendAi()` | `askSupportAiAction()` | Grok AI consultant grounding | None | `tests/ai-support-system.test.ts` |
| **Astrologer: Submit Request** | `AstrologerSupportInteractiveClient.tsx` -> `handleSubmitTicket()` | `createSupportTicketAction()` | `INSERT INTO public.support_tickets` (`user_role = 'astrologer'`) | Local inbox refresh | `tests/ai-support-system.test.ts` |
| **Super Admin: Support Desk** | `AdminSupportDeskClient.tsx` -> `fetchTickets()` | `getAdminSupportTicketsAction()` | `SELECT FROM public.support_tickets` with aggregate counts & filters | Paginated query | `tests/ai-support-system.test.ts` |
| **Super Admin: Send Reply** | `AdminSupportDeskClient.tsx` -> `handleSendReply()` | `adminReplySupportTicketAction()` | `INSERT INTO public.support_messages`, `INSERT INTO public.customer_notifications` | Dispatches in-app notification | `tests/ai-support-system.test.ts` |
| **Super Admin: Internal Note** | `AdminSupportDeskClient.tsx` -> `handleSendReply(isInternal=true)` | `adminReplySupportTicketAction()` | `INSERT INTO public.support_messages (is_internal=true)` | Logged in audit trail | `tests/ai-support-system.test.ts` |
| **Super Admin: Status Update** | `AdminSupportDeskClient.tsx` -> `handleUpdateStatus()` | `adminUpdateTicketStatusAction()` | `UPDATE public.support_tickets`, `INSERT INTO public.support_ticket_events` | User notification on resolution | `tests/ai-support-system.test.ts` |

---

## 2. Backend-to-Frontend Traceability

| Database Entity / RPC / Service | Server Action Provider | Intended Product Purpose | Consuming UI Dashboard | Verification Status |
| :--- | :--- | :--- | :--- | :---: |
| `public.support_tickets` | `app/actions/support.ts` | Durable storage of all customer & astrologer support requests | Customer, Astrologer, Super Admin | VERIFIED |
| `public.support_messages` | `app/actions/support.ts` | Full multi-turn conversation timeline between User, AI, and Admin | Customer, Astrologer, Super Admin | VERIFIED |
| `public.support_ticket_events` | `app/actions/support.ts` | Append-only audit trail for administrative tracking | Super Admin Support Desk | VERIFIED |
| `public.customer_notifications` | `app/actions/support.ts` | In-app notification delivery when support replies or resolves | Customer & Astrologer notification bell | VERIFIED |
| `lib/ai/grok-service.ts` | `askSupportAiAction()` | Grok AI platform assistant with offline grounding | Customer & Astrologer Support Center | VERIFIED |
