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
├── supabase/migrations/                 # Additive PostgreSQL Migrations (001 to 008)
├── tests/                               # Node.js native test runner test suites
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
Create a `.env.local` file in the root directory:
```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" # Required for server actions

# Transactional Mail (Optional in Dev, Required for Production Consultant Invites)
SMTP_HOST="smtp.example.com"
SMTP_PORT=587
SMTP_USER="smtp-username"
SMTP_PASS="smtp-password"
```

### 4. Running the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to access the landing page and portals.

---

## Testing & Quality Assurance

Run the automated test suite (33 unit & integration tests):
```bash
npm test
```

Run static analysis and linter:
```bash
npm run lint
npx tsc --noEmit
```

Build for production:
```bash
npm run build
```

---

## Database Migrations

Apply database migrations to Supabase in numerical order:
```bash
npx supabase db push
```
Migrations `001` through `008` establish:
- User roles, astrologer profiles, and profile security (`001`–`004`)
- Admin permissions, audit logs, and system settings (`005`)
- Super Admin role isolation and anti-tamper triggers (`006`)
- 60s deduplication hash index and central lead capture (`007`)
- Atomic lead assignment procedure (`008`)
