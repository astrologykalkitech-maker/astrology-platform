# JYOTISHSETU — SYSTEM REPAIR & PRODUCTION HARDENING REPORT
## 06: Security Hardening, Database Integrity & RLS Compliance

**Date:** October 30, 2026  
**Target:** Supabase Row Level Security (RLS), RBAC Guards, LiveKit Token Security

---

### 1. Security Enforcements Applied

1. **Role-Based Access Control (RBAC):**
   - `lib/auth/admin-guard.ts` validates administrative credentials against DB2 `profiles` and `admin_permissions`.
   - Regular users attempting to access `/super-admin/*` routes are redirected to `/astrologer/login?reason=role_unauthorized`.

2. **LiveKit WebRTC Least-Privilege Grants:**
   - Short-lived JWT tokens generated in `lib/consultation/token.ts`.
   - Astrologer receives `roomAdmin: true`.
   - Customer receives `roomAdmin: false` with strict room binding.
   - Credentials fail closed if `LIVEKIT_API_KEY` or `LIVEKIT_API_SECRET` are missing.

3. **Database RLS Policies:**
   - DB1 tables (`customer_bookings`, `astrologer_customer_notes`, `leads`, `conversations`, `direct_messages`) enforce user ownership policies.
   - Privileged operations utilize server-side service-role clients; service keys are never bundled in client code.

4. **Input Sanitization & Validation:**
   - PostgREST queries sanitize user filter strings via `lib/security/postgrest.ts` to prevent filter injection.
   - Direct messaging clamps messages to 2,000 characters and validates UUIDs.
