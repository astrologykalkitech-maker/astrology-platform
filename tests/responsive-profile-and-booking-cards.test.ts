import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Sub-phase 11.2: Astrologer Profile & Consultation Booking Responsive Cards", async (t) => {
  const profilePagePath = path.resolve(
    process.cwd(),
    "app/customer/(portal)/astrologers/[slug]/page.tsx"
  );
  const bookingModalPath = path.resolve(
    process.cwd(),
    "components/customer/AstrologerBookingModal.tsx"
  );
  const bookingCtaPath = path.resolve(
    process.cwd(),
    "components/customer/AstrologerProfileBookingCta.tsx"
  );

  assert.ok(fs.existsSync(profilePagePath), "Astrologer profile page must exist");
  assert.ok(fs.existsSync(bookingModalPath), "AstrologerBookingModal.tsx must exist");
  assert.ok(fs.existsSync(bookingCtaPath), "AstrologerProfileBookingCta.tsx must exist");

  const profileCode = fs.readFileSync(profilePagePath, "utf-8").replace(/\r\n/g, "\n");
  const modalCode = fs.readFileSync(bookingModalPath, "utf-8").replace(/\r\n/g, "\n");
  const ctaCode = fs.readFileSync(bookingCtaPath, "utf-8").replace(/\r\n/g, "\n");

  await t.test("1. Astrologer profile page implements responsive breakpoint grid collapse", () => {
    assert.ok(
      profileCode.includes("grid grid-cols-1 lg:grid-cols-3 gap-6"),
      "Profile layout must collapse to 1 column on mobile and expand to 3 columns on lg viewports"
    );
    assert.ok(
      profileCode.includes("flex flex-col sm:flex-row items-start gap-6"),
      "Hero avatar and bio card must flex vertically on mobile and horizontally on sm screens"
    );
    assert.ok(
      profileCode.includes("grid grid-cols-1 sm:grid-cols-2 gap-4"),
      "Vedic methodology cards must collapse to single column on mobile and 2 on tablet"
    );
  });

  await t.test("2. Astrologer booking modal conforms to mobile viewport constraints and padding", () => {
    assert.ok(
      modalCode.includes("fixed inset-0 z-50 flex items-center justify-center p-4"),
      "Modal overlay must center with p-4 safe margin on mobile viewports"
    );
    assert.ok(
      modalCode.includes("relative w-full max-w-lg rounded-2xl"),
      "Modal card must occupy full width up to max-w-lg"
    );
    assert.ok(
      modalCode.includes("grid grid-cols-3 gap-2"),
      "Mode selector must arrange in a responsive 3-column grid"
    );
    assert.ok(
      modalCode.includes("grid grid-cols-4 gap-2"),
      "Duration selector must arrange in a responsive 4-column grid"
    );
    assert.ok(
      modalCode.includes("grid grid-cols-2 gap-3"),
      "Date and Time selectors must share 2-column layout"
    );
  });

  await t.test("3. Booking CTA triggers modal state toggle seamlessly", () => {
    assert.ok(
      ctaCode.includes("const [isModalOpen, setIsModalOpen] = useState(false)"),
      "Booking CTA must maintain modal open state"
    );
    assert.ok(
      ctaCode.includes("<AstrologerBookingModal"),
      "Booking CTA must render AstrologerBookingModal"
    );
  });
});
