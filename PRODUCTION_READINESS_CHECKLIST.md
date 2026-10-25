# JyotishSetu — Production Readiness Checklist & Deployment Guide

## 1. Release Status Decision
**STATUS**: **READY WITH DOCUMENTED LIMITATIONS**
- **Core Platform**: Complete, verified, and audited across Customer, Astrologer, and Super Admin portals.
- **Limitation**: Real financial transactions and payment processing are intentionally deferred. Payment gateways are disconnected and all booking records track financial states in a pending, zero-liability ledger.

---

## 2. Readiness Evaluation by Area

| Area | Status | Evidence & Notes |
|---|---|---|
| **Frontend Code Quality** | Pass | Turbopack compilation successful; zero TypeScript errors; zero broken links. |
| **Authentication & RBAC** | Pass | Dual-Supabase auth model; server-side session checks; self-role assignment blocked. |
| **Data Isolation & RLS** | Pass | Customers and astrologers strictly isolated; RLS policies active on DB1 and DB2. |
| **Listing Moderation** | Pass | Rejected, suspended, or unapproved astrologers automatically excluded from search and booking. |
| **Responsiveness** | Pass | Mobile drawers, card views, fluid grids, and touch targets verified for 320px–1920px. |
| **Accessibility** | Pass | WCAG 2.2 AA compliant focus rings, ARIA dialogs, labels, and 4.5:1 color contrast. |
| **Security Headers** | Pass | `next.config.ts` configured with HSTS, X-Frame-Options DENY, nosniff, and CSP. |
| **Automated Tests** | Pass | 80/80 tests passing in CI/CD pipeline. |
| **Payment Gateway** | Deferred | Explicitly deferred per product requirements; simulated payments prohibited. |

---

## 3. Environment Variables & Production Secrets

The following environment variables are required for production operations:

### Database 1 (Platform - Customers & Astrologers)
- `NEXT_PUBLIC_SUPABASE_URL`: Main Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Main Supabase anonymous/publishable key.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Main Supabase publishable key.
- `SUPABASE_SERVICE_ROLE_KEY` / `DB1_SUPABASE_SERVICE_ROLE_KEY`: Secret service role key (server-side only).

### Database 2 (Operations - Admins & Moderation)
- `ADMIN_SUPABASE_URL`: Admin Supabase project URL.
- `ADMIN_SUPABASE_ANON_KEY` / `ADMIN_SUPABASE_PUBLISHABLE_KEY`: Admin publishable key.
- `ADMIN_SUPABASE_SERVICE_ROLE_KEY`: Secret service role key for privileged admin operations.

### Application Settings
- `NEXT_PUBLIC_SITE_URL`: Canonical production domain (e.g., `https://jyotishsetu.com`) used for password reset redirects.

---

## 4. Operator Release Actions
1. Ensure `NEXT_PUBLIC_SITE_URL` points to the canonical production URL.
2. In Supabase Auth Settings, configure:
   - Site URL: `https://<domain>`
   - Redirect URLs: `https://<domain>/auth/callback`, `https://<domain>/auth/reset-password`
3. Execute `npm run build` and launch with process manager (`pm2 start npm --name "jyotishsetu" -- start` or deploy to Vercel / Cloudflare).
