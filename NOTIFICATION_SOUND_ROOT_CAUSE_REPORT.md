# JyotishSetu — Notification Sound Failure Root Cause Investigation Report

**Date:** November 16, 2026  
**Auditor:** Senior Next.js, React, Supabase Realtime & WebRTC Debugging Engineer  
**Status:** Investigation Complete — Root Causes Confirmed  

---

## Executive Summary

A comprehensive, end-to-end audit was conducted across the event delivery and audio playback pipelines in JyotishSetu covering both the **Customer Dashboard** and **Astrologer Dashboard**.

The investigation examined:
1. **Audio Engine Initialization & Browser Autoplay Policies**
2. **Audio Asset Files & Format Encoding**
3. **Supabase Realtime Publications & WAL Replication Setup**
4. **Dashboard Shell Lifecycles & Realtime Subscription Scopes**
5. **Direct Chat Message Event Delivery**
6. **Voice Call vs. Video Call Signaling Architectures**
7. **Cross-Dashboard Notification & Unread Count Polling**

The failure of notification sounds to play was caused by a combination of **Supabase Realtime publication omissions**, **isolated chat channel scope** (chat events only listened to when actively on `/chat`), **absence of real-time incoming video call signaling**, and **race conditions in audio element reuse**.

---

## Event Pipeline Tracing & Findings

```
[Producer: DB / API]
       │
       ▼
[Supabase Realtime Publication (pg_publication)] ──► [BLOCKER RC-01: Tables not in supabase_realtime]
       │
       ▼
[WebSocket Channel Subscription] ───────────────► [BLOCKER RC-02: Scoped to /chat page only]
       │                                          [BLOCKER RC-03: Video calls lack incoming signaling]
       ▼
[Dashboard Event Handlers] ─────────────────────► [BLOCKER RC-04: Header badge poll bypasses sound]
       │
       ▼
[Sound Notification Service] ───────────────────► [BLOCKER RC-05: Concurrent audio.play() collision]
       │
       ▼
[Browser HTML5 Audio Playback]
```

---

## Root Cause Catalog

### RC-01: Supabase Realtime Publications Missing for Key Operational Tables
- **Root Cause ID:** `RC-01`
- **Severity:** Critical
- **Classification:** Confirmed Root Cause
- **Affected Area:** Both Customer Dashboard & Astrologer Dashboard (Bookings, Consultations, Notifications)
- **Source Files:**
  - `supabase/migrations/012_realtime_astrologer_visibility.sql`
  - `supabase/migrations/017_realtime_chat_publications.sql`
  - `supabase/migrations/024_inhouse_video_conferencing.sql`
  - `supabase/migrations/013_customer_bookings_and_notifications.sql`
- **Actual Code Behavior:**
  In PostgreSQL, Supabase Realtime listeners (`supabase.channel().on("postgres_changes", ...)`) only fire if the target tables belong to the `supabase_realtime` publication.
  An inspection of all migrations reveals that only `astrologer_profiles`, `direct_messages`, `conversations`, `voice_calls`, and `astrologer_live_broadcasts` were added to `supabase_realtime`.
  The tables:
  - `customer_bookings`
  - `puja_bookings`
  - `customer_notifications`
  - `lead_assignments`
  - `consultation_meetings`
  were **never added to the `supabase_realtime` publication**, nor do they have `REPLICA IDENTITY FULL`.
- **Why Sound Does Not Play:**
  Because the tables are not published in PostgreSQL, Supabase's WAL logical decoding stream completely ignores inserts and updates on `customer_bookings` and `customer_notifications`. As a result, the Realtime channel callbacks in `RealtimeAstrologerPortalSync.tsx` and `RealtimeAstrologerSync.tsx` **never receive database change events**, preventing `soundNotificationService.playConsultationRequestSound()`, `playBookingConfirmedSound()`, and `playNotificationSound()` from executing.
- **Required Correction:**
  Add a database migration:
  ```sql
  ALTER TABLE public.customer_bookings REPLICA IDENTITY FULL;
  ALTER TABLE public.puja_bookings REPLICA IDENTITY FULL;
  ALTER TABLE public.customer_notifications REPLICA IDENTITY FULL;
  ALTER TABLE public.lead_assignments REPLICA IDENTITY FULL;
  ALTER TABLE public.consultation_meetings REPLICA IDENTITY FULL;

  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_bookings;
      ALTER PUBLICATION supabase_realtime ADD TABLE public.puja_bookings;
      ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_notifications;
      ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_assignments;
      ALTER PUBLICATION supabase_realtime ADD TABLE public.consultation_meetings;
    END IF;
  END $$;
  ```

---

### RC-02: Chat Realtime Listener Is Isolated to `/chat` Page (Silent Background Dashboards)
- **Root Cause ID:** `RC-02`
- **Severity:** High
- **Classification:** Confirmed Root Cause
- **Affected Area:** Both Customer Dashboard & Astrologer Dashboard (Chat Messages)
- **Source Files:**
  - `components/customer/chat/CustomerChatClient.tsx` (Lines 380–420)
  - `components/astrologer/chat/AstrologerChatClient.tsx` (Lines 440–480)
  - `components/customer/CustomerShell.tsx`
  - `components/astrologer/PortalShell.tsx`
- **Actual Code Behavior:**
  The `supabase.channel("jyotishsetu-live-consultation-chat")` subscription is only instantiated inside `CustomerChatClient.tsx` and `AstrologerChatClient.tsx`.
  When an astrologer or customer navigates anywhere else in their dashboard (e.g., `/astrologer/dashboard`, `/astrologer/bookings`, `/customer/astrologers`, `/customer/kundli`), `CustomerChatClient` and `AstrologerChatClient` are unmounted.
- **Why Sound Does Not Play:**
  If a customer sends a message while the astrologer is on their Dashboard or Bookings page, **no listener exists** to detect the message, and therefore no sound alert plays. The sound only played if the user happened to already be looking at `/chat`.
- **Required Correction:**
  Mount a lightweight global chat notification listener inside `PortalShell` and `CustomerShell` (or inside `RealtimeAstrologerPortalSync` and `RealtimeAstrologerSync`) that listens for `INSERT` on `direct_messages` where the authenticated user is the conversation recipient, triggering `soundNotificationService.playMessageSound(newMsg.id)` regardless of what page the user is viewing.

---

### RC-03: Incoming Video Calls Lack Real-Time Signaling Infrastructure
- **Root Cause ID:** `RC-03`
- **Severity:** Critical
- **Classification:** Confirmed Root Cause
- **Affected Area:** Both Customer & Astrologer Dashboards (Video Calling)
- **Source Files:**
  - `components/consultation/ConsultationRoomClient.tsx`
  - `components/chat/VoiceCallProvider.tsx`
  - `app/actions/consultation-meeting.ts`
- **Actual Code Behavior:**
  Voice calls have a dedicated signaling table (`voice_calls` with status `ringing`, `accepted`, `ended`), and `VoiceCallProvider.tsx` listens on channel `voice-calls:${userId}` to trigger repeating ringtones.
  In contrast, **video calls have no `ringing` state or real-time call invitation pipeline**. Video consultations are scheduled bookings that launch LiveKit rooms only after both parties explicitly navigate to `/consultation/[id]`.
- **Why Sound Does Not Play:**
  When a host or user starts a video consultation, no real-time incoming signal or ringtone is dispatched to the other user's dashboard. The recipient has no way of knowing a video call has been initiated unless they manually refresh their bookings page.
- **Required Correction:**
  1. Add `consultation_meetings` table changes to Realtime.
  2. In `consultation_meetings`, when status transitions to `waiting` or `active`, dispatch an incoming video call alert via Realtime or broadcast channel to the recipient's shell.
  3. Wire the incoming video event to `soundNotificationService.playIncomingVideoCallSound(meetingId)`.
  4. Stop the ringtone immediately when the call is accepted, rejected, or ended.

---

### RC-04: Header Notification Polling Updates Badge Without Playing Sound
- **Root Cause ID:** `RC-04`
- **Severity:** Medium
- **Classification:** Confirmed Contributing Issue
- **Affected Area:** Both Customer Header & Astrologer Header
- **Source Files:**
  - `components/astrologer/AstrologerHeader.tsx` (Lines 40–75)
  - `components/customer/CustomerHeader.tsx` (Lines 55–90)
  - `app/api/notifications/unread-count/route.ts`
- **Actual Code Behavior:**
  Both `AstrologerHeader` and `CustomerHeader` poll `/api/notifications/unread-count` on a 30s/60s interval. When `count` increments, they update `setUnreadCount(data.count)`.
- **Why Sound Does Not Play:**
  The polling function simply compares numbers and updates the badge state. It never compares previous unread count vs. new unread count to trigger `soundNotificationService.playNotificationSound()`. Because Realtime on `customer_notifications` was blocked by `RC-01`, this polling was the only active channel, but it was completely mute.
- **Required Correction:**
  1. In `loadCount()`, if `previousCountRef.current !== null && newCount > previousCountRef.current`, call `soundNotificationService.playNotificationSound()`.
  2. Update `previousCountRef.current = newCount`.

---

### RC-05: Single Audio Element Collision on Rapid Consecutive Events
- **Root Cause ID:** `RC-05`
- **Severity:** Medium
- **Classification:** Confirmed Root Cause
- **Affected Area:** `lib/sound/SoundNotificationService.ts`
- **Source Files:**
  - `lib/sound/SoundNotificationService.ts` (Lines 240–260)
- **Actual Code Behavior:**
  `SoundNotificationService` stores a single cached `HTMLAudioElement` per `SoundEventType` in `this.audioElements`.
  When a sound event triggers:
  ```ts
  const audio = this.getOrCreateAudioElement(type);
  audio.currentTime = 0;
  audio.play();
  ```
- **Why Sound Does Not Play:**
  In modern browsers, calling `audio.play()` on an HTMLAudioElement that is already playing causes the browser to reject the previous play promise with `AbortError: The play() request was interrupted by a new load request`.
  If two notifications or messages arrive in quick succession (e.g., within 300ms), the second call aborts the first, and frequently neither plays or audio glitches out.
- **Required Correction:**
  For one-shot sounds (`message`, `notification`, `booking-confirmed`, etc.), clone the audio element or use `audio.cloneNode() as HTMLAudioElement`, or maintain a pool of 2–3 instances per sound effect. Reserve the persistent singleton audio element strictly for looping ringtones (`voice-call`, `video-call`) so they can be reliably started and stopped.

---

### RC-06: Astrologer Chat Ringer Uses Web Audio Oscillators That Silently Abort on Background Tab Throttle
- **Root Cause ID:** `RC-06`
- **Severity:** Medium
- **Classification:** Confirmed Contributing Issue
- **Affected Area:** Astrologer Dashboard (`components/astrologer/chat/AstrologerChatClient.tsx`)
- **Source Files:**
  - `lib/chat/audio-notification.ts` (Lines 100–174)
  - `lib/chat/notification-rules.ts` (Lines 3–9)
- **Actual Code Behavior:**
  In `AstrologerChatClient`, when `getIncomingChatSound()` returns `"ring"`, it invokes `startContinuousChatRinging()` from `audio-notification.ts`.
  This function uses `setTimeout(..., 4000)` with Web Audio `ctx.createOscillator()`.
- **Why Sound Does Not Play:**
  When a browser tab is placed in the background or minimized, modern browsers (Chrome, Safari, Edge) aggressively throttle `setTimeout` to 1 execution per minute or freeze it entirely. Furthermore, background tabs suspend un-interacted `AudioContext` instances.
  In contrast, standard `<audio>` elements with `.loop = true` continue playing seamlessly in background tabs.
- **Required Correction:**
  Route continuous chat ringing through the unified `soundNotificationService.playMessageSound()` or `startRingtone()` which uses HTML5 `<audio>` loop elements instead of fragile `setTimeout` oscillator chaining.

---

## Action Plan & Corrective Roadmap

1. **Database Migration (`058_realtime_operational_publications.sql`):**
   - Publish `customer_bookings`, `puja_bookings`, `customer_notifications`, `lead_assignments`, and `consultation_meetings` to `supabase_realtime`.
   - Set `REPLICA IDENTITY FULL` on all five tables.
2. **Audio Engine Hardening (`SoundNotificationService.ts`):**
   - Implement concurrent audio playback handling (instance cloning for one-shots; singleton lock for ringtones).
   - Ensure clean promise error handling without console clutter.
3. **Cross-Dashboard Chat Notification Delivery:**
   - Add a global direct-message real-time listener into `CustomerShell` and `PortalShell` so incoming messages trigger `playMessageSound()` regardless of whether the user is on the `/chat` route.
4. **Header Notification Badge Sound Synchronization:**
   - Update `AstrologerHeader` and `CustomerHeader` to play notification chimes when unread counts increment from polling.
5. **Video Call Signaling & Ringtone:**
   - Listen to `consultation_meetings` real-time events in both shells to trigger `playIncomingVideoCallSound()` when a meeting starts.
6. **Regression Testing:**
   - Execute all unit and regression suites to ensure 100% test pass rate with zero side-effects.
