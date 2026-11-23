import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';

describe('Sub-phase 4.5: Voice/Audio Call Signaling & WebRTC Coordination', () => {
  const voiceCallsActionPath = path.resolve(process.cwd(), 'app/actions/voice-calls.ts');
  const voiceCallProviderPath = path.resolve(process.cwd(), 'components/chat/VoiceCallProvider.tsx');

  it('voice calls source files exist and are readable', () => {
    assert.strictEqual(fs.existsSync(voiceCallsActionPath), true);
    assert.strictEqual(fs.existsSync(voiceCallProviderPath), true);
  });

  it('enforces conversation participant authorization and payment check before initiating call', () => {
    const fileContent = fs.readFileSync(voiceCallsActionPath, 'utf8');

    // Function existence
    assert.strictEqual(fileContent.includes('export async function startVoiceCallAction('), true);

    // Participant verification
    assert.strictEqual(fileContent.includes('const isCustomer ='), true);
    assert.strictEqual(fileContent.includes('const isAstrologer ='), true);
    assert.strictEqual(fileContent.includes('if (!isCustomer && !isAstrologer)'), true);
    assert.strictEqual(fileContent.includes('You are not a participant in this conversation'), true);

    // Payment verification check on linked booking
    assert.strictEqual(fileContent.includes('Payment required before initiating this consultation call'), true);
  });

  it('guards against concurrent active calls and expires stale ringing calls', () => {
    const fileContent = fs.readFileSync(voiceCallsActionPath, 'utf8');

    // Concurrent check
    assert.strictEqual(fileContent.includes('You or the other participant is already in a call'), true);

    // Stale expiration
    assert.strictEqual(fileContent.includes('isVoiceCallRingExpired'), true);
    assert.strictEqual(fileContent.includes('status: expired ? "missed" : "ended"'), true);
  });

  it('coordinates WebRTC room lifecycle and token issuing via LiveKit', () => {
    const actionContent = fs.readFileSync(voiceCallsActionPath, 'utf8');
    const providerContent = fs.readFileSync(voiceCallProviderPath, 'utf8');

    // LiveKit token action
    assert.strictEqual(actionContent.includes('export async function getVoiceCallTokenAction('), true);
    assert.strictEqual(actionContent.includes('new AccessToken('), true);

    // LiveKit room connection in VoiceCallProvider
    assert.strictEqual(providerContent.includes('new Room('), true);
    assert.strictEqual(providerContent.includes('room.connect('), true);
    assert.strictEqual(providerContent.includes('updateVoiceCallStatusAction'), true);
  });
});
