import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 2.1 & 2.2: Customer Booking Modal & Direct Profile CTA", () => {
  const modalPath = path.resolve(process.cwd(), "components/customer/AstrologerBookingModal.tsx");
  const ctaPath = path.resolve(process.cwd(), "components/customer/AstrologerProfileBookingCta.tsx");
  const profilePath = path.resolve(process.cwd(), "app/customer/(portal)/astrologers/[slug]/page.tsx");

  const modalContent = fs.readFileSync(modalPath, "utf-8");
  const ctaContent = fs.readFileSync(ctaPath, "utf-8");
  const profileContent = fs.readFileSync(profilePath, "utf-8");

  it("modal imports and calls createCustomerBookingAction with selected mode, date, and duration", () => {
    assert.match(
      modalContent,
      /import \{ createCustomerBookingAction \} from "@\/app\/actions\/customer";/,
      "Must import createCustomerBookingAction"
    );
    assert.match(
      modalContent,
      /await createCustomerBookingAction\(\{[\s\S]*?astrologer_id: astrologerId,[\s\S]*?consultation_mode: mode,[\s\S]*?duration_minutes: duration,/m,
      "Must call createCustomerBookingAction with customer selections"
    );
  });

  it("astrologer profile mounts AstrologerProfileBookingCta connecting direct booking", () => {
    assert.match(
      profileContent,
      /<AstrologerProfileBookingCta[\s\S]*?astrologerId=\{astro\.id\}/m,
      "Must render AstrologerProfileBookingCta on profile"
    );
    assert.match(
      ctaContent,
      /<AstrologerBookingModal[\s\S]*?astrologerId=\{astrologerId\}/m,
      "Must render AstrologerBookingModal in CTA"
    );
  });
});
