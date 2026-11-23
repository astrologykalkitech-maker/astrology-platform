import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Sub-phase 9.3: Saved Milan Profiles & Match History', () => {
  it('should verify customer Kundli Milan history actions exist with user isolation', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/kundli-milan.ts');
    assert.ok(fs.existsSync(actionPath), 'app/actions/kundli-milan.ts must exist');

    const content = fs.readFileSync(actionPath, 'utf8');

    // 1. getCustomerKundliMilansAction
    assert.match(
      content,
      /export\s+async\s+function\s+getCustomerKundliMilansAction/i,
      'Must export getCustomerKundliMilansAction'
    );
    assert.match(
      content,
      /\.eq\(\s*["']customer_id["'],\s*user\.id\s*\)/,
      'Must enforce user customer_id isolation in getCustomerKundliMilansAction'
    );

    // 2. getKundliMilanByIdAction
    assert.match(
      content,
      /export\s+async\s+function\s+getKundliMilanByIdAction/i,
      'Must export getKundliMilanByIdAction'
    );
    assert.match(
      content,
      /\.eq\(\s*["']id["'],\s*id\s*\)/,
      'Must filter by record id in getKundliMilanByIdAction'
    );

    // 3. deleteKundliMilanAction
    assert.match(
      content,
      /export\s+async\s+function\s+deleteKundliMilanAction/i,
      'Must export deleteKundliMilanAction'
    );
    assert.match(
      content,
      /revalidatePath\(\s*["']\/customer\/kundli-milan["']\s*\)/,
      'Must revalidate customer kundli-milan path upon deletion'
    );
  });

  it('should verify KundliMilanClient component renders saved match history and provides view/delete controls', () => {
    const clientPath = path.resolve(
      process.cwd(),
      'components/kundli-milan/KundliMilanClient.tsx'
    );
    assert.ok(fs.existsSync(clientPath), 'KundliMilanClient.tsx must exist');

    const content = fs.readFileSync(clientPath, 'utf8');

    assert.match(content, /initialRecords:\s*SavedKundliMilanRecord\[\]/, 'Must accept initialRecords');
    assert.match(content, /deleteKundliMilanAction/, 'Must import deleteKundliMilanAction');
    assert.match(content, /Saved Kundli Milan History/i, 'Must render Saved Kundli Milan History section');
    assert.match(content, /View Full Analysis/i, 'Must render View Full Analysis action');
    assert.match(content, /handleDelete/i, 'Must provide deletion handler');
  });

  it('should verify server page passes customerProfile and preloads initialRecords', () => {
    const pagePath = path.resolve(
      process.cwd(),
      'app/customer/(portal)/kundli-milan/page.tsx'
    );
    assert.ok(fs.existsSync(pagePath), 'app/customer/(portal)/kundli-milan/page.tsx must exist');

    const content = fs.readFileSync(pagePath, 'utf8');

    assert.match(content, /getCustomerKundliMilansAction/, 'Must call getCustomerKundliMilansAction on server');
    assert.match(content, /getCustomerFullProfile/, 'Must call getCustomerFullProfile to auto-populate default partner');
    assert.match(content, /<KundliMilanClient/, 'Must mount KundliMilanClient');
  });
});
