import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';

describe('Sub-phase 7.1: Puja Service Catalog & Offerings Management', () => {
  const pujaActionPath = path.resolve(process.cwd(), 'app/actions/puja.ts');
  const astrologerPujaPath = path.resolve(process.cwd(), 'app/actions/astrologer-pujas.ts');

  it('puja action files exist and are readable', () => {
    assert.strictEqual(fs.existsSync(pujaActionPath), true);
    assert.strictEqual(fs.existsSync(astrologerPujaPath), true);
  });

  it('guarantees getPujaCatalog filters strictly by is_active = true', () => {
    const fileContent = fs.readFileSync(pujaActionPath, 'utf8');

    assert.strictEqual(fileContent.includes('export async function getPujaCatalog('), true);
    assert.strictEqual(fileContent.includes(".from(\"puja_catalog\")"), true);
    assert.strictEqual(fileContent.includes(".eq(\"is_active\", true)"), true);
  });

  it('guarantees getAvailablePujaPriests filters strictly by approval_status = approved', () => {
    const fileContent = fs.readFileSync(pujaActionPath, 'utf8');

    assert.strictEqual(fileContent.includes('export async function getAvailablePujaPriests('), true);
    assert.strictEqual(fileContent.includes(".from(\"astrologer_profiles\")"), true);
    assert.strictEqual(fileContent.includes(".eq(\"approval_status\", \"approved\")"), true);
  });

  it('enforces authorized profile resolution for astrologer assigned pujas', () => {
    const astroContent = fs.readFileSync(astrologerPujaPath, 'utf8');

    assert.strictEqual(astroContent.includes('export async function getAstrologerAssignedPujas('), true);
    assert.strictEqual(astroContent.includes('const user = await getCurrentUser();'), true);
    assert.strictEqual(astroContent.includes('if (!user) return { success: false, data: [], error: "Authentication required" };'), true);
    assert.strictEqual(astroContent.includes(".eq('astrologer_id', astrologerProfileId)") || astroContent.includes('.eq("astrologer_id", astrologerProfileId)'), true);
  });
});
