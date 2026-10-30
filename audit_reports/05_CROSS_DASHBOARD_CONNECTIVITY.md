# JYOTISHSETU — MASTER TECHNICAL AUDIT REPORT
## 05: Cross-Dashboard Feature Connectivity & Lifecycle Trace Matrix

**Audit Target:** End-to-end data flow between Customer, Astrologer, and Super Admin personas.  
**Scope:** 5 critical platform business lifecycles traced across UI components, server actions, database state, and WebRTC streaming.

---

### 1. Lifecycle 1: Consultation Booking to Room Completion

```
[CUSTOMER]
  │  1. Visits /customer/astrologers/[slug]
  │  2. Picks available Muhurat slot
  │  3. Submits BookingModal -> createCustomerBooking()
  ▼
[DATABASE 1]
  │  4. Inserts customer_bookings (status: 'confirmed')
  │  5. Provisions consultation_meetings record
  ▼
[ASTROLOGER DASHBOARD]
  │  6. Realtime channel detects new booking
  │  7. Displays in /astrologer/bookings & /astrologer/dashboard
  ▼
[SUPER ADMIN]
  │  8. Live telemetry updates total consultations count
  │  9. Booking visible in /super-admin/bookings desk
  ▼
[MUHURAT WINDOW (T-15 mins)]
  │  10. Room /consultation/[id] unlocked for both parties
  │  11. Customer enters waiting room (consultation_waiting_room)
  │  12. Astrologer host admits customer
  │  13. LiveKit WebRTC peer connection established
  ▼
[SESSION CONCLUSION]
  │  14. Astrologer ends meeting
  │  15. AI summary generated & saved to consultation_summaries
  │  16. Booking status marked 'completed'
```
- **Connectivity Status:** **100% CONNECTED & OPERATIONAL**

---

### 2. Lifecycle 2: Customer Lead to Astrologer Quote & Triage

```
[CUSTOMER]
  │  1. Submits inquiry at /customer/enquiries/new
  ▼
[DATABASE 1]
  │  2. Inserts into leads (source: 'platform' or 'direct', status: 'new')
  ▼
[SUPER ADMIN]
  │  3. Notified via /super-admin/leads
  │  4. Triages lead and selects verified astrologer
  │  5. Calls assignLead() -> updates leads.assigned_astrologer_id
  ▼
[ASTROLOGER DASHBOARD]
  │  6. Lead appears immediately in /astrologer/leads
  │  7. Astrologer opens /astrologer/leads/[id]
  │  8. Submits price quote or proposal via submitLeadQuote()
  ▼
[CUSTOMER DASHBOARD]
  │  9. Customer views response at /customer/enquiries/[id]
  │  10. Option to convert inquiry directly into a booked consultation
```
- **Connectivity Status:** **100% CONNECTED & OPERATIONAL**

---

### 3. Lifecycle 3: Astrologer Verification & Listing Moderation

```
[NEW PRACTITIONER]
  │  1. Completes onboarding at /astrologer/onboarding
  │  2. Uploads credentials, experience, bio, pricing
  ▼
[DATABASE 1]
  │  3. Inserts into astrologer_profiles (status: 'pending')
  ▼
[SUPER ADMIN]
  │  4. Listing appears in /super-admin/listings moderation queue
  │  5. Admin reviews KYC & credentials
  │  6. Actions available:
  │     a) 'Approve' -> status: 'approved', is_verified: true
  │     b) 'Request Changes' -> status: 'changes_requested'
  │     c) 'Reject' -> status: 'rejected'
  ▼
[PUBLIC & CUSTOMER DIRECTORY]
  │  7. If 'approved', astrologer automatically appears on /customer/astrologers
  │  8. Public profile /customer/astrologers/[slug] becomes indexable and bookable
```
- **Connectivity Status:** **100% CONNECTED & OPERATIONAL**

---

### 4. Lifecycle 4: Post-Consultation Reviews & Public Reputation

```
[CUSTOMER]
  │  1. After booking is marked 'completed', review prompt appears
  │  2. Submits star rating & written feedback via submitReview()
  ▼
[DATABASE 1]
  │  3. Inserts into reviews table linked to astrologer_id & booking_id
  │  4. Trigger recalculates astrologer_profiles.average_rating & total_reviews
  ▼
[ASTROLOGER & PUBLIC DIRECTORY]
  │  5. Feedback appears in /astrologer/reviews (astrologer can submit a public reply)
  │  6. Updated rating is displayed on /customer/astrologers and profile slug
```
- **Connectivity Status:** **100% CONNECTED & OPERATIONAL**
