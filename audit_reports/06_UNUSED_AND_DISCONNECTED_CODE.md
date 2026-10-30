# JYOTISHSETU — MASTER TECHNICAL AUDIT REPORT
## 06: Dead, Unused, Orphaned & Disconnected Code Audit

**Audit Target:** Code utilization, dead code analysis, orphaned files, and deprecated endpoints.  
**Safety Protocol:** Strict Read-Only Audit. No files modified or deleted during this evaluation.

---

### 1. Confirmed Orphaned & Dead Modules

#### A. `lib/customer-demo.ts` (100% Dead Code)
- **Description:** A legacy mock file utilizing `localStorage` to store fake customer bookings under the key `astroconnect-bookings-demo-v1`.
- **References:** Zero imports in the entire codebase (`grep -rn "customer-demo" .` -> 0 occurrences).
- **Status:** **DEAD CODE.**
- **Recommendation:** Can be safely archived to a deprecated scratch directory without any impact on builds or runtime.

#### B. Deprecated Mock Astrologer Data in Tests
- **Description:** Several older test mocks in `tests/fixtures/` declare dummy astrologer objects with deprecated properties (e.g. `hourlyRate` vs canonical `consultation_fee`).
- **Status:** **INTERNAL TEST DEBT.** Does not impact production bundles because tests are omitted from Next.js builds.

---

### 2. Disconnected vs Intentionally Isolated Endpoints

| File / Component | Type | Current Utilization | Risk Level | Verdict & Action |
| :--- | :--- | :--- | :--- | :--- |
| `lib/customer-demo.ts` | Utility | Never imported | Zero | Candidate for deletion in next major refactor |
| `app/api/places/reverse-geocode` | API Route | Called by `AstrologersDirectoryClient.tsx` | Low | Actively used internal proxy; maintain |
| `app/api/livekit/webhook` | Webhook | Receives room lifecycle events from LiveKit | Low | Active webhook handler; maintain |
| `supabase-admin/` (legacy SQL) | Migration | Superseded by `supabase/migrations/` | Zero | Retained for historical schema documentation |

---

### 3. Cleanliness & Build Metrics
- **Dead Dependencies:** Zero unused npm packages detected in `package.json`.
- **TypeScript Dead Exports:** Minimal; all exported types in `lib/types/database.types.ts` match active Supabase tables.
- **Production Bundle Hygiene:** Next.js tree-shaking successfully eliminates unreferenced modules from client JS chunks.
