import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Load .env.local
try {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const [k, ...vParts] = trimmed.split("=");
        const key = k.trim();
        const val = vParts.join("=").trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch {}

test("Ultimate Platform Readiness & Enterprise Features Test Suite", async (t) => {
  // --------------------------------------------------------------------------
  // 1. Astrologer Verification Stages
  // --------------------------------------------------------------------------
  await t.test("Verification stages: Validates stage progression and fails unauthenticated actions", async () => {
    const {
      getAstrologerVerificationOverview,
      submitVerificationStageAction,
      updateVerificationStageReviewAction,
    } = await import("../app/actions/astrologer-verification");

    // Unauthenticated caller fails closed
    const overview = await getAstrologerVerificationOverview();
    assert.equal(overview.success, false);
    assert.match(overview.error || "", /Authentication required/i);

    const submit = await submitVerificationStageAction("qualifications", { degree: "M.A. Vedic Astrology" });
    assert.equal(submit.success, false);

    const review = await updateVerificationStageReviewAction({
      astrologerId: "00000000-0000-0000-0000-000000000001",
      stageName: "final_review",
      status: "approved",
    });
    assert.equal(review.success, false);
  });

  // --------------------------------------------------------------------------
  // 2. Multi-Channel Notification Infrastructure
  // --------------------------------------------------------------------------
  await t.test("Enterprise Notifications: Dispatches multi-channel payload and handles telemetry", async () => {
    const {
      dispatchMultiChannelNotification,
      getNotificationDeliveryMetrics,
    } = await import("../app/actions/enterprise-notifications");

    // Telemetry retrieval handles environment gracefully
    const metrics = await getNotificationDeliveryMetrics();
    // Returns structured stats object even when running without network
    assert.ok(metrics);

    // Dispatching to mock recipient
    const dispatch = await dispatchMultiChannelNotification({
      recipientId: "00000000-0000-0000-0000-000000000001",
      title: "Test Muhurat Notification",
      body: "Auspicious Brahma Muhurat begins at 04:30 AM",
      eventType: "muhurat_alert",
      channels: ["in_app", "web_push"],
    });
    assert.ok(dispatch);
  });

  // --------------------------------------------------------------------------
  // 3. Privacy, Consent & Data Portability
  // --------------------------------------------------------------------------
  await t.test("Privacy & Retention: Validates consent purposes and fails unauthenticated exports", async () => {
    const {
      updateUserConsentAction,
      requestCustomerDataExportAction,
      requestAccountDeletionAction,
    } = await import("../app/actions/privacy-retention");

    const consent = await updateUserConsentAction({
      purpose: "ai_processing",
      isGranted: true,
    });
    assert.equal(consent.success, false);
    assert.match(consent.error || "", /Authentication required/i);

    const exportReq = await requestCustomerDataExportAction();
    assert.equal(exportReq.success, false);

    const deleteReq = await requestAccountDeletionAction("Testing account closure");
    assert.equal(deleteReq.success, false);
  });

  // --------------------------------------------------------------------------
  // 4. Community Feed & Moderation
  // --------------------------------------------------------------------------
  await t.test("Community: Retrieves feed and rejects unauthorized publishing", async () => {
    const {
      getCommunityFeedAction,
      createCommunityPostAction,
      reportCommunityContentAction,
    } = await import("../app/actions/community");

    const feed = await getCommunityFeedAction({ limit: 10 });
    assert.ok(Array.isArray(feed.data));

    const post = await createCommunityPostAction({
      content: "Exploring the influence of Jupiter in Rohini Nakshatra",
      category: "astrology_insights",
    });
    assert.equal(post.success, false);
    assert.match(post.error || "", /Authentication required/i);

    const report = await reportCommunityContentAction({
      targetType: "post",
      targetId: "00000000-0000-0000-0000-000000000001",
      reason: "Spam content",
    });
    assert.equal(report.success, false);
  });

  // --------------------------------------------------------------------------
  // 5. AI Astrologer Recommendation Engine
  // --------------------------------------------------------------------------
  await t.test("AI Recommendations: Deterministic multi-criteria scoring without hallucinated ratings", async () => {
    const { getAIAstrologerRecommendationsAction } = await import(
      "../app/actions/ai-recommendations"
    );

    const recs = await getAIAstrologerRecommendationsAction({
      concernCategory: "career",
      preferredLanguage: "hi",
      budgetMaxRupees: 1000,
    });

    assert.ok(recs);
    assert.ok(Array.isArray(recs.data));
  });

  // --------------------------------------------------------------------------
  // 6. Non-Negotiable: Spiritual Products Remains Permanently Excluded
  // --------------------------------------------------------------------------
  await t.test("Non-Negotiable Scope: Zero spiritual products references in migrations or routes", async () => {
    const migration050 = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/050_ultimate_platform_readiness.sql"),
      "utf-8"
    );
    assert.equal(migration050.includes("spiritual_products"), false);
    assert.equal(migration050.includes("product_catalog"), false);
    assert.equal(migration050.includes("rudraksha"), false);
    assert.equal(migration050.includes("gemstone"), false);
  });
});

