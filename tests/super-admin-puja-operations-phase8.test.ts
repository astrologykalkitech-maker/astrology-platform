import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Phase 8: Puja & Spiritual Services Operations (Sub-phases 8.1 – 8.20)", async (t) => {
  await t.test("Sub-phases 8.1-8.5: Puja Catalog & Package Management", () => {
    const pujasPath = path.resolve(process.cwd(), "app/actions/super-admin-pujas.ts");
    assert.ok(fs.existsSync(pujasPath), "super-admin-pujas.ts must exist");
    const content = fs.readFileSync(pujasPath, "utf-8");

    assert.match(content, /export async function getSuperAdminPujaCatalog/, "Must export getSuperAdminPujaCatalog");
    assert.match(content, /export async function upsertSuperAdminPuja/, "Must export upsertSuperAdminPuja");
    assert.match(content, /export async function togglePujaStatus/, "Must export togglePujaStatus");
    assert.match(content, /requireSuperAdmin\(\)/, "Must strictly require Super Admin for Puja catalog");
    assert.match(content, /from\(["']puja_catalog["']\)/, "Must query puja_catalog table");
  });

  await t.test("Sub-phases 8.6-8.10: Puja Bookings & Fulfillment Desk", () => {
    const bookingsPath = path.resolve(process.cwd(), "app/actions/super-admin-puja-bookings.ts");
    assert.ok(fs.existsSync(bookingsPath), "super-admin-puja-bookings.ts must exist");
    const content = fs.readFileSync(bookingsPath, "utf-8");

    assert.match(content, /export async function getSuperAdminPujaBookings/, "Must export getSuperAdminPujaBookings");
    assert.match(content, /from\(["']puja_bookings["']\)/, "Must query puja_bookings table");
    assert.match(content, /requireSuperAdmin\(\)/, "Bookings desk must require Super Admin");
  });

  await t.test("Sub-phases 8.11-8.15: Pandit Assignment & Scheduling", () => {
    const bookingsPath = path.resolve(process.cwd(), "app/actions/super-admin-puja-bookings.ts");
    const content = fs.readFileSync(bookingsPath, "utf-8");

    assert.match(content, /export async function getEligiblePandits/, "Must export getEligiblePandits");
    assert.match(content, /export async function assignPanditToBooking/, "Must export assignPanditToBooking");
    assert.match(
      content,
      /approval_status !== ["']approved["']/,
      "Must verify that only approved Pandits are eligible for assignment"
    );
  });

  await t.test("Sub-phases 8.16-8.20: Puja Operations Cross-Dashboard Path Revalidation", () => {
    const pujasPath = path.resolve(process.cwd(), "app/actions/super-admin-pujas.ts");
    const content = fs.readFileSync(pujasPath, "utf-8");

    assert.match(content, /revalidatePath\(["']\/super-admin\/pujas["']\)/, "Must revalidate admin pujas path");
    assert.match(content, /revalidatePath\(["']\/customer\/puja["']\)/, "Must revalidate customer puja store path");
  });
});
