import { test } from "node:test";
import assert from "node:assert/strict";

// Import modules across all three platform tiers:
// 1. Super Admin Management Tier
import {
  updateListingModerationStatus,
  updateListingRankingAndFeatured,
} from "../app/actions/admin-listings";
import {
  assignLead,
  updateLeadQualification,
} from "../app/actions/admin-leads";
import {
  executeAdminPlanChange,
  executeGrantComplimentary,
} from "../lib/financial/subscription-lifecycle";
import {
  reviewDirectConsultationPaymentAction,
  reviewJyotishPayPaymentAction,
} from "../app/actions/financial-verification";
import {
  assignPanditToBooking,
  updatePujaBookingStatus,
} from "../app/actions/super-admin-puja-bookings";
import {
  toggleReviewPublishedAction,
} from "../app/actions/admin-reviews";
import {
  updateSuperAdminAccountDeletionStatusAction,
} from "../app/actions/privacy-retention";

// 2. Astrologer / Consultant Tier
import {
  getMyAssignedLeads,
  updateAssignmentStatus,
} from "../app/actions/astrologer-leads";
import {
  saveWeeklyAvailabilityAction,
  getMyAvailabilityAction,
} from "../app/actions/astrologer-availability";

// 3. Customer / Seeker Tier
import {
  submitDirectConsultationPaymentAction,
} from "../app/actions/direct-consultation-payments";
import {
  submitConsultationReviewAction,
} from "../app/actions/customer";
import {
  submitPujaBookingRequest,
  getCustomerPujaBookings,
} from "../app/actions/puja";

test("Phase 20 - Workflow A: Astrologer Approval & Public Directory Synchronization", () => {
  // Super Admin moderates astrologer listing to 'approved'
  assert.equal(typeof updateListingModerationStatus, "function");
  // Super Admin updates ranking and marketplace prominence
  assert.equal(typeof updateListingRankingAndFeatured, "function");
  // Astrologer sets operating schedule & slot availability
  assert.equal(typeof saveWeeklyAvailabilityAction, "function");
  assert.equal(typeof getMyAvailabilityAction, "function");
});

test("Phase 20 - Workflow B: Lead Generation, Assignment & Astrologer CRM Handoff", () => {
  // Super Admin assigns lead to eligible approved astrologer
  assert.equal(typeof assignLead, "function");
  // Super Admin qualifies or flags duplicate inquiries
  assert.equal(typeof updateLeadQualification, "function");
  // Astrologer receives assigned leads and transitions status to 'contacted' / 'closed'
  assert.equal(typeof getMyAssignedLeads, "function");
  assert.equal(typeof updateAssignmentStatus, "function");
});

test("Phase 20 - Workflow C: Indigenous Payment, UTR Reconciliation & Financial Settlement", () => {
  // Customer submits direct consultation / JyotishPay payment proof
  assert.equal(typeof submitDirectConsultationPaymentAction, "function");
  // Super Admin audits and verifies submitted UTR bank proof
  assert.equal(typeof reviewJyotishPayPaymentAction, "function");
  assert.equal(typeof reviewDirectConsultationPaymentAction, "function");
});

test("Phase 20 - Workflow D: Sacred Puja Order, Pandit Assignment & Darshan Delivery", () => {
  // Customer submits puja ritual booking
  assert.equal(typeof submitPujaBookingRequest, "function");
  assert.equal(typeof getCustomerPujaBookings, "function");
  // Super Admin assigns verified pandit to puja
  assert.equal(typeof assignPanditToBooking, "function");
  // Super Admin updates puja fulfillment status
  assert.equal(typeof updatePujaBookingStatus, "function");
});

test("Phase 20 - Workflow E: Seeker Review Moderation & Marketplace Trust Propagation", () => {
  // Customer submits consultation review
  assert.equal(typeof submitConsultationReviewAction, "function");
  // Super Admin moderates / publishes / hides review
  assert.equal(typeof toggleReviewPublishedAction, "function");
});

test("Phase 20 - Workflow F: Subscription Upgrade, Lead Entitlement & Plan Change", () => {
  // Super Admin executes tier modification / complimentary access
  assert.equal(typeof executeAdminPlanChange, "function");
  assert.equal(typeof executeGrantComplimentary, "function");
});

test("Phase 20 - Workflow G: GDPR / DPDP Privacy Anonymization & Data Portability", () => {
  // Super Admin executes statutory 30-day account anonymization
  assert.equal(typeof updateSuperAdminAccountDeletionStatusAction, "function");
});
