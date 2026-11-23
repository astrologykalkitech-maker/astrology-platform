import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Sub-phase 16.3: Data Export, Account Deletion & GDPR Privacy Lifecycle', () => {
  it('should verify customer privacy page requires authentication and mounts CustomerPrivacySettingsClient', () => {
    const pagePath = path.resolve(
      process.cwd(),
      'app/customer/(portal)/privacy/page.tsx'
    );
    assert.ok(fs.existsSync(pagePath), 'app/customer/(portal)/privacy/page.tsx must exist');

    const content = fs.readFileSync(pagePath, 'utf8');

    assert.match(content, /requireCustomerPage\(\)/, 'Must require customer authentication');
    assert.match(
      content,
      /<CustomerPrivacySettingsClient/,
      'Must mount CustomerPrivacySettingsClient'
    );
  });

  it('should verify CustomerPrivacySettingsClient implements consent toggles, export, and deletion workflows', () => {
    const clientPath = path.resolve(
      process.cwd(),
      'components/customer/CustomerPrivacySettingsClient.tsx'
    );
    assert.ok(fs.existsSync(clientPath), 'CustomerPrivacySettingsClient.tsx must exist');

    const content = fs.readFileSync(clientPath, 'utf8');

    assert.match(content, /updateUserConsentAction/, 'Must import updateUserConsentAction');
    assert.match(content, /requestCustomerDataExportAction/, 'Must import requestCustomerDataExportAction');
    assert.match(content, /requestAccountDeletionAction/, 'Must import requestAccountDeletionAction');
    assert.match(content, /cancelAccountDeletionAction/, 'Must import cancelAccountDeletionAction');
  });

  it('should verify privacy-retention actions enforce user ownership on data exports and deletions', () => {
    const actionPath = path.resolve(
      process.cwd(),
      'app/actions/privacy-retention.ts'
    );
    assert.ok(fs.existsSync(actionPath), 'app/actions/privacy-retention.ts must exist');

    const content = fs.readFileSync(actionPath, 'utf8');

    // Export includes personal data package
    assert.match(content, /export\s+async\s+function\s+requestCustomerDataExportAction/i);
    assert.match(content, /exportPackage\s*=\s*\{/);

    // Deletion enforces 30-day grace period
    assert.match(content, /export\s+async\s+function\s+requestAccountDeletionAction/i);
    assert.match(content, /scheduledDate\s*=\s*new\s+Date\(Date\.now\(\)\s*\+\s*30\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000\)/);

    // Cancellation enforces ownership
    assert.match(content, /export\s+async\s+function\s+cancelAccountDeletionAction/i);
    assert.match(content, /\.eq\(\s*["']user_id["'],\s*user\.id\s*\)/);
  });
});
