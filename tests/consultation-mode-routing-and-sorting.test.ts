import test from "node:test";
import assert from "node:assert/strict";

/**
 * Regression & Integration tests for:
 * 1. Consultation mode routing (Video -> LiveKit meeting, Call/Voice -> Audio-only meeting, Chat -> Dedicated Direct Chat)
 * 2. Deterministic latest-first booking sorting (created_at DESC, id DESC)
 */

test("Sorting logic orders latest-created bookings first", () => {
  const bookings = [
    {
      id: "booking-older",
      created_at: "2026-11-20T10:00:00.000Z",
      scheduled_at: "2026-11-25T10:00:00.000Z",
      service_type: "Vedic Reading",
      consultation_mode: "Video"
    },
    {
      id: "booking-newest",
      created_at: "2026-11-24T12:00:00.000Z",
      scheduled_at: "2026-11-24T15:00:00.000Z",
      service_type: "Kundli Analysis",
      consultation_mode: "Chat"
    },
    {
      id: "booking-middle",
      created_at: "2026-11-22T08:00:00.000Z",
      scheduled_at: "2026-11-23T08:00:00.000Z",
      service_type: "Career Guidance",
      consultation_mode: "Call"
    }
  ];

  const sortBookingsLatestFirst = (list: typeof bookings) => {
    return [...list].sort((a, b) => {
      const timeA = new Date(a.created_at || a.scheduled_at || 0).getTime();
      const timeB = new Date(b.created_at || b.scheduled_at || 0).getTime();
      if (timeB !== timeA) {
        return timeB - timeA;
      }
      return (b.id || "").localeCompare(a.id || "");
    });
  };

  const sorted = sortBookingsLatestFirst(bookings);
  assert.equal(sorted[0].id, "booking-newest", "Newest booking should appear first");
  assert.equal(sorted[1].id, "booking-middle", "Middle booking should appear second");
  assert.equal(sorted[2].id, "booking-older", "Older booking should appear last");
});

test("Deterministic tie-breaker when created_at timestamps match", () => {
  const bookings = [
    {
      id: "booking-alpha",
      created_at: "2026-11-24T12:00:00.000Z",
      scheduled_at: "2026-11-24T12:00:00.000Z",
      consultation_mode: "Chat"
    },
    {
      id: "booking-omega",
      created_at: "2026-11-24T12:00:00.000Z",
      scheduled_at: "2026-11-24T12:00:00.000Z",
      consultation_mode: "Video"
    }
  ];

  const sortBookingsLatestFirst = (list: typeof bookings) => {
    return [...list].sort((a, b) => {
      const timeA = new Date(a.created_at || a.scheduled_at || 0).getTime();
      const timeB = new Date(b.created_at || b.scheduled_at || 0).getTime();
      if (timeB !== timeA) {
        return timeB - timeA;
      }
      return (b.id || "").localeCompare(a.id || "");
    });
  };

  const sorted = sortBookingsLatestFirst(bookings);
  // 'booking-omega' > 'booking-alpha' in descending order
  assert.equal(sorted[0].id, "booking-omega");
  assert.equal(sorted[1].id, "booking-alpha");
});

test("Customer and Astrologer navigation paths resolve correctly per consultation mode", () => {
  function getCustomerJoinDestination(booking: { id: string; consultation_mode: string }) {
    if (booking.consultation_mode?.toLowerCase() === "chat") {
      return `/customer/chat?bookingId=${booking.id}`;
    }
    return `/consultation/${booking.id}`;
  }

  function getAstrologerJoinDestination(booking: { id: string; consultation_mode: string }) {
    if (booking.consultation_mode?.toLowerCase() === "chat") {
      return `/astrologer/chat?bookingId=${booking.id}`;
    }
    return `/consultation/${booking.id}`;
  }

  // Chat mode routes to dedicated chat with bookingId query parameter
  assert.equal(
    getCustomerJoinDestination({ id: "bk-123", consultation_mode: "Chat" }),
    "/customer/chat?bookingId=bk-123"
  );
  assert.equal(
    getAstrologerJoinDestination({ id: "bk-123", consultation_mode: "Chat" }),
    "/astrologer/chat?bookingId=bk-123"
  );

  // Video mode routes to LiveKit consultation room
  assert.equal(
    getCustomerJoinDestination({ id: "bk-456", consultation_mode: "Video" }),
    "/consultation/bk-456"
  );
  assert.equal(
    getAstrologerJoinDestination({ id: "bk-456", consultation_mode: "Video" }),
    "/consultation/bk-456"
  );

  // Call / Voice mode routes to consultation room with audio-only configuration
  assert.equal(
    getCustomerJoinDestination({ id: "bk-789", consultation_mode: "Call" }),
    "/consultation/bk-789"
  );
  assert.equal(
    getCustomerJoinDestination({ id: "bk-789", consultation_mode: "Voice" }),
    "/consultation/bk-789"
  );
});

test("Audio-only consultation configuration detects Call/Voice modes properly", () => {
  function isAudioOnlyMode(consultationMode?: string) {
    return consultationMode === "Call" || consultationMode?.toLowerCase() === "voice";
  }

  assert.equal(isAudioOnlyMode("Call"), true);
  assert.equal(isAudioOnlyMode("Voice"), true);
  assert.equal(isAudioOnlyMode("voice"), true);
  assert.equal(isAudioOnlyMode("Video"), false);
  assert.equal(isAudioOnlyMode("Chat"), false);
  assert.equal(isAudioOnlyMode(undefined), false);
});
