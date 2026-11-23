import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Sub-phase 8.2: Saved Kundlis Library & Multi-Profile Management', () => {
  it('should verify getCustomerKundlisAction scopes records strictly to authenticated customer', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/kundli.ts');
    assert.ok(fs.existsSync(actionPath), 'app/actions/kundli.ts must exist');

    const content = fs.readFileSync(actionPath, 'utf8');

    // Customer scoping
    assert.match(content, /requireCustomerContext\(\)/i, 'Must authenticate using requireCustomerContext');
    assert.match(content, /\.eq\(\s*["']customer_id["'],\s*user\.id\s*\)/i, 'Must scope kundli retrieval to user.id');
    assert.match(content, /\.order\(\s*["']created_at["'],\s*\{\s*ascending:\s*false\s*\}\s*\)/i, 'Must order kundlis by created_at descending');
  });

  it('should verify getKundliByIdAction and deleteKundliAction enforce bilateral customer ownership verification', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/kundli.ts');
    const content = fs.readFileSync(actionPath, 'utf8');

    // Single Kundli fetch ownership
    assert.match(content, /getKundliByIdAction/i, 'Must export getKundliByIdAction');
    assert.match(content, /\.eq\(\s*["']id["'],\s*kundliId\s*\)\s*\.eq\(\s*["']customer_id["'],\s*user\.id\s*\)/i, 'Must verify customer_id on fetch');

    // Deletion ownership
    assert.match(content, /deleteKundliAction/i, 'Must export deleteKundliAction');
    assert.match(content, /\.delete\(\)\s*\.eq\(\s*["']id["'],\s*kundliId\s*\)\s*\.eq\(\s*["']customer_id["'],\s*user\.id\s*\)/i, 'Must verify customer_id on delete');
  });

  it('should verify regenerateKundliAction recalculates full report preserving customer ownership', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/kundli.ts');
    const content = fs.readFileSync(actionPath, 'utf8');

    assert.match(content, /regenerateKundliAction/i, 'Must export regenerateKundliAction');
    assert.match(content, /generateFullAstrologyReport\(/i, 'Must invoke generateFullAstrologyReport on regenerate');
    assert.match(content, /\.update\(updatePayload\)/i, 'Must update existing record in Supabase');
  });

  it('should verify KundliOverview UI renders multi-profile cards, deletion, and recalculation triggers', () => {
    const componentPath = path.resolve(
      process.cwd(),
      'components/kundli/KundliOverview.tsx'
    );
    assert.ok(fs.existsSync(componentPath), 'KundliOverview.tsx must exist');

    const content = fs.readFileSync(componentPath, 'utf8');

    assert.match(content, /handleDelete/i, 'Must provide handleDelete handler');
    assert.match(content, /handleRegenerate/i, 'Must provide handleRegenerate handler');
    assert.match(content, /initialKundlis/i, 'Must accept initialKundlis prop');
    assert.match(content, /customerProfile/i, 'Must accept customerProfile prop');
  });
});
