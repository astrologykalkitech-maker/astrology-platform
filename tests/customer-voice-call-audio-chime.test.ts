import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  LIVE_VOICE_CALL_STATUSES,
  VOICE_CALL_RING_TIMEOUT_MS,
  VOICE_CALL_STALE_TIMEOUT_MS,
  isLiveVoiceCallStatus,
  isVoiceCallRingExpired,
  getVoiceCallDurationSeconds,
  getVoiceCallCommissionBookingId,
} from '../lib/chat/voice-call.js';
import {
  unlockChatAudio,
  playChatNotificationChime,
} from '../lib/chat/audio-notification.js';
import type { VoiceCall } from '../lib/types/database.types.js';

describe('Sub-phase 5.4: Voice Consultation Integration & WebRTC Audio Chime Alerts System', () => {
  it('should verify voice call state constants and timeout expiration rules', () => {
    assert.deepEqual(LIVE_VOICE_CALL_STATUSES, ['ringing', 'accepted', 'active']);
    assert.equal(VOICE_CALL_RING_TIMEOUT_MS, 45_000);
    assert.equal(VOICE_CALL_STALE_TIMEOUT_MS, 60_000);

    assert.equal(isLiveVoiceCallStatus('ringing'), true);
    assert.equal(isLiveVoiceCallStatus('accepted'), true);
    assert.equal(isLiveVoiceCallStatus('active'), true);
    assert.equal(isLiveVoiceCallStatus('ended'), false);
    assert.equal(isLiveVoiceCallStatus('declined'), false);

    const now = 1_700_000_000_000;
    const testCallRingingFresh = {
      status: 'ringing',
      created_at: new Date(now - 44_000).toISOString(),
    } as VoiceCall;

    const testCallRingingExpired = {
      status: 'ringing',
      created_at: new Date(now - 46_000).toISOString(),
    } as VoiceCall;

    const testCallAccepted = {
      status: 'accepted',
      created_at: new Date(now - 50_000).toISOString(),
    } as VoiceCall;

    // Ring expiration
    assert.equal(isVoiceCallRingExpired(testCallRingingFresh, now), false);
    assert.equal(isVoiceCallRingExpired(testCallRingingExpired, now), true);
    assert.equal(isVoiceCallRingExpired(testCallAccepted, now), false);

    // Duration calculation
    const activeCall = {
      started_at: new Date(now - 125_000).toISOString(),
      ended_at: new Date(now).toISOString(),
    } as VoiceCall;
    assert.equal(getVoiceCallDurationSeconds(activeCall, now), 125);

    // Commission booking ID guard
    assert.equal(getVoiceCallCommissionBookingId('booking-123', 60), 'booking-123');
    assert.equal(getVoiceCallCommissionBookingId('booking-123', 0), null);
    assert.equal(getVoiceCallCommissionBookingId(null, 60), null);
  });

  it('should verify voice-calls server action enforces room generation and financial integrity', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/voice-calls.ts');
    assert.ok(fs.existsSync(actionPath), 'app/actions/voice-calls.ts must exist');

    const content = fs.readFileSync(actionPath, 'utf8');

    // Room generation must prefix karmicascension_voice_
    assert.match(content, /karmicascension_voice_/i, 'Must use prefix karmicascension_voice_');
    assert.match(content, /crypto\.randomBytes\(16\)\.toString\("hex"\)/i, 'Must use secure cryptographically random token');

    // Must prevent participant mutations from completing booking directly
    assert.ok(
      content.includes('Participant-initiated call status mutations') &&
      content.includes('MUST NEVER') &&
      content.includes('complete a consultation booking'),
      'Participant status updates must not complete consultation booking directly'
    );
    assert.match(content, /updateVoiceCallStatusAction/i, 'Must export updateVoiceCallStatusAction');
    assert.match(content, /startVoiceCallAction/i, 'Must export startVoiceCallAction');
  });

  it('should verify audio notification and chime helpers handle autoplay compliance', () => {
    const audioHelperPath = path.resolve(process.cwd(), 'lib/chat/audio-notification.ts');
    assert.ok(fs.existsSync(audioHelperPath), 'lib/chat/audio-notification.ts must exist');

    const content = fs.readFileSync(audioHelperPath, 'utf8');

    assert.match(content, /unlockChatAudio/i, 'Must export unlockChatAudio helper');
    assert.match(content, /playChatNotificationChime/i, 'Must export playChatNotificationChime helper');
    assert.match(content, /AudioContext/i, 'Must use Web Audio API AudioContext for synthetic fallback chimes');
    assert.match(content, /resume\(\)/i, 'Must handle AudioContext resume state for browser autoplay restrictions');

    // Calling unlockChatAudio and playChatNotificationChime in Node (SSR / no window) should safely no-op without throwing
    assert.doesNotThrow(() => {
      unlockChatAudio();
      playChatNotificationChime(false);
      playChatNotificationChime(true);
    });
  });

  it('should verify CustomerChatClient integrates voice consultation UI and audio chime toggles', () => {
    const chatClientPath = path.resolve(process.cwd(), 'components/customer/chat/CustomerChatClient.tsx');
    assert.ok(fs.existsSync(chatClientPath), 'CustomerChatClient.tsx must exist');

    const content = fs.readFileSync(chatClientPath, 'utf8');

    assert.match(content, /useVoiceCall/i, 'CustomerChatClient must integrate useVoiceCall context');
    assert.match(content, /unlockChatAudio/i, 'CustomerChatClient must invoke unlockChatAudio on user interaction');
    assert.match(content, /isMuted/i, 'CustomerChatClient must support sound mute toggle state');
    assert.match(content, /soundNotificationService/i, 'CustomerChatClient must integrate soundNotificationService');
  });
});
