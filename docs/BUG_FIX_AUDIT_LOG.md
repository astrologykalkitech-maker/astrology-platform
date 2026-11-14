# Bug Fix Audit Log

Last updated: 2026-11-14  
Current branch: `Yash/14/11/2026`

## Summary

- Total findings documented: **18** (17 original audit records plus NOT-003, identified in Phase 5).
- Phase 0 source audit: **17 root-cause records** covering the reported items; reported commission items 1 and 7 share one effective-date root cause. The puja schema mismatch is recorded as an additional Phase 0 finding.
- Confirmed defects / missing functionality: **9**.
- Potential or runtime-dependent issues: **5**.
- Blocked pending business-rule clarification: **3**.
- Verified as not currently client-reachable: **1** (latent access-control risk recorded).
- Security: **2 confirmed high-severity vulnerabilities fixed in Phase 2**, **1 potential medium-severity video-payment policy issue deferred by request**, and **1 latent override-access issue fixed in Phase 2**.
- Fixed in Phase 0: **0**. Phase 0 was read-only; no application code, schema, or data was changed.
- Phase 1: **3 findings fixed in the schema-free scope**; broader gateway commission integration remains blocked pending migration approval.
- Phase 2: **3 security findings fixed** (SEC-001, SEC-002, SEC-004); SEC-003 is deferred pending the video-payment policy decision.
- Phase 3: **SEC-003 implemented under the approved pay-at-drop/prepaid policy**; JyotishSetu Pay manual UTR review and persisted receipt workflow implemented locally. Migration 056 is required and remains unapplied.
- Phase 4: **2 findings fixed in application code**; the puja schema fix is implemented in an unapplied migration. Offline consultation booking remains out of scope.
- Phase 5: **NOT-001, NOT-002, and one additional puja-notification failure-path issue fixed locally**.
- Phase 6: **full regression suite passed 602/602 on rerun**, with TypeScript and production build passing; database integration remains unverified.
- Pending: **7** finding records remain open, potential, or blocked; this includes the un-applied puja schema migration.
- Database migrations: `supabase/migrations/055_manual_direct_consultation_payments.sql`, `supabase/migrations/056_jyotish_pay_manual_utr_verification.sql`, and `supabase/migrations/057_puja_venue_location_integrity.sql` are present in the worktree but have **not** been applied or live-validated.
- Manual setup: astrologers need a UPI ID for direct payments; Super Admins must compare UTR claims with external payment records; configure the server-only `JYOTISH_PAY_WEBHOOK_SECRET` before enabling gateway webhooks. No secret values were inspected or changed.

The worktree already contained uncommitted application changes and an uncommitted `package.json` change before this audit. They were preserved. The audit log is the only file created for Phase 0.

## Phase 0 — Full audit and root-cause report

Date for all records: **2026-11-14**  
Tests/validation in this phase: **static source and migration review only; no tests or database operations were run by the audit agents.** The prior implementation phase had a serial full-suite result of 579/579, plus passing typecheck, targeted lint, and build; those checks do not prove the vulnerabilities below are fixed or covered.

### Commission and financial workflows

#### COMM-001 — Effective commission dates are ignored
- **Phase/date/module:** Phase 0 / 2026-11-14 / Commission rates.
- **Root cause:** `getEffectiveCommissionRate()` selects the newest active consultant/global setting without checking `effective_from <= now()` or `effective_until`. The direct-payment SQL applies both bounds, so generic and direct flows can select different rates. This consolidates reported items 1 and 7.
- **Affected files:** `lib/financial/commission-engine.ts:88-120`; `supabase/migrations/055_manual_direct_consultation_payments.sql:333-356`.
- **Fix applied:** Phase 1 filters consultant-specific and global settings by active date range, validates the selected window, and only defaults to 10% when no effective valid setting exists. Database query failures are now returned as errors rather than silently treated as missing configuration.
- **Tests/validation:** `tests/commission-rules.test.ts` covers inclusive start, exclusive end, future, expired, inactive, and invalid windows. Focused test suite passed.
- **Status:** Fixed — verified by tests and typecheck.
- **Remaining risk:** Different flows can charge different rates for the same consultant/time period.

#### COMM-002 — Voice-call retry safety is incomplete
- **Phase/date/module:** Phase 0 / 2026-11-14 / Voice-call commission.
- **Root cause:** The completion action conditionally updates the observed call status, which guards normal duplicate completion, but its ledger call has no call-specific idempotency key and catches/logs accrual errors. A failure after completion may not be retried; the generic helper can fall back to a timestamp key when no booking identifier is supplied.
- **Affected files:** `app/actions/voice-calls.ts:279-348`; `lib/financial/commission-engine.ts:159-174`; `tests/voice-call-lifecycle.test.ts`.
- **Fix applied:** Phase 1 removed per-call commission posting based only on calculated duration. A voice call now reconciles only through the existing booking RPC, which requires a completed booking and verified direct payment and has payment-level database idempotency. An ended call can retry reconciliation; errors are returned rather than swallowed.
- **Tests/validation:** `tests/voice-call-lifecycle.test.ts` covers linked-booking and positive-duration eligibility; focused tests and typecheck passed. Database retry/concurrency behavior was not live-tested.
- **Status:** Fixed for verified booking-linked direct payments; standalone voice-call payment verification remains unsupported and does not accrue commission.
- **Remaining risk:** Gateway-paid voice bookings remain outside the current accrual RPC and require the approved gateway integration described below.

#### COMM-003 — Paid chat completion has no demonstrated commission path
- **Phase/date/module:** Phase 0 / 2026-11-14 / Chat commission.
- **Root cause:** The booking-status action already invokes an RPC for completed bookings, which accrues verified direct-payment rows. Successful platform-gateway payments are excluded from that RPC. This is a gateway-payment gap, not a missing direct-payment path for booking-based chat.
- **Affected files:** `app/actions/consultation-meeting.ts:210-308`; `app/actions/astrologer-portal.ts:136-143,236-244`; `supabase/migrations/055_manual_direct_consultation_payments.sql:306-321,402-432`.
- **Fix applied:** No chat-specific code change was needed for verified direct payments; the existing completed-booking action already calls the verified-payment RPC.
- **Tests/validation:** Existing tests cover direct-payment commission eligibility but not a live paid-chat end-to-end flow. Gateway-paid chat remains untested and unsupported.
- **Status:** Open — gateway-paid chat commission requires the database integration described below.
- **Remaining risk:** Paid completed chat sessions may not contribute platform dues.

#### COMM-004 — Paid video completion has no demonstrated commission path
- **Phase/date/module:** Phase 0 / 2026-11-14 / Video commission.
- **Root cause:** The meeting end path completes the booking without commission accrual; the available direct-payment RPC does not account for successful gateway payments.
- **Affected files:** `app/actions/consultation-meeting.ts:271-308`; `app/actions/astrologer-portal.ts:236-244`; `supabase/migrations/055_manual_direct_consultation_payments.sql:306-321,402-432`.
- **Fix applied:** Phase 1 now invokes `accrue_verified_booking_commissions` after meeting termination, including safe retries. The RPC only records verified direct payments for completed bookings.
- **Tests/validation:** Focused consultation lifecycle tests, typecheck, and build are being used; no live database test was possible. Gateway-paid video remains unsupported.
- **Status:** Fixed for verified direct payments; open for platform-gateway payments.
- **Remaining risk:** The current RPC excludes successful gateway payments.

#### COMM-005 — Lead-plan and booking commission semantics need clarification
- **Phase/date/module:** Phase 0 / 2026-11-14 / Lead subscriptions.
- **Root cause:** Lead quota/subscription entitlements and `commission_settings` are separate mechanisms; the meaning of any subscription `commission_percent` relative to booking commission is not explicit.
- **Affected files:** `lib/financial/plans.ts:72,186-187`; `lib/financial/entitlements.ts:167-178`; `supabase/migrations/053_consultant_commission_and_float_system.sql:36-54`; `supabase/migrations/055_manual_direct_consultation_payments.sql:402-432`; `app/admin/page.tsx`.
- **Fix applied:** None.
- **Tests/validation:** Current tests establish arithmetic separation only; they do not prove which configured rate should apply to a subscriber.
- **Status:** Blocked — business-rule clarification required.
- **Remaining risk:** Do not merge lead plan fees/quota into consultation commission until the rate source is explicitly decided. No lead-purchase commission path was found.

#### PAY-001 — Pay-at-drop amount may not match the final bill
- **Phase/date/module:** Phase 0 / 2026-11-14 / Payment amount validation.
- **Root cause:** UTR submission validates against `customer_bookings.price`, while migration 054 adds per-minute/billable fields without an identified authoritative final-bill calculation in the inspected completion flow.
- **Affected files:** `supabase/migrations/054_custom_per_minute_pricing_and_pay_at_drop.sql:17-24`; `supabase/migrations/055_manual_direct_consultation_payments.sql:181-269`; `tests/per-minute-and-pay-at-drop.test.ts`.
- **Fix applied:** None.
- **Tests/validation:** Existing tests cover sample arithmetic, not amount reconciliation against persisted billable minutes. Reproduce with a pay-at-drop booking whose final duration charge differs from `price`.
- **Status:** Open — potential, dependent on whether `booking.price` is the authoritative final amount.
- **Remaining risk:** A claimed payment and the resulting commission may be based on the wrong amount if duration pricing is intended.

#### PAY-002 — Settlement protections exist, but retry/partial reconciliation lacks tests
- **Phase/date/module:** Phase 0 / 2026-11-14 / Wallet settlement.
- **Root cause:** Conditional status transitions, UTR uniqueness for pending/succeeded states, consultant locking, and outstanding-balance checks protect normal approval. Pending submissions do not reserve balance, and the approval RPC writes an aggregate settlement ledger row rather than allocation records.
- **Affected files:** `app/actions/commission-management.ts:146-160,265-285`; `supabase/migrations/055_manual_direct_consultation_payments.sql:92-95,615-729`; `supabase/migrations/053_consultant_commission_and_float_system.sql:116-122`.
- **Fix applied:** None.
- **Tests/validation:** No settlement retry/rejection/partial-approval tests were found. Reproduce by creating multiple partial pending settlements against one balance, then approving them sequentially and reconciling summary, ledger, and allocations.
- **Status:** Open — potential stale-submission/reconciliation issue; no duplicate approval was established in the inspected path.
- **Remaining risk:** Later pending partial submissions can become stale and be rejected; allocation-table reporting remains unverified.

### Offline booking, location, and notification workflows

#### OFF-001 — Consultation dashboard reads the wrong address column
- **Phase/date/module:** Phase 0 / 2026-11-14 / Offline consultation location.
- **Root cause:** The dashboard uses `venue_address`, while migration 053 adds `event_address` to `customer_bookings`; no checked-in migration defines `venue_address`.
- **Affected files:** `components/astrologer/bookings/AstrologerBookingsClient.tsx:406-412`; `supabase/migrations/053_consultant_commission_and_float_system.sql:127-130`.
- **Fix applied:** None.
- **Tests/validation:** Reproduce with a booking containing only `event_address`; the dashboard does not use it as its address/map condition.
- **Status:** Open — confirmed field mismatch; visible impact depends on deployed schema/data drift.
- **Remaining risk:** Coordinates may still render a map with placeholder address text.

#### OFF-002 — Puja booking writes an address column absent from checked-in migrations
- **Phase/date/module:** Phase 0 / 2026-11-14 / Puja venue schema.
- **Root cause:** The action inserts and later selects `venue_address`, but no checked-in migration defines it on `puja_bookings`.
- **Affected files:** `app/actions/puja.ts:327-357`; `app/actions/astrologer-pujas.ts:135-192`; `supabase/migrations/043_comprehensive_platform_features.sql:146-165`; `supabase/migrations/053_consultant_commission_and_float_system.sql:127-135`.
- **Fix applied:** None.
- **Tests/validation:** Reproduce on a fresh database built from checked-in migrations by submitting a puja booking with an address.
- **Status:** Open — confirmed schema gap; manually altered deployed schemas could mask it.
- **Remaining risk:** Service-role writes bypass RLS; preserve customer ownership checks when correcting the schema/action.

#### OFF-003 — Astrologer booking map does not use the requested OpenStreetMap viewer
- **Phase/date/module:** Phase 0 / 2026-11-14 / Booking maps.
- **Root cause:** The booking dashboard imports/renders `OlaMap`, not `OpenStreetMapViewer`. It reads `venue_address`; the checked-in booking migration supplies `event_address`.
- **Affected files:** `components/astrologer/bookings/AstrologerBookingsClient.tsx:26,406-412`; `components/maps/OlaMap.tsx:37-50,76-80`; `components/maps/OpenStreetMapViewer.tsx:12-24`; `supabase/migrations/053_consultant_commission_and_float_system.sql:127-130`.
- **Fix applied:** None.
- **Tests/validation:** Source review confirms OlaMap usage; its map requires valid coordinates. Runtime display depends on stored coordinates and deployment schema.
- **Status:** Open — confirmed requested integration mismatch.
- **Remaining risk:** Missing/invalid coordinates cause the map to be removed; address mismatch can leave placeholder text.

#### OFF-004 — Offline consultation booking is not end-to-end
- **Phase/date/module:** Phase 0 / 2026-11-14 / Offline booking lifecycle.
- **Root cause:** The astrologer booking form only offers Video/Call/Chat, and the booking API rejects other modes; venue fields are not sent through that create path. Migration fields alone do not provide an offline booking workflow.
- **Affected files:** `app/astrologer/(portal)/bookings/new/BookingForm.tsx:184-191`; `app/api/astrologer/create-booking/route.ts:71-75,164-180`; `supabase/migrations/025_booking_and_chat_integrity.sql:15-22,79-91`; `supabase/migrations/053_consultant_commission_and_float_system.sql:127-130`.
- **Fix applied:** None.
- **Tests/validation:** Reproduce by submitting `InPerson` to the API; it returns 400.
- **Status:** Blocked — clarify whether offline means puja bookings only or in-person consultations too.
- **Remaining risk:** If in-person consultations are required, UI, API/RPC, schema, and dashboard need an end-to-end contract for address, date, time, shift, and coordinates.

#### NOT-001 — Continuous ringtone has no reliable browser audio-unlock path
- **Phase/date/module:** Phase 0 / 2026-11-14 / Chat notifications.
- **Root cause:** Realtime callbacks start an `AudioContext` outside a user gesture; failed `resume()` is ignored, while the controller can still report active and suppress retries.
- **Affected files:** `lib/chat/audio-notification.ts:56-78,120-127`; `components/astrologer/chat/AstrologerChatClient.tsx:277-283,302-306,512-518`.
- **Fix applied:** None.
- **Tests/validation:** Reproduce in a fresh browser profile with autoplay restricted, before any interaction; existing tests do not exercise audio behavior.
- **Status:** Open — potential runtime defect, browser-policy dependent.
- **Remaining risk:** The UI may show an active ring while audio is silent; opening any conversation stops the ring, even if a different chat caused it.

#### NOT-002 — Chat notification behavior is message-driven, not conversation-creation-driven
- **Phase/date/module:** Phase 0 / 2026-11-14 / Realtime chat alerts.
- **Root cause:** The client subscribes to both message and conversation inserts, but a conversation insert only resyncs lists. A non-selected incoming customer message triggers toast/ringing; a selected conversation gets a one-shot chime/read behavior. Opening any conversation stops the continuous ring.
- **Affected files:** `components/astrologer/chat/AstrologerChatClient.tsx:193-284,294-306,387-396,453-468,512-518`; `app/actions/direct-chat.ts:797-808`; `tests/live-chat-realtime.test.ts:35-57`.
- **Fix applied:** None.
- **Tests/validation:** Existing tests check subscription wiring, not behavior. Reproduce an empty conversation insert, a message to selected chat, and a message to another chat.
- **Status:** Blocked — clarify whether a new empty chat request should ring and whether every incoming message in an already-open conversation should ring continuously.
- **Remaining risk:** RLS participant filtering remains the security boundary; client conversation checks are not authorization.

### Security findings

#### SEC-001 — Instamojo webhook can trust unsigned success status
- **Phase/date/module:** Phase 0 / 2026-11-14 / Gateway webhook integrity.
- **Root cause:** MAC is checked only when supplied; invalid MAC only warns. The request status can initialize a credit decision that survives failed/missing server verification, allowing order/payment success state to be recorded without a matching verified gateway payment.
- **Affected files:** `app/api/payments/instamojo/webhook/route.ts:51-81,98-140`.
- **Fix applied (Phase 2):** Webhook processing now rejects absent or invalid MAC before database access, requires successful server-to-server verification, and binds verified request/payment IDs, INR currency, amount, and successful status to the internal order. Existing successful payment rows are reused only when their order/request/amount/status identity matches.
- **Tests/validation:** Required/missing/tampered MAC tests and gateway payment binding tests pass; focused Instamojo tests, typecheck, scoped ESLint, production build, and `git diff --check` are recorded in Phase 2 below.
- **Status:** Fixed — high-severity vulnerability; verification is source/test/build validated, but not live-tested against Instamojo or Supabase.
- **Remaining risk:** Gateway credentials/configuration and provider behavior were not validated against a live environment.

#### SEC-002 — Instamojo verify endpoint lacks owner and order/payment binding
- **Phase/date/module:** Phase 0 / 2026-11-14 / Gateway verification API.
- **Root cause:** Endpoint has no authenticated-user/order-owner check, accepts a caller-selected payment request ID, does not bind it to the selected order, and does not compare the verified amount with the order amount before marking it successful.
- **Affected files:** `app/api/payments/instamojo/verify/route.ts:7-54,118-120`.
- **Fix applied (Phase 2):** The endpoint now requires an authenticated session, permits only the owning customer for consultation orders or owning astrologer for subscription orders, verifies the related booking/subscription association, binds the stored payment request and gateway payment ID to the order, and checks successful status, exact amount in paise, and INR currency before recording payment success.
- **Tests/validation:** Ownership and payment-binding tests cover wrong users/roles, mismatched request/payment IDs, amount, currency, and status; focused Instamojo tests, typecheck, scoped ESLint, production build, and `git diff --check` are recorded in Phase 2 below.
- **Status:** Fixed — high-severity vulnerability; verification is source/test/build validated, but not live-tested against Instamojo or Supabase.
- **Remaining risk:** Existing subscription order creation paths use inconsistent `entity_id` semantics (subscription row ID versus plan ID); this pre-existing workflow discrepancy was not redesigned in this security scope.

#### SEC-003 — Video meeting token issuance does not check payment state
- **Phase/date/module:** Phase 0 / 2026-11-14 / Video authorization.
- **Root cause:** Meeting creation validates participant and booking state but not payment mode or verified payment. A confirmed booking can receive a LiveKit token while its direct UTR remains pending.
- **Affected files:** `app/actions/consultation-meeting.ts:40-103,168-185`; related transition `app/actions/astrologer-portal.ts:103-161`.
- **Fix applied (Phase 3):** Under the approved policy, `pay_at_drop` bookings remain eligible for a video token; prepaid video modes require successful payment backed by a verified direct payment or trusted JyotishSetu Pay verification source. Unknown modes and payment lookup errors fail closed.
- **Tests/validation:** `tests/consultation-payment-access.test.ts` covers pay-at-drop allowance and prepaid verification requirements; focused payment tests, typecheck, and production build pass. Database behavior was not live-tested.
- **Status:** Fixed in application code — medium-severity authorization gap addressed under the selected policy.
- **Remaining risk:** Enforcement against live payment rows depends on applying the required migrations; historical intents without a trusted verification source remain ineligible.

#### SEC-004 — Consultant override lacks authorization but is not currently client-reachable
- **Phase/date/module:** Phase 0 / 2026-11-14 / Wallet statement access.
- **Root cause:** `getConsultantCommissionStatement(consultantIdOverride?)` skips the caller’s own-profile lookup when an override is supplied. The only current call site passes no override and is on an astrologer-protected server page; the helper is not a Server Action/API.
- **Affected files:** `lib/financial/commission-engine.ts:229-290`; `app/astrologer/(portal)/earnings/page.tsx:25`.
- **Fix applied (Phase 2):** The statement loader now resolves the caller's role and consultant profile. Astrologers may access only their own statement; Super Admin and the legacy `admin` role may access another consultant's statement. Profile lookup errors are returned explicitly.
- **Tests/validation:** Added focused tests for own-consultant access, cross-consultant denial, missing profile, customer denial, and Super Admin access. Focused security tests, typecheck, scoped ESLint, production build, and diff checks pass.
- **Status:** Fixed — latent cross-consultant access risk is now guarded even if a future caller supplies an override.
- **Remaining risk:** No route/action-level integration test exists for this helper call path; access policy is unit-tested and type/build validated.

## Phase roadmap

1. **Phase 1 — Commission and float:** unify effective-date/rate selection; add call/payment-specific idempotency and retry-safe completion; define and implement chat/video/online/offline commission paths; settle final pay-at-drop amount source; add settlement retry/partial tests; explicitly keep lead-plan fees/quota out of booking commission.
2. **Phase 2 — Payment and financial security:** fail closed on webhook MAC/server verification; authenticate and bind verify requests to owner/order/request/payment/amount/currency; validate direct UTR amount against authoritative final billing; add payment/refund/settlement integration tests. Treat SEC-001/SEC-002 as production blockers.
3. **Phase 3 — Online consultations:** approved video payment policy and manual JyotishSetu Pay verification workflow implemented locally; migration 056 and live database/integration tests remain pending.
4. **Phase 4 — Offline bookings/maps:** puja venue booking location validation and OpenStreetMap display implemented locally; migration 057 awaits normal database review/application. Offline consultations remain online and out of scope.
5. **Phase 5 — Notifications:** approved chat alert behavior, browser audio unlock/retry, and duplicate-message handling implemented locally; puja notification persistence failures are now logged.
6. **Phase 6 — Integration/regression:** disposable Supabase migration tests, security negative tests, financial retry/concurrency tests, full suite, typecheck, lint, and production build.

At the end of Phase 0, no later phase had started. Phase 1 was subsequently approved on 2026-11-14.

## Phase 1 — Commission and float (approved; schema-free work only)

Date: **2026-11-14**  
Scope: Effective-rate correctness, safe commission idempotency, and reconciliation through the existing verified direct-payment RPC. The existing ₹500 / 10-lead plan was not changed.

### Changes made

- `lib/financial/commission-rules.ts` and `tests/commission-rules.test.ts`: introduced and tested effective-window validation.
- `lib/financial/commission-engine.ts`: applies effective dates to both consultant-specific and global rates, surfaces database failures, rejects invalid amounts/rates, requires a deterministic transaction reference for fallback idempotency, validates duplicate-key identity, and refreshes balance summaries on valid retries.
- `app/actions/voice-calls.ts`, `lib/chat/voice-call.ts`, and `tests/voice-call-lifecycle.test.ts`: removed unverified duration-only ledger posting; linked calls reconcile only through a completed booking's verified-payment RPC, and failed reconciliation is retryable and visible.
- `app/actions/consultation-meeting.ts`: meeting completion now reconciles verified direct-payment commission after completion and on retries.
- `docs/BUG_FIX_AUDIT_LOG.md`: records Phase 0 and Phase 1 evidence.

### Validation

- Focused commission, direct-payment, voice-call, and meeting tests: **20/20 passed**.
- TypeScript typecheck: **passed**.
- ESLint on changed TypeScript files: **passed**.
- `git diff --check`: **passed**.
- Full suite: **581/582 passed** on both runs. The unrelated timing-sensitive horoscope test measured 228.6 ms during the concurrent build and 100.9 ms on a second full-suite run. Its isolated file passed **3/3** (96.8 ms), confirming the full-suite failure is timing-sensitive.
- Production build: **passed**.
- No migration or database operation was run.

### Remaining Phase 1 blocker — database migration approval required

The existing RPC accrues only verified direct payments; successful `payment_orders` and `payment_intents` are excluded. Completing chat/video/voice gateway commission safely requires a migration that extends the booking accrual RPC to lock the booking, verify completed status and successful payment records/amount, choose one canonical captured payment (reject ambiguous duplicate captures for manual reconciliation), use a booking/payment idempotency key, and refresh the summary in the same transaction. No schema change has been made because it requires separate approval.

Standalone voice calls and puja/pay-at-drop records also lack a trusted verified-payment relationship to the commission ledger. They must not accrue from client/customer declarations or computed duration alone; a payment-verification schema/workflow is required before enabling their commission.

**Phase status: Direct verified-payment scope is implemented and validated. Gateway commission remains blocked on separate migration approval. Phase 2 payment-security work was subsequently approved; see the Phase 2 record below.**

## Phase 2 — Payment and financial security (SEC-001, SEC-002, SEC-004)

Date: **2026-11-14**  
Scope: Fail-closed Instamojo webhook verification, authenticated owner-bound payment verification, and consultant-statement access control. SEC-003's video-token policy was deferred by user request. No migration or database operation was changed or run.

### Changes made

- `lib/financial/instamojo.ts`: added a required-MAC wrapper that rejects missing/blank signatures.
- `lib/financial/instamojo-verification.ts`: added pure helpers for caller ownership, exact INR amount parsing, and gateway payment/order matching.
- `app/api/payments/instamojo/webhook/route.ts`: rejects invalid/missing MAC before database access; requires server-to-server verification; binds the verified payment request, payment ID, successful status, INR currency, and exact order amount; validates any existing payment row before reuse.
- `app/api/payments/instamojo/verify/route.ts`: requires authentication; checks customer/astrologer ownership and linked entity; binds the gateway request/payment to the order and verifies status, amount, and currency before recording success.
- `tests/financial-system.test.ts` and `tests/instamojo-verification.test.ts`: cover missing/tampered MAC, ownership, strict paise parsing, and request/payment/amount/currency/status mismatches.
- `lib/financial/commission-access.ts`, `lib/financial/commission-engine.ts`, and `tests/commission-access.test.ts`: enforce and test owner-only consultant statements, with Super Admin access for cross-consultant review.
- Updated the SEC-001, SEC-002, and SEC-004 audit records with implementation evidence and remaining limits.

### Validation

- Focused security tests: **13/13 passed**.
- TypeScript typecheck: **passed**.
- ESLint on Phase 2 files: **passed with one pre-existing unused `dns` import warning** in `lib/financial/instamojo.ts`.
- `git diff --check`: **passed**.
- Production build after all Phase 2 changes: **passed**.
- No live Instamojo/Supabase request, migration, or database operation was run.

### Remaining risks and limitations

- Subscription-order creation in the existing code uses both subscription-row IDs and plan IDs as `entity_id`; this was not redesigned within SEC-001/SEC-002 scope.
- The database uniqueness constraint on `payments.payment_id` provides protection against duplicate inserts racing across webhook and verify requests; live concurrency behavior was not tested.
- SEC-003, the video payment gate, was deferred by user request because payment-mode access policy needs a product decision. Gateway commission policy, refunds, and other open findings were not changed.

**Phase status: SEC-001, SEC-002, and SEC-004 are fixed in the reviewed paths and pass focused tests, typecheck, scoped lint, production build, and diff checks. SEC-003 is explicitly deferred. No migration or database operation was run.**

## Phase 3 — Online consultation access and JyotishSetu Pay manual review

Date: **2026-11-14**  
Scope: Apply the approved video access policy (`pay_at_drop` allowed; prepaid video requires verified payment), add Super Admin review for JyotishSetu Pay UTR claims, harden webhook binding, and issue receipts only for persisted verified payments. Migration 056 was created but not applied.

### Changes made

- `app/actions/consultation-meeting.ts` and `lib/consultation/payment-access.ts`: fail closed on unknown payment modes and lookup failures; permit `pay_at_drop`; require trusted verified payment for prepaid video.
- `app/api/pay/intent/create/route.ts`: authenticate intent creation and derive payment ownership/amount from server-side booking or plan data.
- `app/api/pay/verify-utr/route.ts`, `lib/pay/manual-utr-rules.ts`, and `supabase/migrations/056_jyotish_pay_manual_utr_verification.sql`: record UTR claims as pending only; the database RPC checks booking/session ownership and expected amount, enforces UTR uniqueness, and records payment date. Customer submission does not mark payment paid.
- `app/actions/financial-verification.ts`, `app/super-admin/financials/commissions/verifications/page.tsx`, and `components/admin/ManualPaymentVerificationClient.tsx`: provide a Super Admin review queue and approve/reject actions with decision metadata. Approval is transaction-backed in the migration and creates the receipt; commission accrual remains contingent on completed booking status.
- `app/api/pay/webhook/gateway/route.ts`, `lib/pay/webhook-signature.ts`, and `lib/pay/config.ts`: require configured HMAC-SHA256 validation and exact transaction/session/intent/amount binding; removed amount-only session matching.
- `app/api/pay/qr/[sessionCode]/status/route.ts`, `app/api/pay/receipt/download/route.ts`, `lib/pay/orchestrator.ts`, `lib/pay/receipt.ts`, and `components/pay/JyotishPayModal.tsx`: require persisted trusted success for receipt download, authenticate and enforce receipt ownership, persist actual receipt metadata, return only stored receipt numbers, and avoid showing a download link when no receipt exists.
- `app/api/pay/simulate/complete/route.ts`: restrict simulation to Super Admin and non-production use.
- `tests/manual-utr-rules.test.ts`, `tests/pay-webhook-signature.test.ts`, and `tests/consultation-payment-access.test.ts`: cover UTR format/date, signed webhook verification, and prepaid/pay-at-drop access rules.
- `docs/BUG_FIX_AUDIT_LOG.md`: records Phase 3 implementation and validation.

### Validation

- Focused payment/access tests: **4/4 passed**.
- TypeScript typecheck: **passed** after the production build completed.
- ESLint on the updated receipt/status route files: **passed**.
- Broader ESLint invocation on Phase 3 files: **failed on existing `no-explicit-any` errors and unused-import/hooks warnings** in the webhook route, payment modal, and orchestrator; these unrelated/pre-existing findings were not expanded into this phase.
- Full test suite: **587/591 passed**. The four failures were timing thresholds in `tests/ai-horoscope-validation.test.ts`, `tests/load-stress-benchmark.test.ts`, and `tests/production-performance-benchmarks.test.ts`; they did not exercise the changed payment paths.
- Production build: **passed**.
- `git diff --check`: **passed**.
- No migration, live Supabase operation, or live payment-provider request was run.

### Migration and remaining risks

- Apply migrations through `056_jyotish_pay_manual_utr_verification.sql` in order after the migrations it depends on, including 041, 054, and 055. Migration 055 and 056 are both unapplied in this worktree. Review/backup and apply through the project's normal database change process; no rollback was executed or tested.
- Configure server-only `JYOTISH_PAY_WEBHOOK_SECRET` with the gateway's matching secret before accepting signed webhook events.
- JyotishSetu Pay refund handling and commission reversal are not implemented in migration 056; refund reconciliation remains an open requirement.
- Database transaction/idempotency behavior, RLS/grants, and commission accrual were reviewed statically but not exercised against a migrated disposable database. Do not treat this implementation as production-verified until that test is completed.
- Generic webhook completion and ledger/booking updates still span separate operations; failures after partial writes may require manual reconciliation.

**Phase status: Application changes and build/type validation are complete locally; financial-database validation and deployment are blocked until the approved migrations and test configuration are available. No database changes were applied.**

## Phase 4 — Puja venue booking and OpenStreetMap

Date: **2026-11-14**  
Scope: Puja venue bookings only, as clarified and approved. Consultation bookings remain online; no offline consultation booking flow or database migration was applied.

### Findings and changes

- **OFF-001 — Consultation dashboard address/map display mismatch:** the astrologer booking display now uses the persisted `event_address` and the shared OpenStreetMap viewer. This is display-only and does not add or enable in-person consultations. **Status: Fixed in application code.**
- **OFF-002 — Puja venue address column missing from checked-in migrations:** added `venue_address` and integrity constraints to migration 057; the server action now validates and persists the required venue address and optional landmark/coordinate pair. **Status: Implemented locally; migration 057 must be reviewed and applied before a fresh database can support these writes.**
- **OFF-003 — Booking maps used OlaMap and fabricated fallback coordinates/address:** puja displays now use OpenStreetMap and stored venue data. The shared viewer rejects invalid coordinate pairs, shows no pin/navigation link without valid coordinates, uses lazy loading and `no-referrer`, and no longer defaults to a fabricated Delhi location. **Status: Fixed in application code.**
- **OFF-004 — Offline consultation booking is not end-to-end:** not implemented. The user clarified that Phase 4 is for puja venue bookings only and consultations must remain online. **Status: Out of scope/blocked by the approved scope clarification.**

### Files changed

- `lib/location/coordinates.ts` and `tests/puja-location.test.ts`: shared location/address validation and focused regression coverage.
- `app/actions/puja.ts`: requires the customer role and validates venue data before service-role insertion; customer booking reads require the customer role.
- `components/customer/CustomerPujaBookingClient.tsx`: venue autocomplete, no hardcoded location, coordinate reset on manual address edits, and stored venue map display.
- `components/maps/OpenStreetMapViewer.tsx`: safe coordinate handling and OpenStreetMap rendering without fabricated defaults.
- `components/astrologer/AstrologerPujasClient.tsx`: renders the persisted puja venue through OpenStreetMap.
- `components/astrologer/bookings/AstrologerBookingsClient.tsx`: reads the schema's `event_address` and renders the shared OpenStreetMap viewer; no booking mode or creation flow changed.
- `lib/types/database.types.ts`: adds customer-booking location properties while preserving the existing Phase 1–3 type changes.
- `supabase/migrations/057_puja_venue_location_integrity.sql`: adds puja venue columns/constraints and replaces customer `FOR ALL` access with own-row `SELECT`; existing Super Admin access is retained. **Not applied.**

### Validation

- Focused location/geocoding tests: **23/23 passed**.
- TypeScript typecheck: **passed**.
- Narrow ESLint on the new location helper, map viewer, and focused test: **passed**.
- Broader ESLint over the touched legacy UI/action files: **failed** on existing `no-explicit-any`, `prefer-const`, unused-import, JSX quote-escaping, and `<img>` diagnostics. No unrelated lint cleanup was included.
- Production build: **passed**.
- `git diff --check`: **passed**.
- No migration, live database operation, or browser end-to-end test was run.

### Migration impact and remaining risks

- Review and apply migration 057 through the normal database change process before deploying the puja address write. It uses `NOT VALID` constraints to avoid scanning legacy rows while enforcing checks on new/updated rows.
- The migration replaces the named customer `FOR ALL` policy with own-row `SELECT`. Before applying, confirm all customer puja mutations continue to use the authenticated server actions; rollback would need to restore the previous policy. Dropping the new address column during rollback would discard stored venue addresses, so preserve data and dependents before any column rollback. No rollback was tested.
- Migration compatibility, policy behavior, and constraints were not tested against a disposable Supabase database. The worktree may also coexist with manually altered deployed schemas.
- OpenStreetMap receives the requested map coordinates in its iframe URL when a valid venue pin exists; the iframe sends no referrer. No live external map or browser-policy validation was run.
- **Phase status:** Application changes and production build are locally verified. OFF-002 remains deployment-dependent until migration 057 is reviewed and applied. Phase 5 and Phase 6 have not started.

## Phase 5 — Chat and puja notifications

Date: **2026-11-14**  
Scope: Chat alerts/audio behavior and existing puja booking notifications. User-selected behavior: empty conversation creation does not ring; the first customer message in a chat that is not open rings until that conversation is opened; a customer message in the open chat plays a short chime.

### Findings and changes

- **NOT-001 — Browser autoplay can leave the ringtone silent:** chat clients now request audio unlock on the first pointer or keyboard gesture. Ringtone controllers remain attached while audio is suspended and start when the shared `AudioContext` successfully resumes. Ringer stop removes its listener/timer and stops active oscillators without closing the shared context. **Status: Fixed in application code.**
- **NOT-002 — New/selected conversation alert behavior was incomplete:** empty conversation inserts continue to refresh lists without sound; only incoming customer messages trigger alerts. Open-chat messages chime; messages in other chats ring. Ringing is tracked across the affected unread conversations and stops when the relevant chat(s) are opened. **Status: Fixed under the user-approved behavior.**
- **NOT-003 — Puja notification persistence errors were ignored:** booking notification inserts previously ignored returned Supabase errors and swallowed thrown errors. The action now logs notification persistence failures without converting a successfully created booking into a failed booking response. Existing sequential duplicate-booking/idempotency checks remain in place. **Status: Fixed for error visibility; delivery is not transactionally guaranteed.**
- Incoming message IDs are deduplicated in both chat clients using a bounded recent-ID set, preventing repeated realtime events from incrementing unread counts or replaying audio/toasts.

### Files changed

- `lib/chat/audio-notification.ts`: shared audio context, explicit user-gesture unlock, pending-ringer resume event, and reliable ringer cleanup.
- `lib/chat/notification-rules.ts`: alert policy and bounded incoming-message deduplication.
- `components/astrologer/chat/AstrologerChatClient.tsx`: audio unlock, alert policy, deduplication, per-conversation pending ringing, and mute/open behavior.
- `components/customer/chat/CustomerChatClient.tsx`: audio unlock and duplicate incoming-message suppression for chimes, unread counts, and toasts.
- `app/actions/puja.ts`: logs customer/astrologer notification persistence errors without failing booking creation.
- `tests/audio-notification.test.ts`, `tests/chat-notification-rules.test.ts`, and `tests/live-chat-realtime.test.ts`: cover gesture unlock, alert policy, bounded deduplication, realtime handling, and no ring on empty conversation insert.

### Validation

- Focused notification tests: **10/10 passed**.
- TypeScript typecheck: **passed** after production build generation completed. An earlier concurrent typecheck failed because Next.js was rebuilding `.next/types`; the rerun passed.
- ESLint on new notification helpers/tests: **passed**.
- ESLint across all touched Phase 5 files: **failed** on existing diagnostics in legacy code (`no-explicit-any`, `prefer-const`, and unused-variable warnings); no lint diagnostics were reported in the new helper/test files or the new UI lines.
- Production build: **passed**.
- `git diff --check`: **passed**.
- No live browser autoplay-policy test or Supabase notification integration test was run.

### Remaining risks

- Browsers require a user gesture to unlock audio; before the first successful gesture, a continuous ring is pending and silent. The browser behavior was tested with a mocked AudioContext, not a real browser profile.
- Puja notification writes remain separate from booking insertion; failures are now visible in server logs but can still leave a booking without its notification. No DB idempotency constraint or transaction was added.
- **Phase status:** Phase 5 application changes and local checks are complete. Phase 6 has not started.

## Phase 6 — Integration and regression validation

Date: **2026-11-14**  
Scope: Full local regression suite, repository lint, TypeScript, production build, and diff validation. No application behavior or database schema was changed in this phase.

### Validation

- Full test suite: **602/602 passed** on the final run.
- One earlier full-suite run had **601/602** pass: the performance-only LRU cache benchmark measured 33.12 ms against its 30 ms threshold while lint/typecheck were running concurrently. The isolated test passed at 8.47 ms, and the full suite passed on an uncontended rerun.
- TypeScript typecheck: **passed**.
- Production build: **passed**.
- `git diff --check`: **passed**.
- Repository-wide ESLint: **failed with 503 diagnostics (281 errors, 222 warnings)** across the project, primarily `no-explicit-any`, `prefer-const`, and unused-variable findings. These were not broadly cleaned up in Phase 6.

### Remaining integration limitations

- No disposable or live Supabase database was configured/migrated for RLS, migration, transaction, or notification integration tests. The test output included expected missing-credential/database-table warnings; no live database operation was attempted.
- No real-browser autoplay or end-to-end UI test was run.
- Migrations 055–057 remain unapplied; database-backed payment, commission, and puja location behavior remains deployment-dependent.
- **Phase status:** Local regression and build validation are complete; live database and browser integration validation remain pending. No commit, push, deployment, or migration was performed.
