import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

test("Astrologer Dashboard - Availability and Edit-Profile Feature Integration", () => {
  // 1. Verify availability page exists
  const availPage = path.join(rootDir, "app/astrologer/(portal)/availability/page.tsx");
  assert.ok(fs.existsSync(availPage), "app/astrologer/(portal)/availability/page.tsx must exist");
  const availSrc = fs.readFileSync(availPage, "utf-8");
  assert.ok(availSrc.includes("AstrologerAvailabilityClient"), "Availability page must render AstrologerAvailabilityClient");
  assert.ok(availSrc.includes("getMyAvailabilityAction"), "Availability page must fetch availability action");

  // 2. Verify interactive client exists
  const availClient = path.join(rootDir, "components/astrologer/availability/AstrologerAvailabilityClient.tsx");
  assert.ok(fs.existsSync(availClient), "AstrologerAvailabilityClient.tsx must exist");
  const clientSrc = fs.readFileSync(availClient, "utf-8");
  assert.ok(clientSrc.includes("saveWeeklyAvailabilityAction"), "Client must wire saveWeeklyAvailabilityAction");
  assert.ok(clientSrc.includes("addTimeOffAction"), "Client must wire addTimeOffAction");
  assert.ok(clientSrc.includes("removeTimeOffAction"), "Client must wire removeTimeOffAction");
  assert.ok(clientSrc.includes("previewMySlotsAction"), "Client must wire previewMySlotsAction");

  // 3. Verify sidebar navigation links to availability
  const sidebarFile = path.join(rootDir, "components/astrologer/AstrologerSidebar.tsx");
  const sidebarSrc = fs.readFileSync(sidebarFile, "utf-8");
  assert.ok(sidebarSrc.includes('href: "/astrologer/availability"'), "Astrologer sidebar must contain /astrologer/availability");
  assert.ok(sidebarSrc.includes('label: "Working Hours"'), "Astrologer sidebar must display 'Working Hours'");

  // 4. Verify edit-profile forwarder exists
  const editProfilePage = path.join(rootDir, "app/astrologer/(portal)/edit-profile/page.tsx");
  assert.ok(fs.existsSync(editProfilePage), "app/astrologer/(portal)/edit-profile/page.tsx must exist");
  const editSrc = fs.readFileSync(editProfilePage, "utf-8");
  assert.ok(editSrc.includes('redirect("/astrologer/profile/edit")'), "edit-profile must redirect to /astrologer/profile/edit");
});

test("Customer Portal - Vedic Astrology & Direct Chat Navigation Integration", () => {
  // 1. Verify CustomerSidebar includes Panchang, Horoscope, and Kundli Milan in active NAV_ITEMS
  const sidebarFile = path.join(rootDir, "components/customer/CustomerSidebar.tsx");
  const sidebarSrc = fs.readFileSync(sidebarFile, "utf-8");
  assert.ok(sidebarSrc.includes('href: "/customer/panchang"'), "Customer sidebar must include /customer/panchang");
  assert.ok(sidebarSrc.includes('href: "/customer/horoscope"'), "Customer sidebar must include /customer/horoscope");
  assert.ok(sidebarSrc.includes('href: "/customer/kundli-milan"'), "Customer sidebar must include /customer/kundli-milan");
  assert.ok(sidebarSrc.includes('href: "/customer/chat"'), "Customer sidebar must include /customer/chat");

  // 2. Verify notifications forwarder exists
  const notifPage = path.join(rootDir, "app/customer/(portal)/notifications/page.tsx");
  assert.ok(fs.existsSync(notifPage), "app/customer/(portal)/notifications/page.tsx must exist");
  const notifSrc = fs.readFileSync(notifPage, "utf-8");
  assert.ok(notifSrc.includes('redirect("/customer/notification")'), "notifications must redirect to /customer/notification");
});

test("Super Admin Dashboard - Review Moderation & Navigation Integration", () => {
  // 1. Verify admin reviews action file exists
  const reviewsAction = path.join(rootDir, "app/actions/admin-reviews.ts");
  assert.ok(fs.existsSync(reviewsAction), "app/actions/admin-reviews.ts must exist");
  const actionSrc = fs.readFileSync(reviewsAction, "utf-8");
  assert.ok(actionSrc.includes("getAdminReviewsAction"), "Must export getAdminReviewsAction");
  assert.ok(actionSrc.includes("toggleReviewPublishedAction"), "Must export toggleReviewPublishedAction");
  assert.ok(actionSrc.includes("deleteReviewAction"), "Must export deleteReviewAction");

  // 2. Verify Super Admin reviews page exists
  const reviewsPage = path.join(rootDir, "app/super-admin/reviews/page.tsx");
  assert.ok(fs.existsSync(reviewsPage), "app/super-admin/reviews/page.tsx must exist");
  const pageSrc = fs.readFileSync(reviewsPage, "utf-8");
  assert.ok(pageSrc.includes("AdminReviewsClient"), "Super admin reviews page must render AdminReviewsClient");

  // 3. Verify AdminSidebar links to Review Moderation
  const adminSidebar = path.join(rootDir, "components/admin/AdminSidebar.tsx");
  const adminSidebarSrc = fs.readFileSync(adminSidebar, "utf-8");
  assert.ok(adminSidebarSrc.includes('href: "/super-admin/reviews"'), "Admin sidebar must include /super-admin/reviews");
  assert.ok(adminSidebarSrc.includes('label: "Review Moderation"'), "Admin sidebar must display 'Review Moderation'");

  // 4. Verify Super Admin astrologers forwarder exists
  const astroRedirectPage = path.join(rootDir, "app/super-admin/astrologers/page.tsx");
  assert.ok(fs.existsSync(astroRedirectPage), "app/super-admin/astrologers/page.tsx must exist");
  const astroRedirectSrc = fs.readFileSync(astroRedirectPage, "utf-8");
  assert.ok(astroRedirectSrc.includes('redirect("/super-admin/listings")'), "astrologers must redirect to /super-admin/listings");
});
