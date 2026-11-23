import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Sub-phase 10.3: Customer Location Picker & Ephemeris Geographic Calibration', () => {
  it('should verify customer Panchang actions handle location preferences and geographic validation', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/panchang.ts');
    assert.ok(fs.existsSync(actionPath), 'app/actions/panchang.ts must exist');

    const content = fs.readFileSync(actionPath, 'utf8');

    // 1. getDailyPanchangAction validates coordinates and date
    assert.match(content, /export\s+async\s+function\s+getDailyPanchangAction/i);
    assert.match(content, /location\.latitude\s*<\s*-90\s*\|\|\s*location\.latitude\s*>\s*90/);
    assert.match(content, /location\.longitude\s*<\s*-180\s*\|\|\s*location\.longitude\s*>\s*180/);

    // 2. getCustomerPanchangPreferenceAction
    assert.match(content, /export\s+async\s+function\s+getCustomerPanchangPreferenceAction/i);
    assert.match(content, /customer_panchang_preferences/);

    // 3. saveCustomerPanchangPreferenceAction
    assert.match(content, /export\s+async\s+function\s+saveCustomerPanchangPreferenceAction/i);
    assert.match(content, /revalidatePath\(\s*["']\/customer\/panchang["']\s*\)/);
  });

  it('should verify PanchangClient integrates location autocomplete and preference saving', () => {
    const clientPath = path.resolve(process.cwd(), 'components/panchang/PanchangClient.tsx');
    assert.ok(fs.existsSync(clientPath), 'PanchangClient.tsx must exist');

    const content = fs.readFileSync(clientPath, 'utf8');

    assert.match(content, /LocationAutocomplete/, 'Must integrate LocationAutocomplete component');
    assert.match(content, /saveCustomerPanchangPreferenceAction/, 'Must import saveCustomerPanchangPreferenceAction');
    assert.match(content, /getDailyPanchangAction/, 'Must import getDailyPanchangAction');
    assert.match(content, /localStorage\.getItem\(\s*["']karmicascension_panchang_pref["']\s*\)/, 'Must support local storage fallback');
  });

  it('should verify customer panchang portal page initializes with customer preferences or geographic defaults', () => {
    const pagePath = path.resolve(process.cwd(), 'app/customer/(portal)/panchang/page.tsx');
    assert.ok(fs.existsSync(pagePath), 'app/customer/(portal)/panchang/page.tsx must exist');

    const content = fs.readFileSync(pagePath, 'utf8');

    assert.match(content, /getCustomerPanchangPreferenceAction/, 'Must check saved customer preference');
    assert.match(content, /calculatePanchang/, 'Must precompute Panchang server-side');
    assert.match(content, /<PanchangClient/, 'Must render PanchangClient');
  });
});
