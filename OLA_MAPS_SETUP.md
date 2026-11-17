# Ola Maps Location Autocomplete & Geolocation Integration Guide

This guide documents the architecture, configuration, testing, and production deployment of **Ola Maps by Krutrim Cloud** across the Karmic Ascension astrology platform, including **Location Autocomplete** and **"Use My Current Location" (Browser Geolocation + Reverse Geocoding)**.

---

## 1. Credentials Configuration (Krutrim Cloud)

1. Open the [Krutrim Cloud Console](https://cloud.olakrutrim.com/console/maps?section=credentials).
2. Create or select your active Maps API credential.
3. In your credentials settings, ensure allowed domains include:
   - Development: `http://localhost:3000`
   - Production: `https://astrologer-platform.vercel.app` (or your custom canonical domain)
4. Copy the API key to your local environment.
5. In `.env.local` (kept git-ignored):
   ```env
   OLA_MAPS_API_KEY=your_actual_api_key_here
   ```
6. **Security Rules**:
   - `OLA_MAPS_API_KEY` is private and server-side only.
   - Never prefix it with `NEXT_PUBLIC_`.
   - The browser never communicates with Ola Maps directly; all requests flow through secure Next.js server proxies.

---

## 2. Server-Side Endpoints Implemented

### A. Places Autocomplete API
- **Route:** `GET /api/places/autocomplete?input=<query>`
- **Upstream:** `https://api.olamaps.io/places/v1/autocomplete`
- **Behavior:** Debounced searching, input sanitization (min 2 chars, max 100 chars), `X-Request-Id` tracing, domain header resolution, and normalized suggestion mapping with GPS coordinates (`latitude`, `longitude`).

### B. Reverse Geocoding API
- **Route:** `GET /api/places/reverse-geocode?lat=<latitude>&lng=<longitude>`
- **Upstream:** `https://api.olamaps.io/places/v1/reverse-geocode`
- **Behavior:** Translates browser GPS coordinates into structured addresses, city, state, postal code, and country for one-click "Use my current location".

---

## 3. Platform Coverage Inventory

| Workflow | Page / Component | Features Enabled |
| :--- | :--- | :--- |
| **Customer Profile** | `app/customer/(portal)/profile/CustomerProfileClient.tsx` | Autocomplete + "Use current location" for Birthplace (exact Kundli Lagna & Rashi calculations). |
| **Astrologer Profile (City)** | `components/astrologer/profile/ProfileForm.tsx` | Autocomplete + "Use current city" (auto-populates state). |
| **Astrologer Profile (Address)** | `components/astrologer/profile/ProfileForm.tsx` | Autocomplete + "Locate current address" for private clinic/ashram street address. |
| **Astrologer Discovery Directory** | `app/customer/(portal)/astrologers/AstrologersDirectoryClient.tsx` | One-click "Near Me" button using device geolocation to filter local astrologers. |
| **Consultation Enquiries** | `app/customer/(portal)/enquiries/new/page.tsx` | Attaches verified birthplace from customer profile to consultation tickets. |
| **Super Admin CRM & Listings** | `app/super-admin/customers/page.tsx`, `app/super-admin/listings/page.tsx` | Searches, moderates, and audits verified city and birthplace records. |

---

## 4. Local Development & Testing Commands (Windows CMD)

### Start Next.js Development Server:
```cmd
cd /d "d:\Company Projects\Astrology website"
npm run dev
```

### Test Autocomplete API with curl:
```cmd
curl.exe -i --get "http://localhost:3000/api/places/autocomplete" --data-urlencode "input=Meerut"
```

### Test Reverse Geocoding API with curl:
```cmd
curl.exe -i "http://localhost:3000/api/places/reverse-geocode?lat=28.6304&lng=77.2177"
```

### Run Quality Gates & Tests:
```cmd
npm run typecheck
npm run lint
npm test
npm run build
```

---

## 5. Production Deployment (Vercel)

1. Open your project on [Vercel](https://vercel.com) → **Settings** → **Environment Variables**.
2. Add:
   - **Key:** `OLA_MAPS_API_KEY`
   - **Value:** `<your-krutrim-cloud-api-key>`
   - **Environment:** Production & Preview
3. Confirm your Vercel deployment URL is included in allowed domains in Krutrim Cloud Console.
4. Redeploy project.
5. In production, browser geolocation (`navigator.geolocation`) operates securely over HTTPS.
