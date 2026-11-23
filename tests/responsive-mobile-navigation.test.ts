import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Sub-phase 11.1: Mobile Navigation, Sticky Bottom Bars, and Drawer Menus", async (t) => {
  const customerNavPath = path.resolve(process.cwd(), "components/customer/CustomerBottomNav.tsx");
  const astrologerNavPath = path.resolve(process.cwd(), "components/astrologer/BottomNav.tsx");
  const adminSidebarPath = path.resolve(process.cwd(), "components/admin/AdminSidebar.tsx");

  assert.ok(fs.existsSync(customerNavPath), "CustomerBottomNav.tsx must exist");
  assert.ok(fs.existsSync(astrologerNavPath), "BottomNav.tsx must exist");
  assert.ok(fs.existsSync(adminSidebarPath), "AdminSidebar.tsx must exist");

  const customerCode = fs.readFileSync(customerNavPath, "utf-8").replace(/\r\n/g, "\n");
  const astrologerCode = fs.readFileSync(astrologerNavPath, "utf-8").replace(/\r\n/g, "\n");
  const adminCode = fs.readFileSync(adminSidebarPath, "utf-8").replace(/\r\n/g, "\n");

  await t.test("1. Customer bottom navigation provides mobile sticky bar with safe-area insets", () => {
    assert.ok(
      customerCode.includes("fixed inset-x-0 bottom-0 z-20") &&
      customerCode.includes("pb-[env(safe-area-inset-bottom)]") &&
      customerCode.includes("lg:hidden"),
      "Customer bottom nav must be fixed to bottom on mobile and hidden on desktop (lg:hidden)"
    );
    assert.ok(
      customerCode.includes('aria-label="Mobile navigation"'),
      "Must have accessible nav label"
    );
    assert.ok(
      customerCode.includes('aria-current={active ? "page" : undefined}'),
      "Must set aria-current for active destination"
    );
  });

  await t.test("2. Astrologer bottom navigation provides mobile sticky bar with active tab indicators", () => {
    assert.ok(
      astrologerCode.includes("fixed inset-x-0 bottom-0 z-20") &&
      astrologerCode.includes("pb-[env(safe-area-inset-bottom)]") &&
      astrologerCode.includes("lg:hidden"),
      "Astrologer bottom nav must be fixed on mobile and hidden on desktop (lg:hidden)"
    );
    assert.ok(
      astrologerCode.includes("min-h-14"),
      "Must satisfy touch target sizing (min-h-14 / 56px)"
    );
    assert.ok(
      astrologerCode.includes('aria-current={active ? "page" : undefined}'),
      "Must set aria-current on active link"
    );
  });

  await t.test("3. Super Admin responsive sidebar transforms into slide-over drawer on mobile", () => {
    assert.ok(
      adminCode.includes("fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw]") &&
      adminCode.includes("lg:hidden"),
      "Mobile sidebar must render as slide-over drawer constrained to max-w-[85vw]"
    );
    assert.ok(
      adminCode.includes('open ? "translate-x-0" : "-translate-x-full"'),
      "Drawer must animate via translate-x transition"
    );
    assert.ok(
      adminCode.includes("hidden lg:flex flex-col w-64"),
      "Desktop view must render persistent static sidebar"
    );
    assert.ok(
      adminCode.includes('aria-label="Close navigation overlay"'),
      "Backdrop must include accessible close button"
    );
  });
});
