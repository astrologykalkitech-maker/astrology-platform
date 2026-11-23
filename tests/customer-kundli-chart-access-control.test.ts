import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 2.13: Saved Remedies & Kundli Chart Access Controls", () => {
  const kundliActionsPath = path.resolve(process.cwd(), "app/actions/kundli.ts");
  const kundliPagePath = path.resolve(process.cwd(), "app/customer/(portal)/kundli/page.tsx");

  const actionsContent = fs.readFileSync(kundliActionsPath, "utf-8");
  const pageContent = fs.readFileSync(kundliPagePath, "utf-8");

  it("verifies createKundliAction binds customer_id strictly to authenticated user.id", () => {
    assert.match(
      actionsContent,
      /customer_id:\s*user\.id,/,
      "createKundliAction must store customer_id = user.id"
    );
  });

  it("verifies getCustomerKundlisAction scopes records strictly to customer_id = user.id", () => {
    assert.match(
      actionsContent,
      /export async function getCustomerKundlisAction\(\)[\s\S]*?\.from\("kundlis"\)[\s\S]*?\.select\("\*"\)[\s\S]*?\.eq\("customer_id",\s*user\.id\)/,
      "getCustomerKundlisAction must filter by customer_id = user.id"
    );
  });

  it("verifies getKundliByIdAction enforces strict ownership check on single Kundli fetch", () => {
    assert.match(
      actionsContent,
      /export async function getKundliByIdAction[\s\S]*?\.from\("kundlis"\)[\s\S]*?\.eq\("id",\s*kundliId\)[\s\S]*?\.eq\("customer_id",\s*user\.id\)/,
      "getKundliByIdAction must filter matching id and customer_id = user.id"
    );
  });

  it("verifies customer kundli page route guards authentication via requireCustomerPage", () => {
    assert.match(
      pageContent,
      /await requireCustomerPage\(\);/,
      "app/customer/(portal)/kundli/page.tsx must enforce requireCustomerPage"
    );
  });
});
