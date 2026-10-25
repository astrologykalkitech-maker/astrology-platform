# PRODUCTION DEPLOYMENT CHECKLIST

**Project:** JyotishSetu Astrology Consultation Platform  
**Target Release:** Customer Dashboard & Backend Hardening  
**Release Readiness:** **PRODUCTION READY**

---

## 1. Environment Variables Required

Ensure the following variables are configured in production hosting (e.g., Vercel / Cloudflare / Supabase):

| Variable Name | Description | Client/Server |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public API URL of your primary Supabase instance | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Anon key for client sessions | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged service key for atomic admin functions | **Server Only** |
| `ADMIN_SUPABASE_URL` | (Optional) Secondary admin database URL if used | **Server Only** |
| `ADMIN_SUPABASE_SERVICE_ROLE_KEY`| (Optional) Secondary admin database service key | **Server Only** |

> ⚠️ **Security Warning:** Never expose `SUPABASE_SERVICE_ROLE_KEY` to client components, logs, or client-side bundles.

---

## 2. Database Migration Order

Run the migration scripts sequentially against your Supabase database:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_astrologer_and_auth.sql`
3. `supabase/migrations/003_astrologer_profile_security.sql`
4. `supabase/migrations/004_lead_assignment_status_security.sql`
5. `supabase/migrations/005_admin_workspace_foundation.sql`
6. `supabase/migrations/006_owner_role_hardening.sql`
7. `supabase/migrations/007_transactional_lead_capture.sql`
8. `supabase/migrations/008_atomic_lead_assignment.sql`
9. `supabase/migrations/009_security_and_rls_hardening.sql`
10. `supabase/migrations/010_sync_lead_status_on_assignment.sql`
11. `supabase/migrations/011_fix_trigger_nullif_type_cast.sql`
12. `supabase/migrations/012_realtime_astrologer_visibility.sql`
13. `supabase/migrations/013_customer_bookings_and_notifications.sql`
14. `supabase/migrations/014_consultation_messages.sql`
15. `supabase/migrations/015_customer_profile_and_reviews.sql` *(New — Profile birth fields & Reviews)*

---

## 3. Post-Deployment Verification Steps

1. **Customer Sign-Up / Login:**
   - Verify that new user registration grants `customer` role and creates a row in `public.profiles`.
2. **Customer Profile (`/customer/profile`):**
   - Save full name, phone number, date of birth, time of birth, and birthplace.
   - Verify that the Kundli readiness meter updates and data survives page reloads.
3. **Astrologer Discovery (`/customer/astrologers`):**
   - Verify pagination controls with 12 items per page.
   - Confirm suspended or rejected astrologers are excluded.
4. **Enquiry Creation (`/customer/enquiries/new`):**
   - Verify that the "Auto-attach Saved Kundli Details" button inserts the user's birth information.
5. **Consultation Reviews (`/customer/enquiries/[id]`):**
   - Mark an enquiry as `closed` or `converted` and verify that the 1–5 star review form renders and submits cleanly.
6. **Consultation Join Modal (`/customer/bookings`):**
   - Verify that confirmed consultations show the "Join" or "Details" action with active Muhurat window calculation.
7. **Sign Out:**
   - Click "Sign out" and verify that the confirmation dialog appears before invalidating the session.
