# In-House Video Conferencing Platform Architecture & Deployment Guide

## 1. Overview & Architecture

JyotishSetu now features a dedicated, production-ready, in-house video conferencing platform tailored specifically for sacred, confidential Vedic consultations between astrologers and seekers.

The system replaces reliance on public third-party services with a self-hosted WebRTC architecture powered by **LiveKit** and **Next.js**:

```
┌────────────────────────────────────────────────────────┐
│                   Customer & Astrologer                │
│             (/consultation/[id] Video Portal)          │
└──────────┬─────────────────────────────▲───────────────┘
           │ WebSocket Tracks            │ Media Tracks
           ▼                             │ (Audio / Video / Screen)
┌───────────────────────┐       ┌────────┴───────────────┐
│ Next.js Control Plane │       │   LiveKit Media SFU    │
│  - Token issuance     │       │  - Audio/Video tracks  │
│  - Window validation  │       │  - Data channel        │
│  - Chat persistence   │       │  - Adaptive bitrate    │
│  - Lifecycle & audit  │       │  - Dynacast            │
└──────────┬────────────┘       └────────────────────────┘
           │
           ▼
┌────────────────────────────────────────────────────────┐
│               Supabase PostgreSQL Data Plane           │
│  - consultation_meetings (1-to-1 with bookings)        │
│  - meeting_participants (role, mute & screen state)    │
│  - meeting_chat_messages (persistent consultation chat)│
│  - consultation_reminders (durable 15-min scheduler)   │
└────────────────────────────────────────────────────────┘
```

---

## 2. Security & Token Isolation

1. **Opaque Collision-Resistant Rooms:**  
   Room names are generated cryptographically (`jyotishsetu_<24 hex chars>`). No personal data (names, emails, phones, sequential booking IDs) is ever exposed in room names or WebRTC signaling.
2. **Short-Lived Media Tokens:**  
   Tokens are generated on the server (`lib/consultation/token.ts`) using HMAC-SHA256 with an exact TTL matching the appointment duration + 60 minutes.
3. **Role-Based Privilege Enforcement:**  
   - **Astrologer (Host):** Granted `roomAdmin: true`. Has the authority to mute participants, remove disruptive users, and formally end the consultation for all participants.
   - **Customer (Seeker):** Granted `roomAdmin: false`. Can publish audio/video/screen, raise hand, and participate in in-call chat.
4. **Zero Client Secret Leakage:**  
   `LIVEKIT_API_SECRET` and service keys are strictly isolated to server contexts and never appear in `NEXT_PUBLIC_*` or browser bundles.

---

## 3. Meeting Lifecycle & The 15-Minute Muhurat Window

Meetings strictly enforce the authoritative booking status:
- **Status State Machine:** `scheduled` → `waiting` → `active` → `ended` (or `cancelled`).
- **Join Window:**  
  - Opens **15 minutes prior** to `scheduled_at`.
  - Remains open throughout `duration_minutes` + a 60-minute grace window.
  - Earlier join attempts receive a clear explanation: `"Consultation room unlocks 15 minutes before the scheduled Muhurat time."`
  - Expired sessions are closed.

---

## 4. In-Call Chat & Real-Time Sync

- **Dual-Layer Delivery:**  
  1. **Instant Broadcast:** Uses LiveKit's WebRTC low-latency Data Channel (`publishData`) for instantaneous sub-100ms message delivery between active participants.
  2. **Durable Persistence:** Every message is validated and persisted to `meeting_chat_messages` in PostgreSQL via server action `sendMeetingChatMessageAction`.
- **History Recovery:** If a participant reconnects or refreshes, `getMeetingChatHistoryAction` restores full chat history immediately.
- **Isolation:** Strict foreign key constraint (`meeting_id`) and RLS ensure no cross-room chat leakage can ever occur.

---

## 5. Automated 15-Minute Consultation Reminders

- **Durable Scheduling:**  
  `scheduleConsultationReminders(options)` calculates `scheduled_at - 15 minutes` and idempotently upserts records in `consultation_reminders`.
- **Rescheduling & Cancellation:**  
  If an appointment is cancelled, reminders are flagged `cancelled`. If rescheduled, the trigger timestamp is automatically updated.
- **Worker Execution:**  
  `processDueConsultationReminders()` queries pending reminders where `scheduled_for <= NOW()`, inserts in-app notifications with a direct link to `/consultation/[id]`, and marks the job `sent`.

---

## 6. Self-Hosted Media Server (LiveKit) Setup

### Hardware Requirements
- **Small Deployments (1–50 concurrent consultations):** 2 vCPU, 4 GB RAM, 100 Mbps network.
- **Production Deployments (50–500 concurrent consultations):** 4–8 vCPU, 16 GB RAM, 1 Gbps network.

### Port & Firewall Configuration
| Port | Protocol | Purpose |
|------|----------|---------|
| `7880` | TCP | LiveKit HTTP & WebSocket signaling |
| `7881` | TCP | LiveKit WebRTC TCP fallback |
| `7882` | UDP | LiveKit WebRTC UDP primary media |
| `50000–60000` | UDP | WebRTC media traffic (ICE candidates) |

### Docker Compose Example (`livekit.yaml`)
```yaml
version: "3.9"
services:
  livekit:
    image: livekit/livekit-server:v1.7
    command: --config /etc/livekit.yaml
    network_mode: "host"
    restart: unless-stopped
    volumes:
      - ./livekit.yaml:/etc/livekit.yaml

  livekit-caddy:
    image: livekit/caddy-livekit
    network_mode: "host"
    restart: unless-stopped
    volumes:
      - ./caddy.yaml:/etc/caddy/Caddyfile
```

---

## 7. Environment Variables Reference

Add the following to `.env.local` / production environment:

```env
# In-House Video Conferencing (LiveKit)
LIVEKIT_URL=wss://meet.jyotishsetu.com
NEXT_PUBLIC_LIVEKIT_URL=wss://meet.jyotishsetu.com
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret_at_least_32_characters

# Provider Selection Flag ('inhouse' | 'jitsi' | 'jaas')
NEXT_PUBLIC_CONSULTATION_PROVIDER=inhouse
```

---

## 8. Provider Migration & Rollback Strategy

- **Legacy Provider Retention:**  
  The existing Jitsi (`meet.jit.si`) and 8x8 JaaS (`/api/consultation-token`) implementations remain completely intact in the repository.
- **Instant Rollback:**  
  To switch back to Jitsi at any time without redeploying code, simply set:
  ```env
  NEXT_PUBLIC_CONSULTATION_PROVIDER=jitsi
  ```
  Both the Astrologer and Customer booking clients will instantly revert to the legacy URLs.

