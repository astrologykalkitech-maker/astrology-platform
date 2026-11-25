import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

test("getInstamojoConfig requires explicit INSTAMOJO_ENV in production", () => {
  const instamojoLib = readFile("lib/financial/instamojo.ts");
  assert.match(instamojoLib, /process\.env\.NODE_ENV === "production"/);
  assert.match(instamojoLib, /INSTAMOJO_ENV must be explicitly set/);
});

test("Instamojo create route checks order update result and records orphaned gateway requests", () => {
  const createRoute = readFile("app/api/payments/instamojo/create/route.ts");
  assert.match(createRoute, /persistGatewayMappingOrRecover/);
  assert.match(createRoute, /orphaned_gateway_request/);
  assert.match(createRoute, /if \(!persisted\.ok\)/);
  assert.doesNotMatch(createRoute, /\.update\(\{\s*payment_request_id:\s*mojoRes\.data\.id/);
});
