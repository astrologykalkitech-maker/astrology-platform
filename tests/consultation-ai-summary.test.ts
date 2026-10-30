import test from "node:test";
import assert from "node:assert/strict";

test("Consultation AI Summary: Review and approval lifecycle", () => {
  interface Summary {
    id: string;
    bookingId: string;
    astrologerId: string;
    customerId: string;
    summary: string;
    isApproved: boolean;
    approvedAt: string | null;
  }

  const draft: Summary = {
    id: "sum_1",
    bookingId: "b_1",
    astrologerId: "astro_1",
    customerId: "cust_1",
    summary: "Consultation on career and marriage prospects.",
    isApproved: false,
    approvedAt: null,
  };

  // Rule: Customer requesting unapproved summary receives null/undefined
  function getCustomerView(summary: Summary, callerId: string): Summary | null {
    if (summary.customerId === callerId) {
      return summary.isApproved ? summary : null;
    }
    return null;
  }

  // Before approval: Customer cannot see draft summary
  assert.equal(getCustomerView(draft, "cust_1"), null);

  // Astrologer reviews and approves
  function approveSummary(summary: Summary, astrologerId: string): Summary {
    if (summary.astrologerId !== astrologerId) {
      throw new Error("Unauthorized");
    }
    return {
      ...summary,
      isApproved: true,
      approvedAt: new Date().toISOString(),
    };
  }

  const approved = approveSummary(draft, "astro_1");
  assert.equal(approved.isApproved, true);
  assert.ok(approved.approvedAt);

  // After approval: Customer can view finalized summary
  const visibleToCustomer = getCustomerView(approved, "cust_1");
  assert.ok(visibleToCustomer);
  assert.equal(visibleToCustomer.isApproved, true);
  assert.equal(visibleToCustomer.summary, "Consultation on career and marriage prospects.");
});

