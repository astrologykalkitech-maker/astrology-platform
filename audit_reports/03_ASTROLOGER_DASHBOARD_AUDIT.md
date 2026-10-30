# JYOTISHSETU — MASTER TECHNICAL AUDIT REPORT
## 03: Astrologer Dashboard & Practitioner Workflow Audit

**Audit Target:** `/astrologer/*` routes and practitioner consultation infrastructure  
**Scope:** 21 App Router pages, 37 practitioner components, 8 server actions, and consultation host controls.

---

### 1. Astrologer Feature Inventory & Route Mapping

| Feature Name | Route / Path | Primary Component | Backend Action / API | Database Target & Table | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Practitioner Onboarding** | `/astrologer/onboarding` | `AstrologerOnboardingForm.tsx` | `submitAstrologerOnboarding()`| DB1: `astrologer_profiles` | **Operational** |
| **Astrologer Overview** | `/astrologer/dashboard` | `DashboardOverviewClient.tsx` | `getAstrologerDashboardData()` | DB1: `customer_bookings`, `leads` | **Operational** |
| **Availability Scheduler** | `/astrologer/availability` | `AvailabilityManager.tsx` | `updateAstrologerAvailability()`| DB1: `astrologer_profiles` | **Operational** |
| **Leads Desk** | `/astrologer/leads` | `AstrologerLeadsClient.tsx` | `getAstrologerLeads()` | DB1: `leads` | **Operational** |
| **Lead Detail & Quoting** | `/astrologer/leads/[id]` | `LeadDetailView.tsx` | `submitLeadQuote()` | DB1: `leads`, `lead_responses` | **Operational** |
| **Bookings Manager** | `/astrologer/bookings` | `AstrologerBookingsClient.tsx` | `getAstrologerBookings()` | DB1: `customer_bookings` | **Operational** |
| **Meeting Host Room** | `/consultation/[id]` | `ConsultationRoomClient.tsx` | `/api/consultations/livekit-token`| DB1: `consultation_meetings`, LiveKit WebRTC | **Operational** |
| **Lobby Admission Control**| `/consultation/[id]` | `WaitingRoomManager.tsx` | `admitParticipant()`, `dismiss()`| DB1: `consultation_waiting_room` | **Operational** |
| **Live Audio Transcription**| `/consultation/[id]` | `SpeechTranscriptionClient.tsx` | Web Speech Recognition API | Client-side memory & transcript download | **Operational** |
| **Post-Session AI Summary**| `/consultation/[id]` | `SessionSummaryModal.tsx` | `generateConsultationSummary()`| DB1: `consultation_summaries`, OpenAI API| **Operational** |
| **Customer CRM & Notes** | `/astrologer/customers/[id]`| `CustomerDetailCRM.tsx` | `saveAstrologerCustomerNote()` | DB1: `astrologer_customer_notes` | **Operational** |
| **Direct Customer Chat** | `/astrologer/chat` | `AstrologerChatClient.tsx` | `sendDirectMessage()`, Realtime | DB1: `conversations`, `direct_messages` | **Operational** |
| **Earnings & Payouts** | `/astrologer/earnings` | `EarningsAnalyticsClient.tsx` | `getAstrologerEarnings()` | DB1: `customer_bookings` | **Operational** |
| **Reviews & Feedback** | `/astrologer/reviews` | `ReviewsManagementClient.tsx` | `getAstrologerReviews()` | DB1: `reviews` | **Operational** |
| **Profile & Pricing Setup**| `/astrologer/profile` | `AstrologerProfileEditor.tsx` | `updateAstrologerProfile()` | DB1: `astrologer_profiles`, `profiles` | **Operational** |

---

### 2. Practitioner Deep Dive Workflows

#### A. In-House Consultation Host Controls
- **File Reference:** `components/consultation/ConsultationRoomClient.tsx`
- The astrologer has elevated privileges inside the LiveKit consultation room:
  - **Participant Management:** Mute attendee audio, disable attendee camera, kick/disconnect disruptive participants.
  - **Waiting Room Lobby:** View waiting clients in real time via Supabase Realtime channel `waiting_room_{meeting_id}`. Can click "Admit" to grant entry or "Dismiss" to reject.
  - **Live Web Speech Transcription:** Utilizes the browser's native SpeechRecognition API to transcribe consultation dialogue in real time. Can export the full transcript as a formatted text file.
  - **Post-Meeting AI Summary:** When the astrologer clicks "End Consultation", the application automatically sends the session transcript or practitioner notes to `app/actions/consultation-actions.ts`, producing a structured astrological summary (Core Concerns, Astrological Remedies, Recommended Gemstones, Follow-up Advice) persisted in DB1 `consultation_summaries`.

#### B. Availability Slot Scheduler
- **File Reference:** `app/astrologer/(portal)/availability/page.tsx`
- Allows the astrologer to set weekly recurring time windows (e.g., Mon–Fri 09:00–17:00, Sat 10:00–14:00), slot duration (15m, 30m, 60m), and buffer times.
- State is serialized into JSONB in `astrologer_profiles.availability_slots`, which directly powers the customer booking picker.

#### C. Leads CRM & Direct Quotes
- **File Reference:** `app/astrologer/(portal)/leads/page.tsx`
- Astrologers receive two categories of leads:
  1. **Direct Leads:** Enquiries submitted directly to this specific astrologer by a customer.
  2. **Platform Leads:** Central leads assigned by Super Admin.
- Astrologers can accept/decline leads, propose consultation fees, and transition lead status from `assigned` -> `contacted` -> `closed`.
