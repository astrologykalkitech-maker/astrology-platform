import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { checkRateLimit } from "../lib/security/rate-limit";

// ---------------------------------------------------------------------------
// 1. Consultation Token & Authorization Logic
// ---------------------------------------------------------------------------

interface MockBooking {
  id: string;
  customer_id: string;
  astrologer_id: string; // astrologer_profiles.id
  status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
  scheduled_at: string;
  duration_minutes: number;
}

interface MockLead {
  id: string;
  customer_id: string;
  astrologer_id: string | null;
  status: "new" | "assigned" | "closed";
}

function evaluateConsultationTokenAccess(params: {
  user: { id: string };
  roomId: string;
  clientClaimedRole?: string;
  booking?: MockBooking | null;
  lead?: MockLead | null;
  astroProfileId?: string | null;
  assignedLeadAstrologerIds?: string[];
  nowMs: number;
}) {
  const { user, roomId, booking, lead, astroProfileId, assignedLeadAstrologerIds = [], nowMs } = params;

  if (!roomId || !roomId.trim()) {
    return { status: 400, error: "roomId is required" };
  }

  // Rate limiting check
  const rl = checkRateLimit(`test:jaas:token:${user.id}`, 10, 60_000);
  if (!rl.allowed) {
    return { status: 429, error: "Too many token requests" };
  }

  if (booking) {
    const isCustomer = booking.customer_id === user.id;
    const isAstrologer = astroProfileId ? booking.astrologer_id === astroProfileId : false;

    if (!isCustomer && !isAstrologer) {
      return { status: 403, error: "You are not an authorized participant in this consultation" };
    }

    if (booking.status === "cancelled" || booking.status === "no_show") {
      return { status: 403, error: `Cannot join consultation room for booking with status: ${booking.status}` };
    }

    const scheduledTime = new Date(booking.scheduled_at).getTime();
    const durationMs = (booking.duration_minutes || 30) * 60 * 1000;
    const earliestJoin = scheduledTime - 15 * 60 * 1000;
    const latestJoin = scheduledTime + durationMs + 60 * 60 * 1000;

    if (nowMs < earliestJoin) {
      return { status: 403, error: "Consultation room opens 15 minutes before the scheduled time." };
    }
    if (nowMs > latestJoin) {
      return { status: 403, error: "This consultation session window has ended." };
    }

    // CRITICAL: Moderator privilege is derived exclusively from server-side astrologer verification
    return {
      status: 200,
      authorized: true,
      isModerator: isAstrologer, // Client role parameter is ignored!
      tokenExpiresIn: Math.max(1800, Math.min(7200, Math.floor((latestJoin - nowMs) / 1000))),
    };
  }

  if (lead) {
    if (lead.status === "closed") {
      return { status: 403, error: "This consultation enquiry has been closed." };
    }

    const isCustomer = lead.customer_id === user.id;
    const isAstrologer = astroProfileId
      ? lead.astrologer_id === astroProfileId || assignedLeadAstrologerIds.includes(astroProfileId)
      : false;

    if (!isCustomer && !isAstrologer) {
      return { status: 403, error: "You are not an authorized participant in this consultation enquiry" };
    }

    return {
      status: 200,
      authorized: true,
      isModerator: isAstrologer,
      tokenExpiresIn: 7200,
    };
  }

  return { status: 404, error: "Consultation room not found or access denied" };
}

test("Consultation Token: IDOR prevention - Stranger cannot access booking or lead room", () => {
  const stranger = { id: "user-stranger-999" };
  const booking: MockBooking = {
    id: "booking-101",
    customer_id: "user-customer-111",
    astrologer_id: "astro-profile-222",
    status: "confirmed",
    scheduled_at: new Date(Date.now()).toISOString(),
    duration_minutes: 30,
  };

  const res = evaluateConsultationTokenAccess({
    user: stranger,
    roomId: booking.id,
    booking,
    nowMs: Date.now(),
  });

  assert.equal(res.status, 403);
  assert.equal(res.authorized, undefined);
});

test("Consultation Token: Role Spoofing Prevention - Customer passing role='astrologer' does NOT receive moderator privileges", () => {
  const customer = { id: "user-customer-111" };
  const booking: MockBooking = {
    id: "booking-102",
    customer_id: "user-customer-111",
    astrologer_id: "astro-profile-222",
    status: "confirmed",
    scheduled_at: new Date(Date.now()).toISOString(),
    duration_minutes: 30,
  };

  const res = evaluateConsultationTokenAccess({
    user: customer,
    roomId: booking.id,
    clientClaimedRole: "astrologer", // Attacker attempts to spoof moderator role
    booking,
    astroProfileId: null, // Customer has no astrologer profile
    nowMs: Date.now(),
  });

  assert.equal(res.status, 200);
  assert.equal(res.authorized, true);
  assert.equal(res.isModerator, false, "Customer must NEVER be granted moderator privileges even if requesting role=astrologer");
});

test("Consultation Token: Verified Astrologer receives moderator privileges automatically", () => {
  const astrologerUser = { id: "user-astrologer-222" };
  const booking: MockBooking = {
    id: "booking-103",
    customer_id: "user-customer-111",
    astrologer_id: "astro-profile-222",
    status: "confirmed",
    scheduled_at: new Date(Date.now()).toISOString(),
    duration_minutes: 30,
  };

  const res = evaluateConsultationTokenAccess({
    user: astrologerUser,
    roomId: booking.id,
    booking,
    astroProfileId: "astro-profile-222",
    nowMs: Date.now(),
  });

  assert.equal(res.status, 200);
  assert.equal(res.authorized, true);
  assert.equal(res.isModerator, true);
});

test("Consultation Token: Boundary Gating - Rejects entry before the 15-minute window or after session expiration", () => {
  const customer = { id: "user-customer-111" };
  const sessionTime = Date.now() + 60 * 60 * 1000; // 1 hour from now
  const booking: MockBooking = {
    id: "booking-104",
    customer_id: "user-customer-111",
    astrologer_id: "astro-profile-222",
    status: "confirmed",
    scheduled_at: new Date(sessionTime).toISOString(),
    duration_minutes: 30,
  };

  // Too early (1 hour prior to session)
  const earlyRes = evaluateConsultationTokenAccess({
    user: customer,
    roomId: booking.id,
    booking,
    nowMs: Date.now(),
  });
  assert.equal(earlyRes.status, 403);
  assert.match(earlyRes.error || "", /15 minutes/);

  // Expired (3 hours after session ended)
  const expiredRes = evaluateConsultationTokenAccess({
    user: customer,
    roomId: booking.id,
    booking,
    nowMs: sessionTime + (30 + 120) * 60 * 1000,
  });
  assert.equal(expiredRes.status, 403);
  assert.match(expiredRes.error || "", /session window has ended/);
});

test("Consultation Token: Rejects cancelled or no_show bookings", () => {
  const customer = { id: "user-customer-111" };
  const booking: MockBooking = {
    id: "booking-105",
    customer_id: "user-customer-111",
    astrologer_id: "astro-profile-222",
    status: "cancelled",
    scheduled_at: new Date().toISOString(),
    duration_minutes: 30,
  };

  const res = evaluateConsultationTokenAccess({
    user: customer,
    roomId: booking.id,
    booking,
    nowMs: Date.now(),
  });

  assert.equal(res.status, 403);
  assert.match(res.error || "", /cancelled/);
});

test("Consultation Token: Rate limit blocks excess token requests", () => {
  const spammer = { id: "spammer-user-999" };
  const booking: MockBooking = {
    id: "booking-106",
    customer_id: "spammer-user-999",
    astrologer_id: "astro-profile-222",
    status: "confirmed",
    scheduled_at: new Date().toISOString(),
    duration_minutes: 30,
  };

  // Run 10 allowed requests
  for (let i = 0; i < 10; i++) {
    const r = evaluateConsultationTokenAccess({
      user: spammer,
      roomId: booking.id,
      booking,
      nowMs: Date.now(),
    });
    assert.equal(r.status, 200);
  }

  // 11th request must be blocked with 429
  const blocked = evaluateConsultationTokenAccess({
    user: spammer,
    roomId: booking.id,
    booking,
    nowMs: Date.now(),
  });
  assert.equal(blocked.status, 429);
  assert.match(blocked.error || "", /Too many token requests/);
});

// ---------------------------------------------------------------------------
// 2. Astrologer Create-Booking Validation & Normalization
// ---------------------------------------------------------------------------

function validateAndNormalizeBookingPayload(payload: Record<string, unknown>) {
  const { customer_id, service_type, consultation_mode, scheduled_at, duration_minutes = 30 } = payload;

  if (!customer_id || !service_type || !consultation_mode || !scheduled_at) {
    return { valid: false, error: "Missing required fields" };
  }

  // Normalization: map 'Voice' to 'Call' to satisfy database constraint
  const mode = consultation_mode === "Voice" ? "Call" : String(consultation_mode);
  if (!["Chat", "Call", "Video"].includes(mode)) {
    return { valid: false, error: "Invalid consultation mode. Must be Video, Call, or Chat." };
  }

  const duration = Number(duration_minutes);
  if (isNaN(duration) || duration < 10 || duration > 180) {
    return { valid: false, error: "Duration must be between 10 and 180 minutes." };
  }

  const scheduledDate = new Date(String(scheduled_at));
  if (isNaN(scheduledDate.getTime())) {
    return { valid: false, error: "Invalid scheduled_at date" };
  }

  return {
    valid: true,
    data: {
      customer_id: String(customer_id),
      service_type: String(service_type).trim(),
      consultation_mode: mode,
      scheduled_at: scheduledDate.toISOString(),
      duration_minutes: duration,
    },
  };
}

test("Booking Creation: Voice is mapped to Call and invalid modes are rejected", () => {
  const voiceRes = validateAndNormalizeBookingPayload({
    customer_id: "c-1",
    service_type: "Kundli",
    consultation_mode: "Voice",
    scheduled_at: "2026-11-01T10:00:00Z",
    duration_minutes: 30,
  });
  assert.equal(voiceRes.valid, true);
  assert.equal(voiceRes.data?.consultation_mode, "Call");

  const invalidRes = validateAndNormalizeBookingPayload({
    customer_id: "c-1",
    service_type: "Kundli",
    consultation_mode: "Telepathy",
    scheduled_at: "2026-11-01T10:00:00Z",
    duration_minutes: 30,
  });
  assert.equal(invalidRes.valid, false);
  assert.match(invalidRes.error || "", /Invalid consultation mode/);
});

test("Booking Creation: Duration constraints enforce 10-180 minute database limits", () => {
  const tooShort = validateAndNormalizeBookingPayload({
    customer_id: "c-1",
    service_type: "Kundli",
    consultation_mode: "Video",
    scheduled_at: "2026-11-01T10:00:00Z",
    duration_minutes: 5,
  });
  assert.equal(tooShort.valid, false);
  assert.match(tooShort.error || "", /between 10 and 180/);

  const tooLong = validateAndNormalizeBookingPayload({
    customer_id: "c-1",
    service_type: "Kundli",
    consultation_mode: "Video",
    scheduled_at: "2026-11-01T10:00:00Z",
    duration_minutes: 240,
  });
  assert.equal(tooLong.valid, false);
  assert.match(tooLong.error || "", /between 10 and 180/);

  const validDuration = validateAndNormalizeBookingPayload({
    customer_id: "c-1",
    service_type: "Kundli",
    consultation_mode: "Video",
    scheduled_at: "2026-11-01T10:00:00Z",
    duration_minutes: 45,
  });
  assert.equal(validDuration.valid, true);
  assert.equal(validDuration.data?.duration_minutes, 45);
});

// ---------------------------------------------------------------------------
// 3. Security Headers & Configuration Verification
// ---------------------------------------------------------------------------

test("Next.js Security Config: Includes Google avatar origin and camera/microphone permissions", () => {
  const configPath = path.resolve(__dirname, "../next.config.ts");
  const content = fs.readFileSync(configPath, "utf-8");

  assert.ok(
    content.includes("https://lh3.googleusercontent.com") &&
    content.includes("https://*.googleusercontent.com"),
    "next.config.ts must whitelist Google avatar CDN in Content-Security-Policy img-src"
  );

  assert.ok(
    content.includes("camera=(self)") && content.includes("microphone=(self)"),
    "Permissions-Policy must permit camera and microphone for self origin"
  );
});

// ---------------------------------------------------------------------------
// 4. Migration & Schema Synchronization Verification
// ---------------------------------------------------------------------------

test("Database Schema: Migration 018 and CONSOLIDATED_SETUP.sql contain hardened support ticket RLS", () => {
  const m18Path = path.resolve(__dirname, "../supabase/migrations/018_support_ticket_security_hardening.sql");
  const consolidatedPath = path.resolve(__dirname, "../supabase/CONSOLIDATED_SETUP.sql");

  const m18Content = fs.readFileSync(m18Path, "utf-8");
  const consolidatedContent = fs.readFileSync(consolidatedPath, "utf-8");

  // Migration 018 verifies
  assert.ok(
    m18Content.includes("revoke update on public.support_tickets from authenticated;"),
    "Migration 018 must revoke direct update on support_tickets from authenticated"
  );
  assert.ok(
    m18Content.includes("set search_path = ''"),
    "Migration 018 must secure set_support_ticket_number search_path"
  );
  assert.ok(
    m18Content.includes("sender_id = (select auth.uid())"),
    "Migration 018 must enforce sender_id match on support_messages"
  );

  // Consolidated setup synchronization
  assert.ok(
    consolidatedContent.includes("SECTION 17: AI-POWERED SUPPORT, TICKETS"),
    "CONSOLIDATED_SETUP.sql must contain Section 17 for fresh database deployments"
  );
  assert.ok(
    consolidatedContent.includes("create table if not exists public.support_tickets"),
    "CONSOLIDATED_SETUP.sql must include support_tickets table"
  );
  assert.ok(
    consolidatedContent.includes("grant select, insert on public.support_tickets to authenticated;"),
    "CONSOLIDATED_SETUP.sql must only grant select and insert on support_tickets to authenticated"
  );
});

