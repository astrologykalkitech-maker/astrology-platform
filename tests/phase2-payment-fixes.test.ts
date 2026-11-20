import test from "node:test";
import assert from "node:assert/strict";
import { isConsultationPaymentVerified, isVideoPaymentVerifiedForMode } from "../lib/consultation/payment-access";
import { isLiveVoiceCallStatus, isVoiceCallRingExpired } from "../lib/chat/voice-call";
import type { VoiceCall } from "../lib/types/database.types";
import { calculateCommissionBreakdown, rupeesToPaise, formatPaiseToInr } from "../lib/financial/pricing";

test("Phase 2: Consultation Payment Verification Guard logic", () => {
  // Free bookings should always be permitted
  assert.equal(
    isConsultationPaymentVerified({
      price: 0,
      paymentStatus: "pending",
      paymentMode: "platform_gateway",
    }),
    true
  );

  // Paid booking without verification should be denied
  assert.equal(
    isConsultationPaymentVerified({
      price: 500,
      paymentStatus: "pending",
      paymentMode: "platform_gateway",
      hasSuccessfulPlatformOrder: false,
      hasSucceededPaymentIntent: false,
    }),
    false
  );

  // Pay at drop should be permitted
  assert.equal(
    isConsultationPaymentVerified({
      price: 500,
      paymentStatus: "pending",
      paymentMode: "pay_at_drop",
    }),
    true
  );

  // Platform Gateway with successful order should be permitted
  assert.equal(
    isConsultationPaymentVerified({
      price: 500,
      paymentStatus: "pending",
      paymentMode: "platform_gateway",
      hasSuccessfulPlatformOrder: true,
    }),
    true
  );

  // Platform Gateway with succeeded payment intent (Jyotish Pay) should be permitted
  assert.equal(
    isConsultationPaymentVerified({
      price: 500,
      paymentStatus: "pending",
      paymentMode: "platform_gateway",
      hasSucceededPaymentIntent: true,
    }),
    true
  );

  // Direct consultant payment with verified UTR should be permitted
  assert.equal(
    isConsultationPaymentVerified({
      price: 500,
      paymentStatus: "pending",
      paymentMode: "direct_consultant",
      hasVerifiedDirectPayment: true,
    }),
    true
  );

  // Direct consultant payment without verified UTR should be denied
  assert.equal(
    isConsultationPaymentVerified({
      price: 500,
      paymentStatus: "pending",
      paymentMode: "direct_consultant",
      hasVerifiedDirectPayment: false,
    }),
    false
  );
});

test("Phase 2: Video consultation payment authorization compatibility", () => {
  assert.equal(
    isVideoPaymentVerifiedForMode({
      paymentMode: "pay_at_drop",
      hasVerifiedDirectPayment: false,
      hasSuccessfulPlatformPayment: false,
    }),
    true
  );

  assert.equal(
    isVideoPaymentVerifiedForMode({
      paymentMode: "platform_gateway",
      hasVerifiedDirectPayment: false,
      hasSuccessfulPlatformPayment: true,
    }),
    true
  );

  assert.equal(
    isVideoPaymentVerifiedForMode({
      paymentMode: "platform_gateway",
      hasVerifiedDirectPayment: true,
      hasSuccessfulPlatformPayment: false,
    }),
    false
  );
});

test("Phase 2: Voice Call Lifecycle & Stale Expiry checks", () => {
  assert.equal(isLiveVoiceCallStatus("ringing"), true);
  assert.equal(isLiveVoiceCallStatus("accepted"), true);
  assert.equal(isLiveVoiceCallStatus("active"), true);
  assert.equal(isLiveVoiceCallStatus("ended"), false);
  assert.equal(isLiveVoiceCallStatus("declined"), false);
  assert.equal(isLiveVoiceCallStatus("missed"), false);

  const now = Date.now();
  const freshCall = {
    id: "call-1",
    conversation_id: "conv-1",
    caller_id: "u1",
    callee_id: "u2",
    caller_role: "customer",
    callee_role: "astrologer",
    caller_name: "Customer",
    callee_name: "Astrologer",
    room_name: "room-1",
    status: "ringing",
    created_at: new Date(now - 10_000).toISOString(),
    updated_at: new Date(now - 10_000).toISOString(),
  } as const;

  const expiredCall = {
    ...freshCall,
    created_at: new Date(now - 60_000).toISOString(),
    updated_at: new Date(now - 60_000).toISOString(),
  } as const;

  assert.equal(isVoiceCallRingExpired(freshCall as unknown as VoiceCall, now), false);
  assert.equal(isVoiceCallRingExpired(expiredCall as unknown as VoiceCall, now), true);
});

test("Phase 2: Escrow Split & Precision Validation", () => {
  const grossPaise = rupeesToPaise(1000);
  assert.equal(grossPaise, 100000);

  const { platformFeePaise, consultantPayablePaise } = calculateCommissionBreakdown(grossPaise, 10);
  assert.equal(platformFeePaise, 10000);
  assert.equal(consultantPayablePaise, 90000);
  assert.equal(platformFeePaise + consultantPayablePaise, grossPaise);

  const formatted = formatPaiseToInr(grossPaise);
  assert.equal(formatted.includes("1,000"), true);
});

test("Phase 2: Local Migration 065 exists and defines atomic UTR review", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/065_consolidate_manual_utr_verification_to_atomic_journal.sql"
  );
  assert.equal(fs.existsSync(migrationPath), true);

  const content = fs.readFileSync(migrationPath, "utf-8");
  assert.equal(content.includes("post_atomic_financial_journal"), true);
  assert.equal(content.includes("payment_settlement_claims"), true);
});
