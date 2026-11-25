import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Sub-phase 12.3: Client Asset Optimization and Font Preloading", async (t) => {
  const layoutPath = path.resolve(process.cwd(), "app/layout.tsx");
  const nextConfigPath = path.resolve(process.cwd(), "next.config.ts");

  assert.ok(fs.existsSync(layoutPath), "app/layout.tsx must exist");
  assert.ok(fs.existsSync(nextConfigPath), "next.config.ts must exist");

  const layoutCode = fs.readFileSync(layoutPath, "utf-8").replace(/\r\n/g, "\n");
  const configCode = fs.readFileSync(nextConfigPath, "utf-8").replace(/\r\n/g, "\n");

  await t.test("1. Google Fonts are loaded via next/font with display: swap and zero layout shift", () => {
    assert.ok(
      layoutCode.includes('import { Inter, Cinzel } from "next/font/google";'),
      "Must import Inter and Cinzel from next/font/google"
    );
    assert.ok(
      layoutCode.includes('display: "swap"'),
      "Fonts must enforce display: swap"
    );
    assert.ok(
      layoutCode.includes('variable: "--font-inter"') &&
      layoutCode.includes('variable: "--font-cinzel"'),
      "Fonts must be declared as CSS variables to avoid render-blocking"
    );
  });

  await t.test("2. next.config.ts optimizes package imports and image formats", () => {
    assert.ok(
      configCode.includes("optimizePackageImports:"),
      "next.config.ts must configure optimizePackageImports"
    );
    assert.ok(
      configCode.includes('"lucide-react"') &&
      configCode.includes('"date-fns"'),
      "Must optimize tree-shaking for heavy libraries (lucide-react, date-fns)"
    );
    assert.ok(
      configCode.includes('formats: ["image/avif", "image/webp"]'),
      "Image configuration must specify modern AVIF and WebP formats"
    );
    assert.ok(
      configCode.includes("minimumCacheTTL: 86400"),
      "Image assets must have minimum 24-hour cache TTL"
    );
    assert.ok(
      configCode.includes("compress: true"),
      "Must enable gzip/brotli compression"
    );
  });
});
