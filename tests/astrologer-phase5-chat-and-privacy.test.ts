import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Phase 5: sendAstrologerReplyToAdminAction checks insert errors on support_messages", () => {
  const chatActionPath = path.join(process.cwd(), "app/actions/astrologer-admin-chat.ts");
  const source = fs.readFileSync(chatActionPath, "utf8");

  assert.match(source, /const \{ error: msgErr \} = await admin\.from\("support_messages"\)\.insert/);
  assert.match(source, /if \(msgErr\) \{\s*return \{ success: false, error: msgErr\.message/);
  assert.match(source, /const \{ error: newMsgErr \} = await admin\.from\("support_messages"\)\.insert/);
  assert.match(source, /if \(newMsgErr\) \{\s*return \{ success: false, error: newMsgErr\.message/);
});

test("Phase 5: requestAstrologerDataExportAction correctly queries astrologer_profiles ID", () => {
  const privacyActionPath = path.join(process.cwd(), "app/actions/privacy-retention.ts");
  const source = fs.readFileSync(privacyActionPath, "utf8");

  assert.match(source, /from\("astrologer_profiles"\)\s*\.select\("\*"\)\s*\.eq\("user_id", user\.id\)/);
  assert.match(source, /from\("consultation_reviews"\)/);
  assert.match(source, /\.eq\("astrologer_id", astroProfileId\)/);
  assert.equal(source.includes('from("astrologer_reviews")'), false, "Must not query non-existent astrologer_reviews table");
});
