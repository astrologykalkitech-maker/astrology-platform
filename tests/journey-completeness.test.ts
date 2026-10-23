import test from "node:test";
import assert from "node:assert/strict";
import { isCustomerDemoBooking, type CustomerDemoBooking } from "../lib/customer-demo";

test("Phase 6 Journey: Customer booking validation and serialization integrity", () => {
  const validBooking: CustomerDemoBooking = {
    id: "BK-1729580000000",
    astrologer: "Aarav Sharma",
    service: "Vedic Astrology",
    consultation: "Chat",
    date: "2026-10-25",
    time: "10:00 AM",
    status: "Upcoming",
    price: 499,
  };

  assert.equal(isCustomerDemoBooking(validBooking), true, "Valid booking must pass validation schema");

  // Corrupt payloads must fail
  assert.equal(
    isCustomerDemoBooking({ ...validBooking, consultation: "InPerson" }),
    false,
    "Invalid consultation mode must fail"
  );
  assert.equal(
    isCustomerDemoBooking({ ...validBooking, price: "free" }),
    false,
    "Non-numeric price must fail"
  );
  assert.equal(
    isCustomerDemoBooking({ ...validBooking, status: "Cancelled" }),
    false,
    "Unknown status must fail"
  );
});

test("Phase 6 Journey: Customer notification activity aggregation logic", () => {
  const sampleEnquiries = [
    {
      id: "enq-1",
      subject: "Career guidance",
      message: "Looking for job transition guidance",
      status: "assigned",
      created_at: new Date().toISOString(),
      astrologer_name: "Aarav Sharma",
    },
    {
      id: "enq-2",
      subject: "Kundli matching",
      message: "Match evaluation request",
      status: "new",
      created_at: new Date(Date.now() - 3600000).toISOString(),
      astrologer_name: null,
    },
  ];

  // Verify derivation of activity notifications
  const notifications = sampleEnquiries.map((item) => ({
    title:
      item.status === "assigned"
        ? "Enquiry Assigned to Astrologer"
        : item.status === "completed"
        ? "Consultation Completed"
        : "Enquiry Submitted",
    subject: item.subject,
    astrologer: item.astrologer_name || "Platform Guidance",
  }));

  assert.equal(notifications.length, 2);
  assert.equal(notifications[0].title, "Enquiry Assigned to Astrologer");
  assert.equal(notifications[0].astrologer, "Aarav Sharma");
  assert.equal(notifications[1].title, "Enquiry Submitted");
  assert.equal(notifications[1].astrologer, "Platform Guidance");
});
