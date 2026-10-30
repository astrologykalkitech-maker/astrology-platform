# JYOTISHSETU — MASTER TECHNICAL AUDIT REPORT
## 02: Customer Dashboard & Public Client Lifecycle Audit

**Audit Target:** `/customer/*` routes and related customer interactions  
**Scope:** 19 App Router pages, 8 dedicated customer components, 7 server actions, client state, and end-to-end user workflows.

---

### 1. Customer Feature Inventory & Route Mapping

| Feature Name | Route / Path | Primary Client Component | Backend Action / API | Database Target & Table | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Customer Portal Entry** | `/customer` | `app/customer/(portal)/page.tsx` | Server-side redirect | N/A (Redirects to `/customer/astrologers`) | **Operational** |
| **Astrologer Directory** | `/customer/astrologers` | `AstrologersDirectoryClient.tsx` | `getAstrologers()` | DB1: `astrologer_profiles`, `profiles` | **Operational** |
| **Geolocation Discovery** | `/customer/astrologers` | `AstrologersDirectoryClient.tsx` | `/api/places/reverse-geocode` | External Nominatim OpenStreetMap API | **Operational** |
| **Astrologer Public Bio** | `/customer/astrologers/[slug]`| `AstrologerProfileClient.tsx` | `getAstrologerBySlug()` | DB1: `astrologer_profiles`, `reviews` | **Operational** |
| **Consultation Booking** | `/customer/astrologers/[slug]`| `BookingModal.tsx` / SlotPicker | `createCustomerBooking()` | DB1: `customer_bookings`, `consultation_meetings`| **Operational** |
| **Bookings Dashboard** | `/customer/bookings` | `CustomerBookingsClient.tsx` | `getCustomerBookings()`, Realtime | DB1: `customer_bookings` | **Operational** |
| **Booking Cancellation** | `/customer/bookings` | `CustomerBookingsClient.tsx` | `cancelBooking()` | DB1: `customer_bookings` | **Operational** |
| **In-House Video Call** | `/consultation/[id]` | `ConsultationRoomClient.tsx` | `/api/consultations/livekit-token`| DB1: `consultation_meetings`, LiveKit WebRTC | **Operational** |
| **Waiting Room Lobby** | `/consultation/[id]` | `ConsultationRoomClient.tsx` | `joinWaitingRoom()`, Realtime | DB1: `consultation_waiting_room` | **Operational** |
| **Lead / Enquiry Desk** | `/customer/enquiries` | `CustomerEnquiriesClient.tsx` | `getCustomerLeads()` | DB1: `leads` | **Operational** |
| **Submit New Enquiry** | `/customer/enquiries/new` | `NewEnquiryForm.tsx` | `createLead()` | DB1: `leads` | **Operational** |
| **Enquiry Detail Thread**| `/customer/enquiries/[id]` | `EnquiryDetailClient.tsx` | `getLeadById()` | DB1: `leads`, `lead_responses` | **Operational** |
| **Kundli Calculator** | `/customer/kundli` | `KundliClient.tsx` | `calculateKundliAction()` | In-House Vedic Math Engine (`lib/astrology`) | **Operational** |
| **Daily Horoscope** | `/customer/horoscope` | `HoroscopeClient.tsx` | `getDailyHoroscope()` | Static Planetary Ephemeris / Algorithm | **Operational** |
| **Daily Panchang** | `/customer/panchang` | `PanchangClient.tsx` | `calculatePanchangAction()` | In-House Panchang Engine | **Operational** |
| **Kundli Milan (Matching)**| `/customer/matchmaking` | `MatchmakingClient.tsx` | `calculateAshtakootaAction()`| In-House 36 Guna Milan Engine | **Operational** |
| **Customer Profile** | `/customer/profile` | `CustomerProfileForm.tsx` | `updateCustomerProfile()` | DB1: `profiles` | **Operational** |
| **Billing & Receipts** | `/customer/billing` | `CustomerBillingClient.tsx` | `getCustomerBillingHistory()` | DB1: `customer_bookings` | **Operational** |
| **Offers & Discounts** | `/customer/offers` | `OffersClient.tsx` | Client-side promotional banner | Static Platform Promotions | **Operational** |
| **Customer Support** | `/customer/support` | `CustomerSupportClient.tsx` | `submitSupportTicket()`, AI bot | DB1: `support_tickets` / Local AI fallback | **Operational** |

---

### 2. Deep Dive: Key Customer Workflows

#### A. Astrologer Discovery & Geolocation Filtering
- **Route:** `/customer/astrologers`
- **Mechanisms:**
  - Automatically requests browser coordinates (with fallback to default coordinates).
  - Invokes internal proxy `/api/places/reverse-geocode` to avoid exposing third-party API keys and bypass CORS.
  - Filters astrologers by specialization (`Vedic`, `Numerology`, `Vastu`, `Tarot`, `Palmistry`), language, and sort order (Fee: Low-to-High, High-to-Low, Experience, Rating).
  - Clean client-side debouncing ensures rapid responsive filtering without UI stutter.

#### B. Booking Creation & Muhurat Slot Selection
- **Route:** `/customer/astrologers/[slug]` -> `BookingModal.tsx`
- **Mechanisms:**
  - Renders astrologer's active time slots dynamically.
  - Disallows selection of past dates or slots already booked in `customer_bookings`.
  - Dispatches `createCustomerBooking()` server action which:
    1. Validates authenticated customer session.
    2. Inserts a row in DB1 `customer_bookings` with status `confirmed`.
    3. Concurrently provisions a record in `consultation_meetings` with a dedicated meeting UUID.
    4. Automatically binds the customer's birth chart details if pre-configured.

#### C. Video Consultation & Muhurat Window Lock
- **Route:** `/consultation/[id]`
- **Mechanisms:**
  - Both Customer and Astrologer access the same unified in-house LiveKit meeting room.
  - Implements **Muhurat Time-Lock Protection**:
    - Users cannot enter the live room more than 15 minutes before the scheduled time slot.
    - If accessed early, the client renders a sleek astrological countdown timer indicating the exact opening time.
  - When the window opens, the customer enters the **Waiting Room Lobby** (`consultation_waiting_room`).
  - Once admitted by the astrologer, full bidirectional WebRTC media streaming activates with mute/camera controls, in-call messaging, and live audio transcription.

#### D. Complete Vedic Astrology Toolset
- **Kundli (`/customer/kundli`):** Computes planetary longitudes, Ascendant (Lagna), Navamsha (D9) chart, and Vimshottari Dasha periods using high-precision astronomical algorithms in `lib/astrology/astronomy.ts`.
- **Matchmaking (`/customer/matchmaking`):** Evaluates all 8 Kootas (Varna, Vashya, Tara, Yoni, Graha Maitri, Gana, Bhakoot, Nadi) out of 36 maximum points with Manglik Dosha analysis.
- **Panchang (`/customer/panchang`):** Generates sunrise/sunset, Tithi, Nakshatra, Yoga, Karana, and Rahu Kaal periods for any specified geographical coordinate.
