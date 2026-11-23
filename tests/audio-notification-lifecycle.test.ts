import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';

describe('Sub-phase 4.6: Audio Notification System & Continuous Ringing Lifecycle', () => {
  const audioNotificationPath = path.resolve(process.cwd(), 'lib/chat/audio-notification.ts');
  const notificationRulesPath = path.resolve(process.cwd(), 'lib/chat/notification-rules.ts');

  it('audio notification and rule files exist and are readable', () => {
    assert.strictEqual(fs.existsSync(audioNotificationPath), true);
    assert.strictEqual(fs.existsSync(notificationRulesPath), true);
  });

  it('declares unlockChatAudio and respects muted states', () => {
    const audioContent = fs.readFileSync(audioNotificationPath, 'utf8');

    // unlockChatAudio existence
    assert.strictEqual(audioContent.includes('export async function unlockChatAudio('), true);
    assert.strictEqual(audioContent.includes('CHAT_AUDIO_UNLOCKED_EVENT'), true);

    // Muted flag checks in chime and continuous ringer
    assert.strictEqual(audioContent.includes('export function playChatNotificationChime(muted = false)'), true);
    assert.strictEqual(audioContent.includes('if (muted) return;'), true);
    assert.strictEqual(audioContent.includes('const ctx = muted ? null : getAudioContext();'), true);
  });

  it('provides continuous ringer controller with active tracking and clean stop teardown', () => {
    const audioContent = fs.readFileSync(audioNotificationPath, 'utf8');

    assert.strictEqual(audioContent.includes('export interface ContinuousRingerController'), true);
    assert.strictEqual(audioContent.includes('stop: () => void;'), true);
    assert.strictEqual(audioContent.includes('isRinging: () => boolean;'), true);

    // Stop teardown
    assert.strictEqual(audioContent.includes('active = false;'), true);
    assert.strictEqual(audioContent.includes('if (timerId) clearTimeout(timerId);'), true);
    assert.strictEqual(audioContent.includes('oscillators.clear();'), true);
  });

  it('implements deterministic sound rules for incoming messages', () => {
    const rulesContent = fs.readFileSync(notificationRulesPath, 'utf8');

    assert.strictEqual(rulesContent.includes('getIncomingChatSound('), true);
    assert.strictEqual(rulesContent.includes('rememberIncomingMessage('), true);
  });
});
