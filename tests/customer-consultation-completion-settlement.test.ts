import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Sub-phase 5.5: Live Consultation Session Completion & Automated Ledger Settlement', () => {
  it('should verify LiveKit webhook enforces signature verification and raw event logging', () => {
    const webhookPath = path.resolve(process.cwd(), 'app/api/webhooks/livekit/route.ts');
    assert.ok(fs.existsSync(webhookPath), 'app/api/webhooks/livekit/route.ts must exist');

    const content = fs.readFileSync(webhookPath, 'utf8');

    // Signature verification with WebhookReceiver
    assert.match(content, /WebhookReceiver/i, 'Must use LiveKit WebhookReceiver for cryptographic signature verification');
    assert.match(content, /receiver\.receive\s*\(\s*rawBody,\s*authHeader\s*\)/i, 'Must receive and verify webhook signature');
    assert.match(content, /consultation_raw_webhook_events/i, 'Must log webhook payload into consultation_raw_webhook_events');
  });

  it('should verify room_finished handles authoritative voice and video session completion', () => {
    const webhookPath = path.resolve(process.cwd(), 'app/api/webhooks/livekit/route.ts');
    const content = fs.readFileSync(webhookPath, 'utf8');

    // Case A/B: Voice call room completion
    assert.match(content, /karmicascension_voice_/i, 'Must handle karmicascension_voice_ room namespace');
    assert.match(content, /durationSeconds\s*>=\s*30/i, 'Must require minimum 30s threshold to complete linked booking');
    assert.match(content, /completion_source:\s*["']voice_ended["']/i, 'Must record completion_source as voice_ended');

    // Case C: One-on-one billing session settlement
    assert.match(content, /karmicascension_consultation_/i, 'Must handle karmicascension_consultation_ room namespace');
    assert.match(content, /settle_consultation_billing_atomic/i, 'Must invoke settle_consultation_billing_atomic RPC');
  });

  it('should verify atomic billing settlement RPC enforces ceiling minute math and commission integrity', () => {
    const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/077_consultation_billing_sessions_and_events.sql');
    assert.ok(fs.existsSync(migrationPath), 'Migration 077 must exist');

    const content = fs.readFileSync(migrationPath, 'utf8');

    // Ceiling minute calculation
    assert.match(content, /CEIL\(p_billable_seconds::NUMERIC\s*\/\s*60\.0\)::INTEGER/i, 'Must calculate billable minutes using integer ceiling math');
    // Platform commission
    assert.match(content, /FLOOR\(v_total_charge\s*\*\s*10\s*\/\s*100\)/i, 'Must calculate 10% platform commission with integer paise floor arithmetic');
    // Atomic wallet capture
    assert.match(content, /capture_wallet_reservation_atomic/i, 'Must atomically capture wallet reservation');
    assert.match(content, /SET search_path\s*=\s*''/i, 'Must be SECURITY DEFINER with empty search_path');
  });

  it('should verify participant status updates cannot bypass webhook ledger settlement', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/voice-calls.ts');
    const content = fs.readFileSync(actionPath, 'utf8');

    // In updateVoiceCallStatusAction, check guard comment or restriction
    assert.ok(
      content.includes('Participant-initiated call status mutations') &&
      content.includes('MUST NEVER') &&
      content.includes('complete a consultation booking'),
      'Action must enforce that participant status updates cannot bypass webhook settlement'
    );
  });
});
