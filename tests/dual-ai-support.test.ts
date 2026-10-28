import test from "node:test";
import assert from "node:assert/strict";
import { classifyQuery, retrieveRelevantKnowledge } from "../lib/ai/rag-pipeline";
import { PLATFORM_KNOWLEDGE_BASE } from "../lib/ai/knowledge-base";
import { askGeminiSupport } from "../lib/ai/gemini-service";
import { getProfileCompletion } from "../lib/astrologer/profile-completion";
import type { AstrologerProfile } from "../lib/types/database.types";

// ─── 1. ROLE ISOLATION & KNOWLEDGE BOUNDARIES ─────────────────────────────────
test("Dual AI: Customer role only retrieves customer-applicable knowledge", () => {
  const customerKnowledge = retrieveRelevantKnowledge("customer", "How do I check my leads?", 5);
  // Leads management is strictly an astrologer capability
  assert.ok(
    customerKnowledge.every((k) => k.applicableRoles.includes("customer")),
    "Customer knowledge items must only be applicable to customer"
  );
  assert.ok(
    !customerKnowledge.some((k) => k.id === "kb-astro-leads-enquiries"),
    "Customer should not be served astrologer internal lead management articles"
  );
});

test("Dual AI: Astrologer role retrieves operational and consultant knowledge", () => {
  const astroKnowledge = retrieveRelevantKnowledge("astrologer", "How do I manage my leads and enquiries?", 5);
  assert.ok(
    astroKnowledge.some((k) => k.id === "kb-astro-leads-enquiries"),
    "Astrologer knowledge must include lead management for consultants"
  );
  assert.ok(
    astroKnowledge.every((k) => k.applicableRoles.includes("astrologer")),
    "All retrieved items must be applicable to astrologers"
  );
});

// ─── 2. ASTROLOGER PROFILE COMPLETION CHECKLIST ──────────────────────────────
test("Dual AI: Classifies profile completion checklist query correctly", () => {
  const queries = [
    "Check my profile completion checklist",
    "What is missing in my profile?",
    "Why is my profile not 100% complete?",
    "Profile checklist kya baki hai?",
  ];

  for (const q of queries) {
    const c = classifyQuery("astrologer", q);
    assert.equal(
      c.intent,
      "live_data_profile_completion",
      `Expected 'live_data_profile_completion' for query: ${q}`
    );
    assert.equal(c.category, "profile");
  }
});

test("Dual AI: Profile completion percentage calculation enforces all 5 fields", () => {
  const incompleteProfile: AstrologerProfile = {
    id: "astro-test-1",
    user_id: "user-test-1",
    slug: "pandit-test",
    display_name: "Pandit Test Sharma",
    bio: "Experienced Vedic astrologer from Varanasi specializing in Prashna.",
    experience_years: 12,
    specializations: ["Vedic", "Kundli"],
    languages: ["Hindi"],
    city: "Varanasi",
    state: "Uttar Pradesh",
    address: null,
    consultation_fee: null, // Missing!
    profile_photo_url: null, // Missing!
    approval_status: "draft",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { items, percent } = getProfileCompletion(incompleteProfile);
  assert.equal(percent, 60); // 3 of 5 done: Basic info, Specializations, Languages
  const feeItem = items.find((i) => i.label === "Consultation fee");
  assert.equal(feeItem?.done, false);
  const photoItem = items.find((i) => i.label === "Profile photo");
  assert.equal(photoItem?.done, false);

  // Complete the remaining fields
  const completeProfile: AstrologerProfile = {
    ...incompleteProfile,
    consultation_fee: 1000,
    profile_photo_url: "https://example.com/avatar.jpg",
  };

  const completed = getProfileCompletion(completeProfile);
  assert.equal(completed.percent, 100);
  assert.ok(completed.items.every((i) => i.done === true));
});

// ─── 3. ASTROLOGER VERIFICATION LIFECYCLE & STATUSES ─────────────────────────
test("Dual AI: Explains all 6 astrologer verification statuses", () => {
  const kb = PLATFORM_KNOWLEDGE_BASE.find((k) => k.id === "kb-astro-verification-states");
  assert.ok(kb, "Must have kb-astro-verification-states in knowledge base");
  assert.ok(kb.solutionSteps.some((s) => s.includes("Draft")), "Must explain Draft state");
  assert.ok(kb.solutionSteps.some((s) => s.includes("Pending")), "Must explain Pending state");
  assert.ok(kb.solutionSteps.some((s) => s.includes("Changes Requested")), "Must explain Changes Requested state");
  assert.ok(kb.solutionSteps.some((s) => s.includes("Approved")), "Must explain Approved state");
  assert.ok(kb.solutionSteps.some((s) => s.includes("Rejected")), "Must explain Rejected state");
  assert.ok(kb.solutionSteps.some((s) => s.includes("Suspended")), "Must explain Suspended state");
});

test("Dual AI: Astrologer multi-turn status follow-up detection", () => {
  const history = [
    { role: "user", content: "Is my astrologer profile active?" },
    { role: "assistant", content: "Your profile status is currently [PENDING] administrative review." },
  ];

  const followUpQuery = "Why is it pending and when will it be approved?";
  const c = classifyQuery("astrologer", followUpQuery, history);
  assert.equal(c.intent, "live_data_profile_status");
  assert.equal(c.category, "profile");
});

// ─── 4. CONSULTATION BOOKINGS & VIRTUAL ROOMS ─────────────────────────────────
test("Dual AI: Correctly dispatches live_data_bookings for Astrologers", () => {
  const c = classifyQuery("astrologer", "Show my upcoming consultation bookings schedule");
  assert.equal(c.intent, "live_data_bookings");
  assert.equal(c.category, "booking");
});

test("Dual AI: Multi-turn bookings follow-up detection for Astrologers", () => {
  const history = [
    { role: "user", content: "Check my astrologer dashboard overview." },
    { role: "assistant", content: "Here is your dashboard overview." },
  ];

  const c = classifyQuery("astrologer", "What about my bookings? Any calls today?", history);
  assert.equal(c.intent, "live_data_bookings");
});

test("Dual AI: Virtual consultation room instructions and 15-minute window", () => {
  const kb = PLATFORM_KNOWLEDGE_BASE.find((k) => k.id === "kb-astro-consultation-rooms");
  assert.ok(kb, "Must have kb-astro-consultation-rooms");
  assert.ok(
    kb.solutionSteps.some((s) => s.includes("15 minutes")),
    "Must explain 15-minute unlock window before Muhurat slot"
  );
  assert.ok(
    kb.solutionSteps.some((s) => s.includes("Camera and Microphone")),
    "Must include camera & mic permissions guidance"
  );
  assert.ok(
    kb.solutionSteps.some((s) => s.includes("no-show") || s.includes("attendance")),
    "Must include seeker no-show logging guidance"
  );
});

// ─── 5. EARNINGS & SETTLEMENT POLICY (FACTUAL & ZERO FABRICATION) ────────────
test("Dual AI: Classifies earnings queries and explains weekly batch reconciliation", async () => {
  const query = "What are my total consultation earnings and when is payout?";
  const c = classifyQuery("astrologer", query);

  assert.equal(c.intent, "live_data_earnings");
  assert.equal(c.category, "billing");

  // Check fallback text explains weekly reconciliation and avoids fake gateway balances
  const res = await askGeminiSupport({
    userId: "test-astro-earnings",
    role: "astrologer",
    query,
  });

  assert.equal(res.success, true);
  assert.ok(
    res.message.includes("Consultation Earnings") || res.message.includes("weekly"),
    "Must explain consultation earnings and weekly reconciliation"
  );
  assert.ok(
    res.message.includes("/astrologer/earnings"),
    "Must reference the authoritative earnings tab"
  );
});

test("Dual AI: Astrologer multi-turn earnings follow-up detection", () => {
  const history = [
    { role: "user", content: "I completed three Vedic consultation calls this week." },
    { role: "assistant", content: "Great to hear! Completed sessions are logged in your consultation history." },
  ];

  const c = classifyQuery("astrologer", "How much did I earn? Show my payout", history);
  assert.equal(c.intent, "live_data_earnings");
  assert.equal(c.category, "billing");
});

// ─── 6. DHARMIC CONDUCT & QUALITY STANDARDS ──────────────────────────────────
test("Dual AI: Enforces Dharmic conduct, confidentiality, and anti-fear-mongering rules", () => {
  const kb = PLATFORM_KNOWLEDGE_BASE.find((k) => k.id === "kb-astro-conduct-quality-standards");
  assert.ok(kb, "Must have kb-astro-conduct-quality-standards");
  assert.ok(
    kb.solutionSteps.some((s) => s.includes("Confidentiality")),
    "Must mandate absolute seeker confidentiality"
  );
  assert.ok(
    kb.solutionSteps.some((s) => s.includes("Fear-Mongering")),
    "Must prohibit fear-mongering with Doshas"
  );
  assert.ok(
    kb.solutionSteps.some((s) => s.includes("Medical & Financial")),
    "Must prohibit prescribing medical treatments or guaranteed returns"
  );
});

// ─── 7. SUPER ADMIN ESCALATION ───────────────────────────────────────────────
test("Dual AI: Detects human escalation and suggests support ticket creation", () => {
  const c = classifyQuery("astrologer", "I need to talk to the Super Admin manager to unblock my account");
  assert.equal(c.intent, "human_escalation");
  assert.equal(c.suggestedAction, "escalate");
  assert.equal(c.priority, "high");
});

