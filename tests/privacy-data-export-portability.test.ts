import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Sub-phase 10.2: Customer & Astrologer Data Export (Right to Portability)", async (t) => {
  const privacyActionsPath = path.resolve(process.cwd(), "app/actions/privacy-retention.ts");
  const customerClientPath = path.resolve(process.cwd(), "components/customer/CustomerPrivacySettingsClient.tsx");
  const astrologerClientPath = path.resolve(process.cwd(), "components/astrologer/AstrologerPrivacyClient.tsx");

  assert.ok(fs.existsSync(privacyActionsPath), "privacy-retention.ts must exist");
  assert.ok(fs.existsSync(customerClientPath), "CustomerPrivacySettingsClient.tsx must exist");
  assert.ok(fs.existsSync(astrologerClientPath), "AstrologerPrivacyClient.tsx must exist");

  const actionCode = fs.readFileSync(privacyActionsPath, "utf-8").replace(/\r\n/g, "\n");
  const customerCode = fs.readFileSync(customerClientPath, "utf-8").replace(/\r\n/g, "\n");
  const astrologerCode = fs.readFileSync(astrologerClientPath, "utf-8").replace(/\r\n/g, "\n");

  await t.test("1. requestCustomerDataExportAction aggregates all customer entities into portable JSON", () => {
    assert.ok(
      actionCode.includes("export async function requestCustomerDataExportAction"),
      "Must export requestCustomerDataExportAction"
    );
    assert.ok(
      actionCode.includes('.from("customer_bookings").select("*").eq("customer_id", user.id)') &&
      actionCode.includes('.from("puja_bookings").select("*").eq("customer_id", user.id)') &&
      actionCode.includes('.from("kundlis").select("*").eq("user_id", user.id)') &&
      actionCode.includes('.from("privacy_consents").select("*").eq("user_id", user.id)'),
      "Customer export must package profile, consultations, puja bookings, saved kundlis, and consent history"
    );
    assert.ok(
      actionCode.includes('accountType: "customer"'),
      "Export metadata must mark accountType as customer"
    );
  });

  await t.test("2. requestAstrologerDataExportAction aggregates astrologer professional entities safely", () => {
    assert.ok(
      actionCode.includes("export async function requestAstrologerDataExportAction"),
      "Must export requestAstrologerDataExportAction"
    );
    assert.ok(
      actionCode.includes('.from("astrologer_profiles")') &&
      actionCode.includes('.eq("user_id", user.id)'),
      "Astrologer export must resolve astrologer_profiles by user_id"
    );
    assert.ok(
      actionCode.includes('.from("consultation_reviews")') &&
      actionCode.includes('.eq("astrologer_id", astroProfileId)'),
      "Astrologer export must include reviews and ratings"
    );
    assert.ok(
      actionCode.includes('accountType: "astrologer"'),
      "Export metadata must mark accountType as astrologer"
    );
  });

  await t.test("3. Client components trigger browser JSON file download with clean filenames", () => {
    assert.ok(
      customerCode.includes('downloadAnchor.setAttribute("download"') &&
      customerCode.includes(".json"),
      "Customer UI must initiate browser JSON file download"
    );
    assert.ok(
      astrologerCode.includes("link.download = `astrologer_data_export_") &&
      astrologerCode.includes(".json`"),
      "Astrologer UI must initiate browser JSON file download"
    );
  });
});
