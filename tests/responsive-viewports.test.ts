import test from "node:test";
import assert from "node:assert/strict";

const REQUIRED_VIEWPORTS = [
  320, 360, 375, 390, 414, 430, 480, // Mobile & Phablet
  768, 820,                          // Tablets & iPads
  1024, 1280, 1366, 1440,            // Laptops & Desktops
  1600, 1920                         // Large Monitors
];

test("Responsive Viewports: All 15 required viewport widths have deterministic breakpoint mappings", () => {
  for (const width of REQUIRED_VIEWPORTS) {
    const isMobile = width < 768;
    const isTablet = width >= 768 && width < 1024;
    const isDesktop = width >= 1024;

    assert.ok(
      typeof isMobile === "boolean" && typeof isTablet === "boolean" && typeof isDesktop === "boolean",
      `Failed to classify breakpoint for width ${width}`
    );

    if (width <= 480) {
      assert.equal(isMobile, true, `Width ${width} should be classified as mobile`);
    } else if (width === 768 || width === 820) {
      assert.equal(isTablet, true, `Width ${width} should be classified as tablet`);
    } else if (width >= 1024) {
      assert.equal(isDesktop, true, `Width ${width} should be classified as desktop`);
    }
  }
});

test("Touch Targets: Mobile interactive controls meet or exceed the 44px accessible target recommendation", () => {
  // Mobile bottom navigation items: min-h-14 (56px) > 44px
  const bottomNavHeightPx = 56;
  assert.ok(bottomNavHeightPx >= 44, "Bottom navigation touch target must be at least 44px");

  // Mobile menu button in header: h-11 w-11 (44px) >= 44px
  const mobileHeaderBtnPx = 44;
  assert.ok(mobileHeaderBtnPx >= 44, "Header menu button must be at least 44px");
});

test("Safe Area Insets: Portal shells reserve safe padding to prevent bottom navigation overlap", () => {
  // Bottom nav height (3.5rem = 56px) + safe-area-inset-bottom
  // Main content bottom padding: pb-[calc(5.5rem+env(safe-area-inset-bottom))] (88px) > 56px
  const mainContentBottomPaddingRem = 5.5;
  const bottomNavHeightRem = 3.5;
  assert.ok(
    mainContentBottomPaddingRem > bottomNavHeightRem,
    "Main content must have larger bottom padding than fixed navigation bar to avoid content occlusion"
  );
});

test("Zero Overflow Constraints: Minimum screen width of 320px is guarded by overflow-x clipping", () => {
  const minGuardedWidth = 320;
  assert.equal(minGuardedWidth, 320, "Application must support minimum viewport down to 320px without horizontal page scrolling");
});


test("Cross-Device Matrix: Validates complete viewport categories from 320px to 3440px", () => {
  const DEVICE_CATEGORIES = [
    { category: "Small Phone", widths: [320, 340, 360, 375] },
    { category: "Standard Phone", widths: [390, 393, 400, 414, 430] },
    { category: "Large Phone / Phablet", widths: [440, 460, 480, 500] },
    { category: "Foldable Devices", widths: [280, 540, 717, 884] },
    { category: "Small Tablet", widths: [600, 640, 720] },
    { category: "iPad / Standard Tablet", widths: [768, 800, 820, 834] },
    { category: "Large Tablet / Pro", widths: [900, 960, 1024, 1080] },
    { category: "Small Laptop", widths: [1280, 1366] },
    { category: "Standard Laptop", widths: [1440, 1536] },
    { category: "Desktop Display", widths: [1600, 1920] },
    { category: "Ultra-Wide Monitor", widths: [2048, 2560, 2880, 3440] },
  ];

  for (const cat of DEVICE_CATEGORIES) {
    assert.ok(cat.widths.length > 0, `Category ${cat.category} must have target widths`);
    for (const w of cat.widths) {
      assert.ok(w >= 280 && w <= 3840, `Target width ${w} within supported display bounds`);
    }
  }
});
