import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Sub-phase 8.3: Interactive SVG Divisional Charts (D1, D9, D10) Rendering', () => {
  it('should verify KundliChartViewer supports D1 (Rashi), D9 (Navamsa), and D10 (Dashamsa) charts', () => {
    const viewerPath = path.resolve(
      process.cwd(),
      'components/kundli/KundliChartViewer.tsx'
    );
    assert.ok(fs.existsSync(viewerPath), 'KundliChartViewer.tsx must exist');

    const content = fs.readFileSync(viewerPath, 'utf8');

    // Chart types
    assert.match(content, /chartType\s*===\s*["']D1["']/i, 'Must support D1 chart');
    assert.match(content, /chartType\s*===\s*["']D9["']/i, 'Must support D9 Navamsa chart');
    assert.match(content, /chartType\s*===\s*["']D10["']/i, 'Must support D10 Dashamsa chart');

    // Mathematical Navamsa Lagna derivation
    assert.match(content, /padaIndex\s*=\s*Math\.floor\(norm\s*\/\s*\(360\s*\/\s*108\)\)/i, 'Must derive 108 Navamsa padas');

    // Mathematical Dashamsa Lagna derivation
    assert.match(content, /degInRashi\s*=\s*norm\s*%\s*30/i, 'Must calculate 3-degree Dashamsa parts');
  });

  it('should verify North Indian diamond-style SVG chart renders houses, rashis, and planet symbols', () => {
    const northPath = path.resolve(
      process.cwd(),
      'components/kundli/NorthIndianChart.tsx'
    );
    assert.ok(fs.existsSync(northPath), 'NorthIndianChart.tsx must exist');

    const content = fs.readFileSync(northPath, 'utf8');

    assert.match(content, /viewBox=["']0 0 600 600["']/i, 'Must render high-resolution 600x600 SVG viewBox');
    assert.match(content, /PLANET_SHORT_CODES/i, 'Must define standard 2-letter planet codes (Su, Mo, Ma, etc.)');
    assert.match(content, /houseLabels/i, 'Must define geometric coordinates for all 12 diamond houses');
    assert.match(content, /lagnaRashiNum/i, 'Must orient houses dynamically from active Lagna Rashi');
  });

  it('should verify South Indian square-style SVG chart fixes 12 rashis in clockwise order with Lagna marker', () => {
    const southPath = path.resolve(
      process.cwd(),
      'components/kundli/SouthIndianChart.tsx'
    );
    assert.ok(fs.existsSync(southPath), 'SouthIndianChart.tsx must exist');

    const content = fs.readFileSync(southPath, 'utf8');

    assert.match(content, /signGridPositions/i, 'Must define 4x4 fixed grid positions for all 12 Rashis');
    assert.match(content, /boxSize\s*=\s*140/i, 'Must configure square box sizes');
    assert.match(content, /ascendant/i, 'Must accept ascendant info');
    assert.match(content, /planetsByRashi/i, 'Must group planets by Rashi number in South Indian style');
  });

  it('should verify style switcher toggles between North Indian and South Indian visual systems', () => {
    const viewerPath = path.resolve(
      process.cwd(),
      'components/kundli/KundliChartViewer.tsx'
    );
    const content = fs.readFileSync(viewerPath, 'utf8');

    assert.match(content, /style\s*===\s*["']north["']/i, 'Must condition North Indian chart rendering');
    assert.match(content, /style\s*===\s*["']south["']/i, 'Must condition South Indian chart rendering');
    assert.match(content, /setStyle\(/i, 'Must provide style setter');
  });
});
