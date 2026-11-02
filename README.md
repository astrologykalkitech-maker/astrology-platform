# JyotishSetu — Enterprise Vedic Astrology & Consultation Platform

[![Next.js](https://img.shields.io/badge/Next.js-16.4.2_App_Router-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.0-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL_%26_RLS-3ECF8E?logo=supabase)](https://supabase.com/)
[![LiveKit](https://img.shields.io/badge/LiveKit-In--House_WebRTC-black?logo=livekit)](https://livekit.io/)
[![Tests](https://img.shields.io/badge/Tests-422%2F422_Passing_(100%25)-brightgreen)](file:///d:/Company%20Projects/Astrology%20website/tests)
[![Build](https://img.shields.io/badge/Build-43_Routes_Production_Ready-success)]()

**JyotishSetu** is an enterprise-grade, multi-tenant Vedic astrology consultation platform built with **Next.js 16 (App Router)**, **TypeScript**, **Tailwind CSS**, **Supabase (PostgreSQL with RLS)**, and **LiveKit WebRTC**. It seamlessly connects seekers with verified Vedic astrologers for real-time live consultations, instant direct messaging, automated Vedic horoscopes, and complete end-to-end booking lifecycles.

---

## 🏛️ Platform Architecture Overview

JyotishSetu operates across a high-availability dual-database split architecture (**DB1 + DB2**) ensuring zero cross-tenant leakage, rigorous security boundaries, and high-performance real-time synchronization:

```
                                  [ JyotishSetu Gateway ]
                                  (Next.js App Router 16)
                                             |
            +--------------------+-----------+-----------+--------------------+
            |                    |                       |                    |
            v                    v                       v                    v
      [Public Portal]    [Customer Portal]      [Astrologer Portal]   [Super Admin / Admin]
     Discovery & Leads  Vedic Tools & Consults  Practice & Seeker CRM Telemetry & Moderation
            |                    |                       |                    |
            +--------------------+-----------+-----------+--------------------+
                                             |
                   +-------------------------+-------------------------+
                   |                                                   |
                   v                                                   v
         [ DB1: Main Application ]                           [ DB2: CRM & Leads ]
      - Supabase Auth & Profiles                          - Leads & Enquiries Pipeline
      - Conversations & Direct Messages                   - Dynamic Lead Assignment
      - Bookings & Video Consultations                    - System Settings & Audit Logs
      - Vedic Astrology Calculations                      - Platform Analytics & Telemetry
```

---

## 🌟 Core Features & Workspaces

### 1. Customer Portal (`/customer/*`)
* **Customer Portal Entry (`/customer`)**: Opens the astrologer directory for signed-in customers.
* **Unified Direct Consultation Chat (`/customer/chat`)**:
  * Real-time peer-to-peer WebSocket messaging (< 50ms delivery).
  * In-app one-to-one voice calls with online-only calling, incoming call controls, mute, speaker, and persisted call status.
  * Bidirectional read status: single check (sent), double grey check (delivered), double gold check (read).
  * Extreme 60 FPS zero-lag typing using isolated memoized composers (`ChatComposer`).
  * Rich messaging: file attachments (images, PDFs up to 10MB), image lightbox, message replies, Vedic emoji reactions (`👍`, `❤️`, `😂`, `😮`, `😢`, `🙏`), pinned message drawer, message search, and report abuse modal.
  * Web Audio API synthesized harmonic chime with user mute controls.
  * Non-disruptive scroll with dynamic floating *"New messages ↓"* indicator.
* **Vedic Astrology Suite**:
  * **Kundli / Birth Chart (`/customer/kundli`)**: Planetary longitudes, Bhavas, Rashis, Nakshatras, and Navamsha calculations.
  * **Kundli Milan / Ashtakoota Compatibility (`/customer/kundli-milan`, `/customer/milan`)**: 36 Guna scoring, Manglik dosha identification, and Vedic relationship harmony synthesis.
  * **Daily Vedic Panchang (`/customer/panchang`)**: Tithi, Vaara, Nakshatra, Yoga, Karana, Rahu Kaal, and auspicious Muhurats.
  * **Daily Vedic Horoscope (`/customer/horoscope`)**: Personalized celestial forecast across 12 zodiac signs.
* **Astrologer Exploration & Direct Booking (`/customer/astrologers`, `/customer/astrologers/[slug]`)**: Verified listings, specializations, language filters, experience ratings, and authenticated direct booking creation.
* **Consultations & In-House Video Calls (`/consultation/[id]`, `/customer/consultation/[id]`)**: Full WebRTC video conference with in-meeting live chat, camera/mic toggle, screen sharing, and synchronized termination.
* **Profile & Notification Hub (`/customer/profile`, `/customer/notifications`, `/customer/billing`)**: Birth data management, billing history, and real-time alerts.

---

### 2. Astrologer Portal (`/astrologer/*`)
* **Celestial Astrologer Dashboard (`/astrologer`)**: Comprehensive overview of upcoming appointments, earnings, customer reviews, and live lead activity.
* **Seeker Consultation Chat (`/astrologer/chat`)**:
  * **Dual-Tab Directory**: Instant toggling between **All Seekers** (registered customer directory with 1-click chat initiation) and **Active Chats** (ongoing conversations with real-time counters).
  * Zero-lag isolated typing and active-view unread badge clamping (eliminating stale badge counters).
  * Integrated file uploads, quote previews, message editing, deletion ("delete for me" / "delete for everyone"), and pin management.
* **Practice & Profile Management (`/astrologer/profile`, `/astrologer/edit-profile`, `/astrologer/availability`)**:
  * Profile photo upload with magic byte inspection.
  * Consultation pricing, bio, Vedic specializations, and languages.
  * Availability schedule configuration across days of the week.
* **Lead Pipeline & CRM (`/astrologer/leads`, `/astrologer/crm`)**: Direct incoming seeker enquiries, qualification status, and seeker contact history.
* **Booking Hub (`/astrologer/bookings`, `/astrologer/bookings/new`)**: Manage scheduled, active, and completed consultation appointments with direct launch into video consultation rooms.
* **Earnings & Review Analytics (`/astrologer/earnings`, `/astrologer/reviews`)**: Financial breakdown, completed payout history, and verified seeker feedback.
* **Notifications & Priority Support (`/astrologer/notifications`, `/astrologer/support`)**: Platform alerts and ticketing with support representatives.

---

### 3. Super Admin Workspace (`/super-admin/*`)
* **Executive Platform Telemetry (`/super-admin`, `/super-admin/analytics`)**: Real-time KPI formulas, active booking counts, gross platform volume, customer acquisition rates, and real-time live chat traffic counters.
* **Listing Moderation Engine (`/super-admin/listings`, `/super-admin/listings/ranking`, `/super-admin/astrologers`)**:
  * 7-stage astrologer listing lifecycle (`draft`, `pending_approval`, `approved`, `rejected`, `suspended`).
  * Mandatory justification modals for listing rejection and suspension.
  * Algorithmic priority score ranking and featured placements.
* **Review Moderation Hub (`/super-admin/reviews`)**: Centralized dashboard to audit, approve, reject, or flag seeker reviews with immutable logging.
* **Customer Directory & Telemetry (`/super-admin/customers`)**: Complete registered seeker repository, consultation history, and profile readiness metrics.
* **Atomic Lead Distribution Engine (`/super-admin/leads`, `/super-admin/leads/distribution`)**:
  * Anti-duplication SHA-256 hash indexing with a 60-second window.
  * Atomic lead assignment, reassignment, and unassignment to approved astrologers.
  * Batch reporting with deterministic per-item results.
* **Consultant Admin RBAC (`/super-admin/consultants`)**: Multi-tenant delegation, role permissions, and anti-demotion protection for the primary owner.
* **Immutable Audit Trail (`/super-admin/audit-logs`, `/super-admin/settings`)**: Tamper-evident logging of administrative actions, platform policy toggles, and direct lead capture routing.

---

### 4. Consultant Admin Workspace (`/admin/*`)
* **Scoped Operational Pipeline (`/admin/leads`, `/admin/listings`, `/admin/profile`)**: Delegated staff access to qualify incoming enquiries, attach private internal notes, and manage astrologer profiles under strict IDOR protection.

---

### 5. Universal AI Vedic Companion
* **22+ Vedic Guidance Scenarios**: Intelligent assistant capable of handling career (10th house), relationship compatibility, and Vedic calculations, while strictly adhering to ethical boundaries (medical referrals, anti-speculative finance boundaries, zero deterministic fatalism).
* **Hinglish Understanding**: Natural conversational comprehension across Hindi, English, and transliterated Hinglish.
* **Dynamic Tool Calling**: Live astrologer matching, profile URL generation, booking workflow guidance, and escalation to human administrators.

---

## ⚡ Real-Time Chat Synchronization Engine

The messaging platform uses a **Triple-Layer Synchronization Architecture** ensuring $< 50\text{ms}$ delivery, zero missed messages, and zero unnecessary re-renders:

```
[Customer Chat Client] <-------------------+-------------------> [Astrologer Chat Client]
        |                                  |                               |
        | Layer 1: WebSocket Broadcast     | Unified Shared Channel        | Layer 1: WebSocket Broadcast
        | (< 50ms Delivery)                | "jyotishsetu-live-            | (< 50ms Delivery)
        |                                  |  consultation-chat"           |
        v                                  v                               v
[Optimistic Rendering] --------> [Server Action API] <-------- [Optimistic Rendering]
                                           |
                                           v
                              [PostgreSQL Database Store]
                               (Authoritative Persistence)
                                           |
                   +-----------------------+-----------------------+
                   |                                               |
                   v                                               v
        [Layer 2: Supabase WAL]                         [Layer 3: Micro-Delta Polling]
        (Logical Replication)                           (3s/4s Reconnect Catch-Up)
```

1. **Layer 1: Peer-to-Peer WebSocket Broadcast (< 50ms)**: Instant delivery of messages, reactions, edits, deletions, typing state, and `conversation_read` receipts over the unified channel `jyotishsetu-live-consultation-chat`.
2. **Layer 2: PostgreSQL Logical Replication (WAL)**: `REPLICA IDENTITY FULL` on `direct_messages` and `conversations` with direct inclusion in `supabase_realtime` publication.
3. **Layer 3: Micro-Delta Polling & Visibility Synchronization**: 3-second delta querying with `document.visibilityState` listener to instantly catch up on missed packets after tab switching or offline periods.
4. **Performance & Message Counter Optimization**:
   * Isolated `<ChatComposer />`: Typing is strictly local and never triggers parent re-renders.
   * Memoized `<ChatMessageItem />`: Individual message items only re-render when their specific reactions, status, or edits change.
   * `<NewMessagesPill />`: Arriving messages while scrolling up do not forcefully yank the scroll container.
   * Zero-clamping active conversation unread counters during live delivery and background resync.

---

## 🛠️ Technology Stack

| Category | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | **Next.js 16.4.2 (App Router)** | Server Components, Server Actions, Dynamic Streaming |
| **Language** | **TypeScript 5** | Strict static type safety across entire codebase |
| **Styling** | **Tailwind CSS 4** | Vedic luxury theme (`midnight`, `gold`, `champagne`, `parchment`) |
| **Database** | **Supabase / PostgreSQL** | Dual DB split, Row Level Security (RLS), Realtime Publications |
| **Realtime** | **Supabase Realtime WebSockets** | Logical replication WAL streaming and WebSocket broadcasts |
| **Video Conferencing** | **LiveKit WebRTC** | In-house video streaming, audio tracks, meeting state management |
| **Icons** | **Lucide React** | Consistent, modern visual design primitives |
| **Validation** | **Zod** | Runtime payload validation for server actions and APIs |
| **Testing** | **Node.js Test Runner + tsx** | Native sub-millisecond automated test execution |

---

## 📂 Complete Project Folder Structure

```
astrology-website/
├── app/                                 # Next.js App Router (43 Dynamic & Static Routes)
│   ├── actions/                         # Type-Safe Server Actions
│   │   ├── admin-reviews.ts             # Super Admin review moderation & audit
│   │   ├── admin-users.ts               # Consultant management & RBAC assignments
│   │   ├── astrologer-booking.ts        # Astrologer booking actions & state transitions
│   │   ├── astrologer-leads.ts          # Direct lead response & status updating
│   │   ├── astrologer-profile.ts        # Bio, pricing, languages & photo mutations
│   │   ├── astrologer-reviews.ts        # Astrologer review queries & public responses
│   │   ├── astrologer-signup.ts         # Multi-step astrologer onboarding & vetting
│   │   ├── customer-bookings.ts         # Booking creation, cancellations & rescheduling
│   │   ├── customer-profile.ts          # Seeker profile, birth details & preferences
│   │   ├── customer-reviews.ts          # Verified consultation review submissions
│   │   ├── direct-chat.ts               # Chat engine: messages, attachments, reactions, pins
│   │   ├── enquiries.ts                 # Central lead intake & deduplicated capture
│   │   ├── notifications.ts             # Real-time alert polling & read status updates
│   │   ├── super-admin-analytics.ts     # Aggregated KPI formulas & gross volume metrics
│   │   ├── super-admin-audit.ts         # Immutable audit logging & filter queries
│   │   ├── super-admin-consultants.ts   # Operational staff delegation & permissions
│   │   ├── super-admin-customers.ts     # Seeker repository queries & consultation history
│   │   ├── super-admin-leads.ts         # Atomic lead distribution & batch assignment
│   │   ├── super-admin-listings.ts      # 7-stage listing moderation & priority ranking
│   │   └── super-admin-settings.ts      # System-wide flags & routing policy controls
│   ├── admin/                           # Consultant Admin Workspace
│   │   ├── leads/                       # Scoped lead pipeline & qualification
│   │   ├── listings/                    # Assigned astrologer profile audits
│   │   ├── profile/                     # Consultant profile & activity stats
│   │   ├── layout.tsx                   # Admin workspace navigation wrapper
│   │   └── page.tsx                     # Consultant dashboard overview
│   ├── api/                             # Edge & Serverless REST Endpoints
│   │   ├── astrologer/create-booking/   # Programmatic booking creation API
│   │   ├── astrologers/                 # Public astrologer search & directory API
│   │   │   └── [slug]/                  # Individual astrologer profile & availability
│   │   ├── auth/signout/                # Secure cookie clearance & session revocation
│   │   ├── cron/reminders/              # Automated consultation reminder triggers
│   │   ├── enquiries/                   # External lead intake & webhook handler
│   │   │   └── history/                 # Customer enquiry submission history
│   │   ├── health/                      # Production uptime & mandatory checks probe
│   │   ├── location/autocomplete/       # Location autocomplete service
│   │   ├── notifications/unread-count/  # Real-time unread alert telemetry
│   │   └── places/                      # IP geolocation & reverse geocoding endpoints
│   ├── astrologer/                      # Astrologer Portal
│   │   ├── (auth)/                      # Astrologer Authentication Flow
│   │   │   ├── forgot-password/         # Password recovery
│   │   │   ├── login/                   # Email/password authentication
│   │   │   └── signup/                  # Multi-step onboarding application
│   │   └── (portal)/                    # Protected Astrologer Workspace
│   │       ├── availability/            # Weekly calendar & consultation slot management
│   │       ├── bookings/                # Appointment calendar, past & upcoming sessions
│   │       │   └── new/                 # Direct booking initiation form
│   │       ├── chat/                    # Real-time consultation chat with seeker directory
│   │       ├── crm/                     # Seeker CRM, history & consultation notes
│   │       ├── customers/[id]/          # Detailed seeker consultation history
│   │       ├── dashboard/               # Celestial overview & performance metrics
│   │       ├── earnings/                # Completed consultation payouts & earnings
│   │       ├── edit-profile/            # Profile photo, pricing & bio customization
│   │       ├── leads/                   # Direct lead pipeline & qualification
│   │       │   └── [id]/                # Lead details & consultation conversion
│   │       ├── notifications/           # System notices & booking alerts
│   │       ├── profile/                 # Public profile preview & verification status
│   │       │   └── edit/                # Quick profile editor
│   │       ├── reviews/                 # Verified customer feedback & responses
│   │       ├── support/                 # Support ticket creation & assistance
│   │       ├── layout.tsx               # Vedic portal layout & astrologer navigation
│   │       ├── loading.tsx              # Skeleton route loading component
│   │       └── page.tsx                 # Default astrologer dashboard route
│   ├── auth/                            # Universal Authentication Handlers
│   │   ├── callback/                    # Supabase OAuth callback & role-aware router
│   │   └── reset-password/              # Password recovery confirmation handler
│   ├── consultation/                    # In-House WebRTC LiveKit Video Rooms
│   │   └── [id]/                        # Synchronized video consultation room
│   ├── customer/                        # Seeker / Customer Portal
│   │   ├── (auth)/                      # Customer Authentication Flow
│   │   │   ├── forgot-password/         # Password recovery
│   │   │   ├── login/                   # Email/password & Google OAuth login
│   │   │   └── signup/                  # Seeker registration with birth data capture
│   │   └── (portal)/                    # Protected Seeker Workspace
│   │       ├── astrologers/             # Verified astrologer directory & exploration
│   │       │   └── [slug]/              # Public profile & consultation slot booking
│   │       ├── billing/                 # Transaction history & receipts
│   │       ├── bookings/                # Consultation appointment tracker
│   │       ├── chat/                    # Direct astrologer consultation chat
│   │       ├── consultation/[id]/       # Seeker-facing video conference view
│   │       ├── dashboard/               # Customer dashboard, alerts & quick launchers
│   │       ├── enquiries/               # General platform enquiries
│   │       │   ├── new/                 # Submit new enquiry
│   │       │   └── [id]/                # Enquiry status & astrologer responses
│   │       ├── horoscope/               # Daily, weekly & monthly Vedic forecasts
│   │       ├── kundli/                  # Complete birth chart & divisional charts
│   │       ├── kundli-milan/            # Ashtakoota 36 Guna relationship compatibility
│   │       ├── milan/                   # Compatibility alias & quick matcher
│   │       ├── notification/            # Individual notification view
│   │       ├── notifications/           # Real-time alert notifications inbox
│   │       ├── offers/                  # Promotional consultation credits & discounts
│   │       ├── panchang/                # Five limbs of Vedic time & daily Muhurats
│   │       ├── profile/                 # Seeker birth details, coordinates & account
│   │       ├── support/                 # Seeker support ticketing & issue reporting
│   │       ├── layout.tsx               # Customer navigation layout & Vedic topbar
│   │       └── page.tsx                 # Default customer portal dashboard
│   ├── dev/auth-test/                   # Development authentication diagnostic harness
│   ├── super-admin/                     # Owner Super Admin Workspace
│   │   ├── analytics/                   # Deep platform metrics, conversion & financials
│   │   ├── astrologers/                 # Complete astrologer directory moderation
│   │   ├── audit-logs/                  # Tamper-evident immutable operational logs
│   │   ├── bookings/                    # Global booking inspection & override controls
│   │   ├── consultants/                 # Consultant staff lifecycle & RBAC grants
│   │   ├── customers/                   # Registered seeker records & consultation logs
│   │   ├── leads/                       # Central enquiry capture & lead distributor
│   │   │   └── distribution/            # Algorithmic & manual lead routing engine
│   │   ├── listings/                    # 7-stage listing review, approval & suspension
│   │   │   └── ranking/                 # Priority scoring & featured promotion manager
│   │   ├── reviews/                     # Platform review moderation & dispute handling
│   │   ├── settings/                    # Platform switches, lead rules & configuration
│   │   ├── support/                     # Escalated support ticket moderation
│   │   ├── layout.tsx                   # Super admin navigation & security controls
│   │   └── page.tsx                     # Executive KPI dashboard & live chat telemetry
│   ├── layout.tsx                       # Root HTML & Tailwind CSS theme provider
│   └── page.tsx                         # Public landing page with hero & astrologers
│
├── components/                          # Reusable UI & Presentation Layer
│   ├── admin/                           # Administrative UI Primitives
│   │   ├── AdminHeader.tsx              # Top navigation bar with user profile & signout
│   │   ├── AdminSidebar.tsx             # Collapsible navigation menu for admin workspaces
│   │   └── MetricCard.tsx               # Analytics KPI display cards with variance
│   ├── astrologer/                      # Astrologer Portal Components
│   │   ├── art/                         # Vedic cultural graphics, SVGs & ornaments
│   │   ├── auth/                        # Astrologer login, signup & onboarding forms
│   │   ├── availability/                # Weekly schedule builder & slot toggler
│   │   ├── bookings/                    # Booking cards, status badges & action triggers
│   │   ├── chat/                        # AstrologerChatClient with dual-tab directory
│   │   ├── crm/                         # Seeker relationship cards & consultation history
│   │   ├── leads/                       # Lead pipeline cards, conversion modals & filters
│   │   ├── profile/                     # Profile photo uploader, bio & fee forms
│   │   ├── ui/                          # Button, Input, Modal, Badge & Toast primitives
│   │   └── AstrologerSidebar.tsx        # Astrologer dashboard navigation bar
│   ├── auth/                            # Shared Authentication Modals & Guards
│   ├── chat/                            # High-Performance Chat Subcomponents
│   │   ├── ChatComposer.tsx             # Memoized isolated text composer (60 FPS typing)
│   │   ├── ChatMessageItem.tsx          # Memoized message bubble with reactions & status
│   │   └── NewMessagesPill.tsx          # Floating indicator when scrolled up
│   ├── common/                          # Universal UI Elements
│   │   ├── EmptyState.tsx               # Fallback displays for empty lists & search
│   │   ├── ErrorBoundary.tsx            # React runtime error boundary
│   │   ├── LoadingSpinner.tsx           # Vedic celestial spinner
│   │   └── Modal.tsx                    # Accessible dialog modal primitive
│   ├── consultation/                    # In-House Video Conferencing UI
│   │   ├── ConferenceRoom.tsx           # Full WebRTC video conference view
│   │   ├── MediaControls.tsx            # Camera, microphone & screen share toggles
│   │   ├── InCallChat.tsx               # Real-time text messaging inside video calls
│   │   └── ParticipantTile.tsx          # Video stream rendering with audio indicator
│   ├── customer/                        # Customer Portal Components
│   │   ├── chat/                        # CustomerChatClient with real-time sync
│   │   ├── CustomerHeader.tsx           # Customer top navigation bar
│   │   └── CustomerSidebar.tsx          # Customer portal sidebar navigation
│   ├── livekit/                         # LiveKit Connection Providers & Audio Tracks
│   ├── profile/                         # Shared Profile Picture Modal & Avatar Previews
│   └── public/                          # Public Marketing Presentation
│       ├── AstrologerCard.tsx           # Searchable public astrologer preview card
│       ├── HeroSection.tsx              # Landing page hero banner & CTA
│       ├── PublicFooter.tsx             # Standard platform footer & legal links
│       └── PublicNavbar.tsx             # Public topbar with portal navigation & auth
│
├── lib/                                 # Domain Logic & Core Infrastructure
│   ├── admin/                           # Administrative Domain Services
│   │   └── audit.ts                     # Immutable audit log dispatchers
│   ├── ai/                              # Universal AI Vedic Companion
│   │   ├── companion.ts                 # Multi-turn conversation orchestrator
│   │   ├── live-tools.ts                # Real-time tool definitions & matching engine
│   │   ├── prompts.ts                   # Vedic persona, ethical boundaries & system rules
│   │   └── intent-detector.ts           # Career, compatibility, and Muhurat intent extraction
│   ├── astrologer/                      # Astrologer Business Logic
│   │   ├── formatters.ts                # Currency, experience & language formatters
│   │   ├── guard.ts                     # Astrologer server-side route guards
│   │   ├── queries.ts                   # Astrologer database fetching procedures
│   │   └── scoring.ts                   # Priority ranking formula & profile completeness
│   ├── astrology/                       # Astronomical & Vedic Calculation Engine
│   │   ├── ayanamsa.ts                  # Lahiri Ayanamsa calculation
│   │   ├── ephemeris.ts                 # Planetary positions & Rahu/Ketu opposition
│   │   ├── kundli.ts                    # Rashi, Nakshatra, Bhavas & Navamsha (D9)
│   │   ├── milan.ts                     # Ashtakoota 36 Guna scoring & Dosha detection
│   │   ├── panchang.ts                  # Tithi, Vaara, Nakshatra, Yoga, Karana
│   │   └── divisional-charts.ts         # D10 Dashamsa professional analysis
│   ├── auth/                            # Authentication & Access Control
│   │   ├── admin-guard.ts               # Super Admin & Consultant permission enforcers
│   │   ├── rbac.ts                      # Role-permission definitions & hierarchy
│   │   └── session.ts                   # Next.js cookie session management & proxy
│   ├── availability/                    # Consultation Slot Math & Availability Logic
│   ├── chat/                            # High-Performance Chat Utilities
│   │   ├── audio-notification.ts        # Synthesized Web Audio chime & mute state
│   │   └── meta.ts                      # Idempotency, attachment & reply payload codecs
│   ├── consultation/                    # WebRTC LiveKit Server Helpers
│   │   └── token.ts                     # Secure JWT token generator for consultation rooms
│   ├── location/                        # Geocoding & Coordinates Lookup
│   ├── security/                        # Application Security Helpers
│   │   ├── rate-limit.ts                # In-memory and distributed request throttle
│   │   └── safe-redirect.ts             # Open-redirect defense for auth callbacks
│   ├── supabase/                        # Database Connection Clients
│   │   ├── admin.ts                     # Fail-closed Service Role admin client (DB1 & DB2)
│   │   ├── client.ts                    # Browser-side Supabase client with WebSockets
│   │   ├── proxy.ts                     # Next.js middleware session refresh handler
│   │   └── server.ts                    # Server Component & Server Action scoped client
│   ├── types/                           # Unified TypeScript Schemas
│   │   ├── database.ts                  # Supabase database table definitions
│   │   └── domain.ts                    # Business entities (Bookings, Leads, Reviews)
│   └── validations/                     # Zod Payload Schemas
│       ├── auth.ts                      # Login, signup & password reset schemas
│       ├── booking.ts                   # Consultation appointment request schemas
│       ├── chat.ts                      # Direct message & attachment validation
│       └── lead.ts                      # Enquiry submission & assignment schemas
│
├── public/                              # Static Production Assets
│   ├── images/                          # Vedic illustrations, backgrounds & celestial art
│   ├── favicon.ico                      # Platform icon
│   └── robots.txt                       # Search engine crawler policies
│
├── supabase/                            # Database DDL & Version Control
│   ├── CONSOLIDATED_SETUP.sql           # Unified base schema (Migrations 001–019)
│   └── migrations/                      # Sequential PostgreSQL Migrations (001 to 029)
│       ├── 001_initial_schema.sql       # User profiles, auth roles & base tables
│       ├── 005_admin_permissions.sql    # RBAC permissions & audit tables
│       ├── 007_lead_deduplication.sql   # SHA-256 60s anti-duplication hash index
│       ├── 008_atomic_assignment.sql    # Atomic stored procedure for lead routing
│       ├── 012_realtime_discovery.sql   # Astrologer presence & visibility triggers
│       ├── 013_customer_bookings.sql    # Booking schedules & status state machine
│       ├── 014_direct_messaging.sql     # Initial direct chat tables & read receipts
│       ├── 015_customer_reviews.sql     # Verified consultation review system
│       ├── 017_realtime_publications.sql# Real-time WAL publication setup
│       ├── 024_video_conferencing.sql   # In-house LiveKit consultation records
│       └── 029_chat_complete.sql        # Full chat suite: edits, reactions, pins, abuse
│
├── tests/                               # Comprehensive Automated Test Suites (422 Tests)
│   ├── complete-chat-system.test.ts     # Live chat peer delivery, clamping & reactions
│   ├── live-chat-seeker-directory.test.ts# Astrologer seeker discovery & directory
│   ├── route-auth-activation.test.ts    # 43 application routes, 404 & redirect tests
│   ├── dashboard-feature-integration.test.ts # Cross-dashboard synchronization tests
│   ├── universal-customer-ai.test.ts    # AI Vedic companion multi-turn scenarios
│   ├── vedic-astrology.test.ts          # Ephemeris, Kundli, Milan & Panchang math
│   ├── super-admin-analytics.test.ts    # KPI formula aggregation & telemetry tests
│   ├── super-admin-guards.test.ts       # RBAC permission hierarchy & owner safety
│   ├── platform-security.test.ts        # IDOR, SQL injection & CSRF defense tests
│   └── booking-lifecycle.test.ts        # Scheduling, reminder & termination tests
│
├── FINAL_ENGINEERING_REPORTS/           # Comprehensive Architecture & Audit Reports
│   ├── 01_ASTROLOGER_DASHBOARD.md       # Astrologer portal stabilization report
│   ├── 02_CUSTOMER_DASHBOARD.md         # Customer portal audit & integration report
│   ├── 03_SUPER_ADMIN_DASHBOARD.md      # Super admin telemetry & governance audit
│   ├── 04_LIVE_CHAT_REBUILD.md          # Triple-layer real-time messaging audit
│   └── 20_COMPLETE_CHAT_SYSTEM_REBUILD.md # Complete chat performance benchmarks
│
├── .env.example                         # Environment variable template
├── middleware.ts                        # Next.js edge route proxy & session refresher
├── next.config.ts                       # Next.js 16 configuration with webpack & optimization
├── package.json                         # Dependencies, scripts & build configuration
├── postcss.config.mjs                   # Tailwind CSS PostCSS plugin config
├── tailwind.config.ts                   # Vedic color palette & typography configuration
└── tsconfig.json                        # Strict TypeScript compiler options
```

---

## 🚀 Getting Started

### 1. Prerequisites
* **Node.js**: `v20.x` or `v22.x` (tested on Node v24.4.1 / v22.14.0)
* **npm**: `v10.x` or higher
* **Supabase Project**: Dual-database setup (or single instance configured for DB1/DB2)
* **LiveKit Server**: Self-hosted or LiveKit Cloud credentials (for video consultations)

### 2. Installation
```bash
npm install
```

### 3. Environment Variables Configuration
Copy `.env.example` to `.env.local` and provide your credentials:
```bash
cp .env.example .env.local
```

Required environment variables:
```env
# Base Configuration
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# DB1: Main Application Database (Supabase)
NEXT_PUBLIC_SUPABASE_URL=https://your-main-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-main-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-main-service-role-key
DB1_SUPABASE_URL=https://your-main-project.supabase.co
DB1_SUPABASE_SERVICE_ROLE_KEY=your-main-service-role-key

# DB2: CRM & Leads Database (Supabase)
DB2_SUPABASE_URL=https://your-crm-project.supabase.co
DB2_SUPABASE_SERVICE_ROLE_KEY=your-crm-service-role-key

# LiveKit In-House Audio and Video
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
NEXT_PUBLIC_LIVEKIT_URL=wss://your-livekit-instance.livekit.cloud
```

### 4. Database Setup
Apply `supabase/migrations/030_direct_voice_calls.sql` to the DB1/main Supabase project before enabling chat voice calls. It creates the persisted call records, participant-only read access, concurrency protection, and Realtime publication. The browser also needs microphone permission, and the LiveKit URL and server credentials above must be configured.

### 5. Running the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

### 6. Running in Production Mode
```bash
npm run build
npm start
```

---

## 🧪 Testing & Quality Verification

JyotishSetu maintains a comprehensive test suite covering security policies, role authorization, RLS enforcement, Vedic calculations, and real-time chat integrity:

```bash
# Run all 422 automated unit and regression tests
npm test -- --run

# Run TypeScript static analysis
npm run typecheck

# Run production build validation
npm run build
```

### Test Suite Coverage Breakdown

```
✔ Vedic Astronomy & Divisional Charts (Lahiri Ayanamsa, D10 Dashamsa, Gochar Transits)
✔ Vedic Compatibility & Panchang (Ashtakoota 36 Guna Milan, Five Limbs of Time)
✔ Authentication & RBAC Isolation (Owner, Super Admin, Consultant, Astrologer, Seeker)
✔ Google OAuth Session Retention & Safe Redirects
✔ Central Lead Capture & 60-Second Anti-Duplication Hashing
✔ Atomic Lead Assignment, Reassignment & Batch Reporting
✔ Super Admin Telemetry, Listing Moderation & Immutable Audit Logging
✔ Real-Time Chat Synchronization, Presence, Voice-Call Lifecycle & Zero Unread Clamping
✔ In-House Video Conferencing Termination & Booking Persistence
✔ Universal AI Companion Multi-Turn Ethical Boundaries & Tool Invocations

ℹ tests 422
ℹ suites 0
ℹ pass 422
ℹ fail 0
```

---

## 🔒 Security Architecture & Guarantees

1. **Fail-Closed Admin Client**: Privileged database clients halt immediately if service credentials are missing or misconfigured.
2. **Immutable Audit Trail**: Key platform actions (lead reassignments, consultant creations, listing suspensions) write permanent audit log entries that cannot be updated or deleted via direct queries.
3. **Anti-IDOR Protection**: Consultations, direct messages, leads, and customer profiles enforce explicit ownership checks at both the database RLS layer and the server action layer.
4. **Safe Redirect Defense**: All post-authentication redirects pass through [`lib/security/safe-redirect.ts`](file:///d:/Company%20Projects/Astrology%20website/lib/security/safe-redirect.ts) to prevent open-redirect vulnerabilities.
5. **No Client Secret Exposure**: All service role keys and LiveKit API secrets are strictly isolated to server components and server actions.

---

## 📄 License & Attribution

Copyright © 2026 JyotishSetu. All rights reserved. Built for secure, authentic, and real-time Vedic astrology consultations.
