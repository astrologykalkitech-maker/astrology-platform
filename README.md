# JyotishSetu — Astrologer & Consultation Platform

**JyotishSetu** is a multi-tenant astrology platform connecting seekers with vetted Vedic astrologers. Built with **Next.js 16 (App Router)**, **TypeScript**, **Tailwind CSS**, and **Supabase (PostgreSQL & RLS)**, the platform features four primary user portals:
1. **Public Discovery & Lead Capture** — Astrologer directory, ranking engine, and deduplicated enquiry forms.
2. **Customer Portal** (`/customer/*`) — Consultations, booking tracking, offers, and notifications.
3. **Astrologer Self-Service** (`/astrologer/*`) — Profile management, celestial dashboard, 7-state listing lifecycle, and direct lead management.
4. **Administrative Workspaces**:
   - **Consultant Admin** (`/admin/*`) — Scoped lead pipeline, qualification, and internal notes.
   - **Owner Super Admin** (`/super-admin/*`) — Platform analytics, listing moderation, ranking priority, atomic lead distribution, consultant access controls, and immutable audit logging.

---

## Architecture & Directory Structure

```
astrologer-platform/
├── app/                                 # Next.js App Router
│   ├── actions/                         # Server Actions (Auth, Leads, Listings, Analytics)
│   ├── admin/                           # Consultant Admin Portal
│   ├── api/                             # REST Endpoints (/api/astrologers, /api/enquiries)
│   ├── astrologer/                      # Astrologer Portal (Auth & Management)
│   ├── customer/                        # Customer Portal (Bookings, Offers, Enquiries)
│   ├── dev/                             # Development Auth Harness (Disabled in prod)
│   └── super-admin/                     # Owner Super Admin Workspace
├── components/                          # React Presentation Layer
│   ├── admin/                           # Admin Headers, Sidebars, Modals & Badges
│   └── astrologer/                      # Astrologer UI primitives, forms & art
├── lib/                                 # Domain Logic & Infrastructure
│   ├── admin/                           # Immutable audit log helpers
│   ├── astrologer/                      # Formatters, queries, guards, scoring
│   ├── auth/                            # RBAC matrix, admin guards, session cookies
│   ├── supabase/                        # Browser, Server, and Fail-Closed Admin clients
│   ├── types/                           # TypeScript & Supabase database schemas
│   └── validations/                     # Zod runtime schemas
├── supabase/
│   ├── CONSOLIDATED_SETUP.sql           # Complete unified schema (Migrations 001–016)
│   └── migrations/                      # Sequential PostgreSQL Migrations (001 to 016)
├── tests/                               # Node.js native test runner test suites (91 tests)
└── docs/audits/                         # Comprehensive engineering audit reports
```

---

## Getting Started

### 1. Prerequisites
- **Node.js**: v20+ (tested on Node v22.14.0)
- **Package Manager**: npm v10+

### 2. Installation
```bash
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env.local` and configure your credentials:
```bash
cp .env.example .env.local
```

### 4. Running the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to access the landing page and portals.

---

## Testing & Quality Assurance

Run the automated test suite (91 unit, security & regression tests):
```bash
npm test
```

Run static analysis, linter, and typecheck:
```bash
npm run lint
npm run typecheck
```

Build for production:
```bash
npm run build
```

Run the complete CI verification pipeline:
```bash
npm run ci
```

---

## Database Provisioning & Migrations

### Option A: Fresh Database Installation (Recommended)
Execute [`supabase/CONSOLIDATED_SETUP.sql`](supabase/CONSOLIDATED_SETUP.sql) directly in your Supabase project's **SQL Editor**. This sets up the entire platform schema in a single execution.

### Option B: Incremental Migrations
Apply migrations sequentially using the Supabase CLI:
```bash
npx supabase db push
```

The migration sequence (`001` through `016`) establishes:
- User roles, astrologer profiles, and profile security (`001`–`004`)
- Admin permissions, audit logs, and system settings (`005`)
- Super Admin role isolation and anti-tamper triggers (`006`)
- 60s deduplication hash index and central lead capture (`007`)
- Atomic lead assignment procedure (`008`)
- Security and RLS hardening (`009`)
- Lead lifecycle and assignment synchronization (`010`)
- Trigger type-casting defense (`011`)
- Realtime astrologer discovery and visibility (`012`)
- Customer bookings and persistent notifications (`013`)
- Direct consultation messaging and predictions (`014`)
- Customer profile expansion and consultation reviews (`015`)
- Booking integrity hardening, authoritative pricing, and cancellation guard (`016`)
