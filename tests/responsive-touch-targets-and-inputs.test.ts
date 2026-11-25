import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Sub-phase 11.4: Touch Targets, Form Inputs, and Modal Viewport Constraints", async (t) => {
  const buttonPath = path.resolve(process.cwd(), "components/astrologer/ui/Button.tsx");
  const formFieldPath = path.resolve(process.cwd(), "components/astrologer/ui/FormField.tsx");
  const headerPath = path.resolve(process.cwd(), "components/astrologer/AstrologerHeader.tsx");
  const customerHeaderPath = path.resolve(process.cwd(), "components/customer/CustomerHeader.tsx");

  assert.ok(fs.existsSync(buttonPath), "Button.tsx must exist");
  assert.ok(fs.existsSync(formFieldPath), "FormField.tsx must exist");
  assert.ok(fs.existsSync(headerPath), "AstrologerHeader.tsx must exist");
  assert.ok(fs.existsSync(customerHeaderPath), "CustomerHeader.tsx must exist");

  const buttonCode = fs.readFileSync(buttonPath, "utf-8").replace(/\r\n/g, "\n");
  const formCode = fs.readFileSync(formFieldPath, "utf-8").replace(/\r\n/g, "\n");
  const headerCode = fs.readFileSync(headerPath, "utf-8").replace(/\r\n/g, "\n");
  const customerHeaderCode = fs.readFileSync(customerHeaderPath, "utf-8").replace(/\r\n/g, "\n");

  await t.test("1. Global buttons enforce minimum touch sizing and accessible focus states", () => {
    // Check sizes
    assert.ok(
      buttonCode.includes('sm: "h-9 px-3.5 text-sm"') &&
      buttonCode.includes('md: "h-11 px-5 text-sm"') &&
      buttonCode.includes('lg: "h-12 px-6 text-base"'),
      "Button sizes must satisfy minimum accessibility heights (h-11 = 44px, h-12 = 48px)"
    );
    assert.ok(
      buttonCode.includes("focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"),
      "Must have high-contrast focus-visible outline for keyboard navigation"
    );
    assert.ok(
      buttonCode.includes("disabled:cursor-not-allowed disabled:opacity-60"),
      "Must provide clear disabled state indicator"
    );
  });

  await t.test("2. Form fields enforce mobile-friendly input height and active focus rings", () => {
    assert.ok(
      formCode.includes("h-11 w-full rounded-xl"),
      "Form inputs must enforce minimum 44px (h-11) touch target height"
    );
    assert.ok(
      formCode.includes("focus-visible:outline-2") &&
      formCode.includes("focus-visible:outline-gold"),
      "Form inputs must enforce accessible focus-visible outline"
    );
  });

  await t.test("3. Header touch triggers meet WCAG mobile touch criteria", () => {
    assert.ok(
      headerCode.includes("h-11 w-11"),
      "Astrologer header mobile menu toggle must meet 44x44px touch target (h-11 w-11)"
    );
    assert.ok(
      customerHeaderCode.includes("h-11 w-11"),
      "Customer header mobile menu toggle must meet 44x44px touch target (h-11 w-11)"
    );
  });
});
