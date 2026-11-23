import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Sub-phase 9.1: Astrologer CRM customer notes table enforces strict RLS and privacy isolation", () => {
  const migPath = path.resolve(process.cwd(), "supabase/migrations/028_crm_and_standalone_chat.sql");
  const sql = fs.readFileSync(migPath, "utf-8");

  // Verify RLS is enabled on astrologer_customer_notes
  assert.match(sql, /ALTER\s+TABLE\s+public\.astrologer_customer_notes\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i);

  // Verify policy strictly restricts to astrologer owner, customer has zero access
  assert.match(sql, /CREATE\s+POLICY\s+"Astrologers can manage own customer notes"/i);
  assert.match(
    sql,
    /astrologer_id\s+IN\s+\(\s*SELECT\s+id\s+FROM\s+public\.astrologer_profiles\s+WHERE\s+user_id\s+=\s+auth\.uid\(\)\s*\)/i
  );
});

test("Sub-phase 9.1: Server actions verify relationship (lead, booking, or assignment) before note access", () => {
  const actionPath = path.resolve(process.cwd(), "app/actions/astrologer-crm.ts");
  const code = fs.readFileSync(actionPath, "utf-8");

  // Check getAstrologerCustomerNotesAction verifies relationship
  assert.match(code, /admin\.from\("leads"\)\.select\("id"\)\.eq\("customer_id",\s*customerId\)\.eq\("astrologer_id",\s*astroProfile\.id\)/);
  assert.match(code, /admin\.from\("customer_bookings"\)\.select\("id"\)\.eq\("customer_id",\s*customerId\)\.eq\("astrologer_id",\s*astroProfile\.id\)/);
  assert.match(code, /admin\.from\("lead_assignments"\)\.select\("id,\s*leads!inner\(customer_id\)"\)/);
  assert.match(code, /Access denied: No active consultation or enquiry relationship with this customer\./);

  // Check createAstrologerNoteAction verifies relationship
  assert.match(code, /Access denied: Cannot create notes for customers without an active consultation or enquiry relationship\./);
});

test("Sub-phase 9.1: Follow-up updates strictly bind note ID and astrologer ID to prevent IDOR", () => {
  const actionPath = path.resolve(process.cwd(), "app/actions/astrologer-crm.ts");
  const code = fs.readFileSync(actionPath, "utf-8");

  // Check updateFollowUpStatusAction enforces astrologer_id scoping
  assert.match(code, /\.eq\("id",\s*noteId\)\s*\.eq\("astrologer_id",\s*astroProfile\.id\)/);
});

test("Sub-phase 9.1: Note payload constraints enforce title <= 200 and content <= 5000 characters", () => {
  const actionPath = path.resolve(process.cwd(), "app/actions/astrologer-crm.ts");
  const code = fs.readFileSync(actionPath, "utf-8");

  assert.match(code, /title\.length\s*>\s*200/);
  assert.match(code, /content\.length\s*>\s*5000/);
});
