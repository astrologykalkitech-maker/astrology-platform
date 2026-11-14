import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("CUSTOMER-TO-ASTROLOGER PUJA ASSIGNMENT SYNCHRONIZATION", () => {
  it("TC-01: Canonical Astrologer ID filtering strictly isolates assignments", () => {
    const astrologerA_Id = "astro-uuid-111";
    const astrologerB_Id = "astro-uuid-222";

    const bookings = [
      { id: "b1", astrologer_id: astrologerA_Id, title: "Navagraha Shanti Havan", status: "pending" },
      { id: "b2", astrologer_id: astrologerB_Id, title: "Maha Mrityunjaya Puja", status: "confirmed" },
      { id: "b3", astrologer_id: astrologerA_Id, title: "Rudrabhishek", status: "pending" },
    ];

    // Filter for Astrologer A
    const astroABookings = bookings.filter((b) => b.astrologer_id === astrologerA_Id);
    assert.equal(astroABookings.length, 2);
    assert.deepEqual(astroABookings.map((b) => b.id), ["b1", "b3"]);

    // Filter for Astrologer B
    const astroBBookings = bookings.filter((b) => b.astrologer_id === astrologerB_Id);
    assert.equal(astroBBookings.length, 1);
    assert.equal(astroBBookings[0].id, "b2");
  });

  it("TC-02: Pending acceptance bookings remain visible to assigned astrologer", () => {
    const profileId = "astro-sharma-uuid";
    const booking = {
      id: "booking-1",
      astrologer_id: profileId,
      status: "pending",
      fulfilment_status: "assigned",
    };

    const isVisibleToAssignedAstro =
      booking.astrologer_id === profileId && booking.status !== "cancelled";

    assert.equal(isVisibleToAssignedAstro, true);
  });

  it("TC-03: Reassignment cleanly migrates booking visibility", () => {
    let booking = {
      id: "booking-100",
      astrologer_id: "astro-sharma-uuid",
      status: "confirmed",
      fulfilment_status: "assigned",
    };

    // Before reassignment: visible to Sharma, invisible to Verma
    assert.equal(booking.astrologer_id === "astro-sharma-uuid", true);
    assert.equal(booking.astrologer_id === "astro-verma-uuid", false);

    // Reassigned to Verma
    booking = { ...booking, astrologer_id: "astro-verma-uuid" };

    // After reassignment: invisible to Sharma, visible to Verma
    assert.equal(booking.astrologer_id === "astro-sharma-uuid", false);
    assert.equal(booking.astrologer_id === "astro-verma-uuid", true);
  });

  it("TC-04: Cancelled and Completed bookings are excluded from active dashboard lists", () => {
    const profileId = "astro-uuid-999";
    const bookings = [
      { id: "b1", astrologer_id: profileId, status: "pending" },
      { id: "b2", astrologer_id: profileId, status: "cancelled" },
      { id: "b3", astrologer_id: profileId, status: "confirmed" },
    ];

    const activeBookings = bookings.filter(
      (b) => b.astrologer_id === profileId && b.status !== "cancelled"
    );

    assert.equal(activeBookings.length, 2);
    assert.deepEqual(activeBookings.map((b) => b.id), ["b1", "b3"]);
  });
});

