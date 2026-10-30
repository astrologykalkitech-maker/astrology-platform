# JYOTISHSETU — MASTER TECHNICAL AUDIT REPORT
## 07: Backend Architecture, Server Actions, REST APIs & Database Audit

**Audit Target:** 20 Server Actions, 13 API endpoints, 27 database migrations, RLS policies, and SQL indexing.

---

### 1. Server Actions Audit Inventory (`app/actions/*`)

| Server Action File | Primary Functions | Target DB | Table Operations | RLS & Auth Validation |
| :--- | :--- | :--- | :--- | :--- |
| `admin-actions.ts` | Listing moderation, user management | DB1 & DB2 | `astrologer_profiles`, `profiles` | Enforced (`requireAdminRole`) |
| `admin-analytics.ts` | Telemetry counters, metrics | DB1 & DB2 | Multiple count queries | Enforced (Typed validator, service role) |
| `astrologer-actions.ts`| Profile edit, availability updates | DB1 | `astrologer_profiles` | Enforced (Practitioner session check) |
| `astrologer-notes.ts` | Private practitioner CRM notes | DB1 | `astrologer_customer_notes` | Enforced (Owner practitioner check) |
| `auth.ts` | Login, registration, signout | DB1 | Supabase Auth + `profiles` | Public / Authenticated |
| `booking-actions.ts` | Create, cancel, reschedule bookings| DB1 | `customer_bookings` | Enforced (Customer UUID session check) |
| `consultation-actions.ts`| Meeting status, AI summaries | DB1 | `consultation_meetings`, summaries | Enforced (Participant session check) |
| `customer-actions.ts` | Profile & birth data updates | DB1 | `profiles` | Enforced (Customer session check) |
| `direct-leads.ts` | Direct customer-to-astrologer inquiries | DB1 | `leads` | Enforced (Customer session check) |
| `earnings-actions.ts` | Payout calculations, balance checks| DB1 | `customer_bookings` | Enforced (Practitioner session check) |
| `kundli-actions.ts` | Vedic chart calculation requests | N/A | In-memory astronomy algorithms | Open / Cached |
| `lead-actions.ts` | Triage, assignment, quoting | DB1 | `leads`, `lead_responses` | Enforced (Admin & Astrologer guards) |
| `panchang-actions.ts` | Daily planetary ephemeris | N/A | In-memory astronomical math | Open / Cached |
| `profile-actions.ts` | Avatar and credential uploads | DB1 | Supabase Storage + `profiles` | Enforced |
| `review-actions.ts` | Submit review, astrologer reply | DB1 | `reviews`, `astrologer_profiles`| Enforced (Completed booking check) |
| `support-actions.ts` | Ticket creation and inquiries | DB1 | `support_tickets` | Enforced |

---

### 2. REST API Endpoints Inventory (`app/api/*`)

| API Route | Method | Purpose | Authentication | Rate Limited |
| :--- | :--- | :--- | :--- | :--- |
| `/api/consultations/livekit-token` | POST | Generates short-lived WebRTC JWT token | Supabase Bearer / Cookie | Yes (Session validated) |
| `/api/livekit/webhook` | POST | Ingests LiveKit room disconnect events | LiveKit SHA256 Signature | Yes (Header verified) |
| `/api/places/reverse-geocode` | GET | Proxies reverse geocode coordinates | Public / Protected internal | Yes |
| `/api/kundli` | POST | Headless REST Kundli calculation | Optional API Key | Yes |
| `/api/panchang` | GET | Headless REST Panchang calculations | Optional API Key | Yes |
| `/api/auth/callback` | GET | Supabase OAuth code exchange | Public OAuth redirect | N/A |

---

### 3. Database Schema & Migration Audit

- **Total Migrations:** 27 migrations located in `supabase/migrations/`.
- **Key Tables Audited:**
  - `profiles` (id, email, full_name, role, phone, birth_date, birth_time, birth_place, coordinates)
  - `astrologer_profiles` (id, slug, specializations, languages, experience_years, consultation_fee, rating, status, is_verified)
  - `customer_bookings` (id, customer_id, astrologer_id, scheduled_at, duration_minutes, status, meeting_id, payment_status)
  - `consultation_meetings` (id, booking_id, room_name, host_id, attendee_id, status, started_at, ended_at)
  - `consultation_waiting_room` (meeting_id, participant_id, status, joined_at)
  - `consultation_summaries` (id, meeting_id, summary_text, remedies, gemstones, follow_up)
  - `leads` (id, customer_id, category, message, budget, assigned_astrologer_id, status, source)
  - `admin_audit_logs` (DB2: id, actor_id, action, target_entity, details, ip_address, created_at)
- **Foreign Keys & Cascades:** All relational tables properly enforce `ON DELETE CASCADE` or `ON DELETE SET NULL` preventing dangling references.
- **Indexes:** Dedicated B-Tree indexes on `customer_id`, `astrologer_id`, `status`, and `scheduled_at`.
