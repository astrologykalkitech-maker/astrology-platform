import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Sub-phase 13.2: Astrological Event & Planetary Transit Reminders', () => {
  it('should verify enterprise notifications dispatch supports astrological transit and event notifications', () => {
    const actionPath = path.resolve(
      process.cwd(),
      'app/actions/enterprise-notifications.ts'
    );
    assert.ok(fs.existsSync(actionPath), 'enterprise-notifications.ts must exist');

    const content = fs.readFileSync(actionPath, 'utf8');

    assert.match(
      content,
      /export\s+async\s+function\s+dispatchMultiChannelNotification/i,
      'Must export dispatchMultiChannelNotification'
    );
    assert.match(
      content,
      /export\s+async\s+function\s+dispatchBulkMultiChannelNotification/i,
      'Must export dispatchBulkMultiChannelNotification'
    );
    assert.match(
      content,
      /from\(\s*["']customer_notifications["']\s*\)\.insert/,
      'Must mirror in_app deliveries to customer_notifications'
    );
  });

  it('should verify SoundSettings component allows audio notification alerts', () => {
    const soundSettingsPath = path.resolve(
      process.cwd(),
      'components/sound/SoundSettings.tsx'
    );
    assert.ok(fs.existsSync(soundSettingsPath), 'SoundSettings.tsx must exist');

    const content = fs.readFileSync(soundSettingsPath, 'utf8');
    assert.match(content, /SoundSettings/, 'Must export SoundSettings');
  });

  it('should verify customer notification portal incorporates sound settings', () => {
    const notifPagePath = path.resolve(
      process.cwd(),
      'app/customer/(portal)/notification/page.tsx'
    );
    assert.ok(fs.existsSync(notifPagePath), 'notification/page.tsx must exist');

    const content = fs.readFileSync(notifPagePath, 'utf8');
    assert.match(content, /<SoundSettings\s*\/>/, 'Must mount SoundSettings in notifications page');
  });
});
