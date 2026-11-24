import test from "node:test";
import assert from "node:assert/strict";
import { resolveConsultationRoute, getBookingConsultationUrl } from "../lib/consultation/provider";
import {
  calculateBillableMinutes,
  calculateConsultationFee,
  resolveConsultationRate,
} from "../lib/consultation/billing-engine";
import { calculateCommissionBreakdown } from "../lib/financial/pricing";

test("Consultation System Audit & Mode-Aware Routing Suite", async (t) => {
  await t.test("Mode-aware consultation route resolution - Chat Booking", () => {
    const bookingId = "11111111-2222-3333-4444-555555555555";
    const resCustomer = resolveConsultationRoute(bookingId, "Chat", "customer");
    assert.equal(resCustomer.provider, "inhouse-chat");
    assert.equal(resCustomer.route, `/customer/chat?bookingId=${bookingId}`);
    assert.equal(resCustomer.mode, "Chat");

    const resAstrologer = resolveConsultationRoute(bookingId, "chat", "astrologer");
    assert.equal(resAstrologer.provider, "inhouse-chat");
    assert.equal(resAstrologer.route, `/astrologer/chat?bookingId=${bookingId}`);
  });

  await t.test("Mode-aware consultation route resolution - Voice/Call Booking", () => {
    const bookingId = "22222222-3333-4444-5555-666666666666";
    const resCall = resolveConsultationRoute(bookingId, "Call", "customer");
    assert.equal(resCall.provider, "inhouse-voice");
    assert.equal(resCall.route, `/consultation/${bookingId}`);
    assert.equal(resCall.mode, "Call");

    const resVoice = resolveConsultationRoute(bookingId, "voice", "astrologer");
    assert.equal(resVoice.provider, "inhouse-voice");
    assert.equal(resVoice.route, `/consultation/${bookingId}`);
  });

  await t.test("Mode-aware consultation route resolution - Video Booking", () => {
    const bookingId = "33333333-4444-5555-6666-777777777777";
    const resVideo = resolveConsultationRoute(bookingId, "Video", "customer");
    assert.equal(resVideo.provider, "inhouse-livekit");
    assert.equal(resVideo.route, `/consultation/${bookingId}`);
    assert.equal(resVideo.mode, "Video");
  });

  await t.test("getBookingConsultationUrl helper matches resolveConsultationRoute", () => {
    const bId = "test-booking-id";
    assert.equal(getBookingConsultationUrl(bId, "Chat", "customer"), `/customer/chat?bookingId=${bId}`);
    assert.equal(getBookingConsultationUrl(bId, "Chat", "astrologer"), `/astrologer/chat?bookingId=${bId}`);
    assert.equal(getBookingConsultationUrl(bId, "Call"), `/consultation/${bId}`);
    assert.equal(getBookingConsultationUrl(bId, "Video"), `/consultation/${bId}`);
  });
});

test("Consultation Per-Minute Billing Engine & Invariants", async (t) => {
  await t.test("Duration calculation: 0 duration produces 0 billable minutes (no charge for unaccepted calls)", () => {
    assert.equal(calculateBillableMinutes(0), 0);
    assert.equal(calculateBillableMinutes(-10), 0);
  });

  await t.test("Duration calculation: Minimum 1 minute once session active", () => {
    assert.equal(calculateBillableMinutes(1), 1);
    assert.equal(calculateBillableMinutes(30), 1);
    assert.equal(calculateBillableMinutes(60), 1);
  });

  await t.test("Duration calculation: Partial minutes round up to integer minutes", () => {
    assert.equal(calculateBillableMinutes(65), 2);
    assert.equal(calculateBillableMinutes(175), 3);
    assert.equal(calculateBillableMinutes(600), 10);
  });

  await t.test("Rate resolution across modes", () => {
    const chatRate = resolveConsultationRate({ mode: "Chat", chatRate: 12 });
    assert.equal(chatRate.rateRupees, 12);
    assert.equal(chatRate.ratePaise, 1200);

    const voiceRate = resolveConsultationRate({ mode: "Call", voiceRate: 18 });
    assert.equal(voiceRate.rateRupees, 18);
    assert.equal(voiceRate.ratePaise, 1800);

    const videoRate = resolveConsultationRate({ mode: "Video", videoRate: 30 });
    assert.equal(videoRate.rateRupees, 30);
    assert.equal(videoRate.ratePaise, 3000);
  });

  await t.test("Full fee breakdown: 3 minutes voice call at ₹15/min (1500 paise)", () => {
    const fee = calculateConsultationFee({
      durationSeconds: 175, // 2m 55s -> 3 min
      ratePerMinutePaise: 1500,
      commissionPercent: 10,
    });

    assert.equal(fee.billableMinutes, 3);
    assert.equal(fee.grossAmountPaise, 4500); // ₹45.00
    assert.equal(fee.grossAmountRupees, 45);
    assert.equal(fee.platformCommissionPaise, 450); // ₹4.50
    assert.equal(fee.astrologerEarningsPaise, 4050); // ₹40.50
    assert.equal(fee.grossAmountPaise, fee.platformCommissionPaise + fee.astrologerEarningsPaise);
  });

  await t.test("Full fee breakdown: 10 minutes video consultation at ₹25/min (2500 paise)", () => {
    const fee = calculateConsultationFee({
      durationSeconds: 600,
      ratePerMinutePaise: 2500,
      commissionPercent: 10,
    });

    assert.equal(fee.billableMinutes, 10);
    assert.equal(fee.grossAmountPaise, 25000); // ₹250.00
    assert.equal(fee.grossAmountRupees, 250);
    assert.equal(fee.platformCommissionPaise, 2500); // ₹25.00
    assert.equal(fee.astrologerEarningsPaise, 22500); // ₹225.00
    assert.equal(fee.grossAmountPaise, fee.platformCommissionPaise + fee.astrologerEarningsPaise);
  });
});
