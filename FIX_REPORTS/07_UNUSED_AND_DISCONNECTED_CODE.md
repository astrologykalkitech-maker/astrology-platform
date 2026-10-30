# JYOTISHSETU — SYSTEM REPAIR & PRODUCTION HARDENING REPORT
## 07: Code Utilization, Quarantine & Dead Code Audit

**Date:** October 30, 2026  
**Target:** Codebase utilization analysis and legacy file evaluation

---

### 1. Status of `lib/customer-demo.ts`
- **Analysis:** Contains `CUSTOMER_BOOKINGS_STORAGE_KEY` and `CustomerDemoBooking` type.
- **Dependency Check:** Referenced by `tests/journey-completeness.test.ts` for legacy booking contract validation.
- **Verdict:** **PRESERVED WITH DEPRECATION NOTICE.** Deleting the file would break the existing test suite. It is quarantined as test-only legacy code and never imported in production application bundles.

### 2. Cleaned Unused Exports & Imports
- All unused imports across components and actions were pruned cleanly:
  - `app/consultation/[id]/page.tsx`
  - `app/actions/consultation-summary.ts`
  - `CustomerBookingsClient.tsx`
  - `AstrologerSidebar.tsx`
  - `AstrologerBookingsClient.tsx`
  - `AstrologerChatClient.tsx`
  - `ProfileImageModal.tsx`
  - `ConsultationRoomClient.tsx`
  - `lib/astrology/astronomy.ts`
  - `lib/astrology/panchang.ts`
  - `lib/astrology/vedic-core.ts`
  - Test suites (`astrology-calculation-engine`, `astrology-engine-extended`, `concurrency-race-conditions`, `conferencing-host-controls`).
