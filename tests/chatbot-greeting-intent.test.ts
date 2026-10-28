import test from "node:test";
import assert from "node:assert/strict";
import { classifyQuery, generateGreetingResponse } from "../lib/ai/rag-pipeline";
import { isGreetingQuery } from "../lib/ai/multi-turn-context";
import { askGeminiSupport } from "../lib/ai/gemini-service";

// ─── 1. PURE GREETING DETECTION & CONVERSATIONAL RESPONSES ──────────────────

test("Chatbot Greeting: 'hi' returns friendly welcoming greeting without Google OAuth", async () => {
  const c = classifyQuery("customer", "hi");
  assert.equal(c.intent, "greeting");

  const res = await askGeminiSupport({
    userId: "test-customer-greeting",
    role: "customer",
    query: "hi",
  });

  assert.equal(res.success, true);
  assert.ok(!res.message.includes("Google OAuth"));
  assert.ok(!res.message.includes("reason=role"));
  assert.ok(res.message.includes("Welcome to JyotishSetu"));
  assert.ok(res.message.toLowerCase().includes("how can i help you today"));
});

test("Chatbot Greeting: 'Hi!' with punctuation and capitalization returns greeting", async () => {
  const c = classifyQuery("customer", "Hi!");
  assert.equal(c.intent, "greeting");

  const res = await askGeminiSupport({
    userId: "test-customer-greeting",
    role: "customer",
    query: "Hi!",
  });

  assert.equal(res.success, true);
  assert.ok(!res.message.includes("Google OAuth"));
  assert.ok(res.message.includes("Welcome to JyotishSetu"));
});

test("Chatbot Greeting: 'hello' returns warm concise greeting", async () => {
  const c = classifyQuery("customer", "hello");
  assert.equal(c.intent, "greeting");

  const res = await askGeminiSupport({
    userId: "test-customer-greeting",
    role: "customer",
    query: "hello",
  });

  assert.equal(res.success, true);
  assert.ok(!res.message.includes("Google OAuth"));
  assert.ok(res.message.includes("Welcome to JyotishSetu"));
});

test("Chatbot Greeting: 'hey there' returns friendly greeting", async () => {
  const c = classifyQuery("customer", "hey there");
  assert.equal(c.intent, "greeting");

  const res = await askGeminiSupport({
    userId: "test-customer-greeting",
    role: "customer",
    query: "hey there",
  });

  assert.equal(res.success, true);
  assert.ok(!res.message.includes("Google OAuth"));
  assert.ok(res.message.includes("Welcome to JyotishSetu"));
});

test("Chatbot Greeting: 'namaste' returns traditional respectful greeting", async () => {
  const c = classifyQuery("customer", "namaste");
  assert.equal(c.intent, "greeting");

  const res = await askGeminiSupport({
    userId: "test-customer-greeting",
    role: "customer",
    query: "namaste",
  });

  assert.equal(res.success, true);
  assert.ok(res.message.includes("Namaste!"));
  assert.ok(!res.message.includes("Google OAuth"));
});

test("Chatbot Greeting: 'good morning' returns natural time-appropriate greeting", async () => {
  const c = classifyQuery("customer", "good morning");
  assert.equal(c.intent, "greeting");

  const res = await askGeminiSupport({
    userId: "test-customer-greeting",
    role: "customer",
    query: "good morning",
  });

  assert.equal(res.success, true);
  assert.ok(res.message.includes("Good morning!"));
  assert.ok(!res.message.includes("Google OAuth"));
});

test("Chatbot Greeting: 'hi, how are you?' returns natural conversational response", async () => {
  const c = classifyQuery("customer", "hi, how are you?");
  assert.equal(c.intent, "greeting");

  const res = await askGeminiSupport({
    userId: "test-customer-greeting",
    role: "customer",
    query: "hi, how are you?",
  });

  assert.equal(res.success, true);
  assert.ok(res.message.includes("doing well") || res.message.includes("doing great"));
  assert.ok(!res.message.includes("Google OAuth"));
});

test("Chatbot Greeting: Astrologer greetings are appropriately role-tailored", async () => {
  const c = classifyQuery("astrologer", "namaste");
  assert.equal(c.intent, "greeting");

  const res = await askGeminiSupport({
    userId: "test-astrologer-greeting",
    role: "astrologer",
    query: "namaste",
  });

  assert.equal(res.success, true);
  assert.ok(res.message.includes("Astrologer Support"));
  assert.ok(!res.message.includes("Google OAuth"));
});

// ─── 2. SUBSTANTIVE QUERIES NOT MISCLASSIFIED AS GREETINGS ──────────────────

test("Chatbot Intent: 'hi, I cannot log in with Google' triggers authentication workflow", () => {
  const query = "hi, I cannot log in with Google";
  assert.equal(isGreetingQuery(query), false, "Must not be classified as pure greeting");

  const c = classifyQuery("customer", query);
  assert.notEqual(c.intent, "greeting");
  assert.equal(c.intent, "platform_troubleshooting");
  assert.ok(c.relevantKnowledge.some((k) => k.id === "kb-auth-oauth-role"));
});

test("Chatbot Intent: 'Google login redirects to localhost' triggers relevant OAuth troubleshooting", () => {
  const query = "Google login redirects to localhost";
  const c = classifyQuery("customer", query);
  assert.equal(c.intent, "platform_troubleshooting");
  assert.ok(c.relevantKnowledge.some((k) => k.keywords.includes("oauth") || k.keywords.includes("google")));
});

test("Chatbot Intent: 'Where are my upcoming bookings?' triggers booking assistance", () => {
  const query = "Where are my upcoming bookings?";
  const c = classifyQuery("customer", query);
  assert.equal(c.intent, "live_data_bookings");
  assert.equal(c.category, "booking");
});

test("Chatbot Intent: 'How do I cancel my booking?' triggers cancellation guidance", () => {
  const query = "How do I cancel my booking?";
  const c = classifyQuery("customer", query);
  assert.equal(c.intent, "platform_troubleshooting");
  assert.ok(c.relevantKnowledge.some((k) => k.id === "kb-booking-cancellation-policy"));
});

test("Chatbot Intent: 'What are my birth details?' triggers verified birth data intent", () => {
  const query = "What are my birth details?";
  const c = classifyQuery("customer", query);
  assert.equal(c.intent, "live_data_birth_details");
  assert.equal(c.category, "profile");
});

test("Chatbot Intent: 'Suggest an astrologer for career guidance' triggers recommendation workflow", () => {
  const query = "Suggest an astrologer for career guidance";
  const c = classifyQuery("customer", query);
  assert.equal(c.intent, "recommend_astrologer");
  assert.equal(c.lifeDomain, "career");
  assert.equal(c.preferences?.specialization, "Career");
});

// ─── 3. CONVERSATION ISOLATION & NO STALE STATE LEAKAGE ─────────────────────

test("Chatbot Isolation: New conversation greeting after support discussion does NOT leak previous response", async () => {
  // Simulating an active multi-turn conversation where previous turns discussed Google OAuth and login errors
  const priorHistory = [
    { role: "user" as const, content: "My Google login fails with reason=role error" },
    { role: "assistant" as const, content: "Resolving Google OAuth role redirection or switching accounts: Ensure you visit /customer/login..." },
  ];

  // User sends a new greeting
  const c = classifyQuery("customer", "hello", priorHistory);
  assert.equal(c.intent, "greeting");

  const res = await askGeminiSupport({
    userId: "test-isolation-user",
    role: "customer",
    query: "hello",
    history: priorHistory,
  });

  assert.equal(res.success, true);
  assert.ok(!res.message.includes("Google OAuth"));
  assert.ok(!res.message.includes("reason=role"));
  assert.ok(res.message.includes("Welcome to JyotishSetu"));
});
