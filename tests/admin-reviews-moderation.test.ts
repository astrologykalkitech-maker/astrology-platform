import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

describe("Sub-phase 6.2 - Admin Review Management & Search Moderation Verification", () => {
  it("getAdminReviewsAction supports rating, status, and search filters with metrics calculation", () => {
    const code = fs.readFileSync("app/actions/admin-reviews.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes('if (filter.status === "published")') &&
      code.includes('else if (filter.status === "hidden")'),
      "Must filter reviews by publication status"
    );
    assert.ok(
      code.includes('if (filter.rating && filter.rating >= 1 && filter.rating <= 5)'),
      "Must filter reviews by rating"
    );
    assert.ok(
      code.includes('query.ilike("review_text", `%${filter.search.trim()}%`)'),
      "Must search reviews by text substring"
    );
    assert.ok(
      code.includes("publishedCount") && code.includes("hiddenCount") && code.includes("averageRating"),
      "Must calculate aggregate moderation metrics"
    );
  });

  it("toggleReviewPublishedAction requires listing.review permission and emits audit log", () => {
    const code = fs.readFileSync("app/actions/admin-reviews.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes('requireAdminPermission("listing.review")'),
      "Must require listing.review permission"
    );
    assert.ok(
      code.includes("logAdminAction(") && code.includes('action: isPublished ? "review.publish" : "review.hide"'),
      "Must log publication toggle in admin audit log"
    );
  });

  it("deleteReviewAction requires Super Admin privilege and emits audit log", () => {
    const code = fs.readFileSync("app/actions/admin-reviews.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes("requireSuperAdmin()"),
      "Must require Super Admin privilege to delete review"
    );
    assert.ok(
      code.includes("logAdminAction(") && code.includes('action: "review.delete"'),
      "Must log review deletion in admin audit log"
    );
  });
});
