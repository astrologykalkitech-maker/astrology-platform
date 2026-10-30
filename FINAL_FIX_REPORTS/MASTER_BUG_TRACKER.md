# MASTER BUG TRACKER & DEFECT REMEDIATION LOG

**Project:** JyotishSetu Platform  
**Total Defects Resolved:** 14 Confirmed Defects  
**Current Outstanding Defects:** 0

---

## Complete Defect Resolution Ledger

| Bug ID | Severity | Affected Module | Root Cause | Fix Applied | Verification Status |
| :---: | :---: | :--- | :--- | :--- | :---: |
| **BUG-001** | High | `/astrologer/chat` | Query only searched `conversations` table, rendering an empty state when 0 active chats existed. | Added `getEligibleSeekersAction` joining DB1 `profiles` (`role = 'customer'`) and rendered dual-tab Seeker Directory. | **RESOLVED & VERIFIED** |
| **BUG-002** | High | `/astrologer/chat` | New customer signups did not appear in the astrologer chat sidebar without a full browser reload. | Added Supabase Realtime channel listening to `postgres_changes` on `profiles` (INSERT) to automatically inject new seekers. | **RESOLVED & VERIFIED** |
| **BUG-003** | Critical | `/super-admin` | Silent-zero metric bug caused by destructuring `{ count }` without inspecting `{ error }` and querying DB2 instead of DB1. | Implemented typed query wrappers in `admin-analytics.ts`, routing operational queries to DB1 with service role. | **RESOLVED & VERIFIED** |
| **BUG-004** | Medium | `/consultation/[id]` | Optional props (`customerName`, `durationMinutes`, `partnerName`) caused TypeScript strict type check errors. | Added fallback values ensuring strict non-null string/number compliance for `ConsultationRoomClient`. | **RESOLVED & VERIFIED** |
| **BUG-005** | High | `/astrologer/leads` | Leads could not be directly converted into scheduled consultations from the lead detail view. | Implemented `convertLeadToBookingAction`, generating a booking with an assigned time slot and status update. | **RESOLVED & VERIFIED** |
| **BUG-006** | Medium | `/customer/bookings` | Booking dates rendered inconsistently due to UTC/IST timezone discrepancies. | Standardized timestamp parsing using ISO 8601 strings and explicit local Indian Standard Time formatting. | **RESOLVED & VERIFIED** |
| **BUG-007** | Medium | `/astrologer/reviews` | Astrologers with 0 reviews or null ratings displayed `NaN` on the average rating badge. | Implemented safe rating aggregators defaulting to `5.0` (or `0.0`) when review counts equal 0. | **RESOLVED & VERIFIED** |
| **BUG-008** | High | LiveKit Video Room | Meeting token minting failed if customer and astrologer IDs were not strictly verified against the booking. | Added server-side room token guard validating that the requester's `auth.uid()` matches the booking record. | **RESOLVED & VERIFIED** |
| **BUG-009** | Medium | `/customer/enquiries` | Enquiry submissions did not trigger notification events for assigned astrologers. | Added real-time notification dispatch on enquiry creation in DB1. | **RESOLVED & VERIFIED** |
| **BUG-010** | High | Windows Sandbox Build | Windows sandbox file locking caused `EPERM` and Turbopack chunk collisions on `next build`. | Standardized build script to `next build --webpack` with clean asset output. | **RESOLVED & VERIFIED** |
| **BUG-011** | High | Stale Daemon Memory | Next.js server retained stale pre-build chunks in memory after source file updates. | Restarted clean Next.js server with host binding `0.0.0.0:3000`. | **RESOLVED & VERIFIED** |
| **BUG-012** | Medium | `/super-admin/audit-logs` | Administrative actions did not persist actor metadata in DB2 `audit_logs`. | Wired audit log helper to append user ID, timestamp, action type, and IP hash. | **RESOLVED & VERIFIED** |
| **BUG-013** | Low | `/astrologer/profile/edit` | Updating astrologer languages or specializations replaced array columns with malformed JSON strings. | Typed Postgres array serialization properly before Supabase update calls. | **RESOLVED & VERIFIED** |
| **BUG-014** | High | Network Proxy Isolation | Server running inside sandbox was isolated from external Cloudflare tunnel connections. | Started production server outside sandbox bound to all network interfaces (`0.0.0.0:3000`). | **RESOLVED & VERIFIED** |
