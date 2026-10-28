#!/usr/bin/env node
// Requires: `playwright` as a project devDependency (already required by
// Blueprint Phase 5's Playwright E2E testing layer — this script is meant
// to run at Phase 6 ship-check, after that dependency is already installed).
// If running standalone: `npm install -D playwright && npx playwright install chromium`.
// postdeploy-smoke.mjs
// Verifies a live production URL renders correctly in light, dark, and mobile contexts.
// Usage: node scripts/postdeploy-smoke.mjs <PRODUCTION_URL>
// Exit 0 = all three contexts clean. Exit 1 = one or more failed — investigate before calling ship-check done.

import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const isCli = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
const url = process.argv[2];
if (isCli && !url) {
  console.error('Usage: node scripts/postdeploy-smoke.mjs <PRODUCTION_URL>');
  process.exit(1);
}

const SCREENSHOT_DIR = path.join('Documentation', 'product', 'screenshots');
const today = new Date().toISOString().slice(0, 10);

const CONTEXTS = [
  { mode: 'light', colorScheme: 'light', viewport: { width: 1280, height: 800 } },
  { mode: 'dark', colorScheme: 'dark', viewport: { width: 1280, height: 800 } },
  { mode: 'mobile', colorScheme: 'light', viewport: { width: 375, height: 667 } },
];

async function checkContext(browser, { mode, colorScheme, viewport }) {
  const context = await browser.newContext({ colorScheme, viewport });
  const page = await context.newPage();
  const issues = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') issues.push(`console error: ${msg.text()}`);
  });
  page.on('response', (res) => {
    if (res.status() >= 400) issues.push(`failed request: ${res.status()} ${res.url()}`);
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    issues.push(`navigation error: ${e.message}`);
  }

  const screenshotPath = path.join(SCREENSHOT_DIR, `postdeploy-${mode}-${today}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  await context.close();
  return { mode, issues, screenshotPath };
}

// Link check: warn-only. It prints WARN lines and never changes the exit code,
// because bot-blocked outside links would otherwise fail good deploys.
export async function linkWarnings(target, check) {
  try {
    const run = check ?? (await import(new URL('./check-links.mjs', import.meta.url).href)).checkLinks;
    const report = await run(target, { maxPages: 25 });
    return report.links
      .filter((l) => l.verdict !== 'OK' || l.reasons.length)
      .map((l) => `WARN link ${l.verdict} ${l.url} on ${l.page}${l.reasons.length ? ` (${l.reasons.join(', ')})` : ''}`);
  } catch (e) {
    return [`WARN link check skipped: ${e.message}`];
  }
}

async function main() {
  const { chromium } = await import('playwright');
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const browser = await chromium.launch();

  const results = [];
  for (const ctx of CONTEXTS) {
    results.push(await checkContext(browser, ctx));
  }

  await browser.close();

  let hasFailure = false;
  for (const { mode, issues, screenshotPath } of results) {
    if (issues.length === 0) {
      console.log(`PASS [${mode}] ${screenshotPath}`);
    } else {
      hasFailure = true;
      console.log(`FAIL [${mode}] ${screenshotPath}`);
      for (const issue of issues) console.log(`  - ${issue}`);
    }
  }

  for (const line of await linkWarnings(url)) console.log(line);

  process.exit(hasFailure ? 1 : 0);
}

if (isCli) main().catch((e) => { console.error(e); process.exit(1); });
