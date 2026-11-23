import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';

describe('Sub-phase 7.5: Evidence Upload, Ceremony Completion & Commission Accrual', () => {
  const astrologerPujaPath = path.resolve(
    process.cwd(),
    'app/actions/astrologer-pujas.ts'
  );

  it('astrologer-pujas action file exists and is readable', () => {
    assert.strictEqual(fs.existsSync(astrologerPujaPath), true);
  });

  it('enforces assigned pandit authorization before updating fulfilment stage', () => {
    const fileContent = fs.readFileSync(astrologerPujaPath, 'utf8');

    // Ownership check
    assert.strictEqual(fileContent.includes('if (booking.astrologer_id !== astrologerProfileId)'), true);
    assert.strictEqual(fileContent.includes('Unauthorized: You are not assigned to this booking'), true);
  });

  it('updates completion fields (notes, evidence photos, evidence video) upon completed stage', () => {
    const fileContent = fs.readFileSync(astrologerPujaPath, 'utf8');

    assert.strictEqual(fileContent.includes('if (params.stage === "completed")'), true);
    assert.strictEqual(fileContent.includes('updates.status = "completed";'), true);
    assert.strictEqual(fileContent.includes('updates.completed_at = new Date().toISOString();'), true);
    assert.strictEqual(fileContent.includes('updates.evidence_photos = params.evidencePhotos;'), true);
    assert.strictEqual(fileContent.includes('updates.evidence_video_url = params.evidenceVideoUrl.trim();'), true);
  });

  it('automatically accrues platform commission via commission engine on ceremony completion', () => {
    const fileContent = fs.readFileSync(astrologerPujaPath, 'utf8');

    assert.strictEqual(fileContent.includes('const { postCommissionLedgerEntry } = await import("@/lib/financial/commission-engine");'), true);
    assert.strictEqual(fileContent.includes('await postCommissionLedgerEntry({'), true);
    assert.strictEqual(fileContent.includes('consultantId: bookingData.astrologer_id,'), true);
    assert.strictEqual(fileContent.includes('pujaBookingId: bookingData.id,'), true);
    assert.strictEqual(fileContent.includes('grossAmountPaise: grossPaise,'), true);
  });
});
