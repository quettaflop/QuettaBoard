import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const port = 4191;
const origin = `http://127.0.0.1:${port}`;
const preview = spawn(
  'npx',
  ['vite', 'preview', '--outDir', 'dist-site', '--host', '127.0.0.1', '--port', String(port)],
  { stdio: 'ignore' },
);

async function waitForPreview() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${origin}/efficiency/`);
      if (response.ok) return;
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('site preview did not start');
}

async function checkViewport(browser, width, height, theme) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.addInitScript((value) => localStorage.setItem('qf-theme', value), theme);
  await page.goto(`${origin}/efficiency/`, { waitUntil: 'domcontentloaded' });

  assert.equal(await page.getByRole('heading', { name: 'Hardware Cost Index' }).count(), 1);
  assert.equal(
    await page.getByRole('tab', { name: 'Hardware' }).getAttribute('aria-selected'),
    'true',
  );
  assert.ok((await page.locator('.idx-plot').count()) >= 2);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    true,
    `${width}px page overflow`,
  );

  const hardwareRow = page.locator('button.idx-rank').first();
  await hardwareRow.click();
  assert.equal(await hardwareRow.getAttribute('aria-expanded'), 'true');

  await page.getByRole('tab', { name: 'Configs' }).click();
  const selector = page.locator('select.idx-select');
  assert.ok((await selector.locator('option').count()) > 1);
  const tco = await page.locator('button.idx-row-cfg').evaluateAll((rows) =>
    rows.map((row) => Number(row.getAttribute('data-tco'))),
  );
  assert.deepEqual(tco, [...tco].sort((a, b) => a - b));
  const configRow = page.locator('button.idx-row-cfg').first();
  await configRow.click();
  assert.equal(await configRow.getAttribute('aria-expanded'), 'true');

  const experimental = page.locator('details.idx-experimental');
  assert.equal(await experimental.getAttribute('open'), null);
  await experimental.locator('summary').click();
  assert.notEqual(await experimental.getAttribute('open'), null);
  assert.equal(await experimental.locator('.idx-plot-svg-model').count(), 1);
}

let browser;
try {
  await waitForPreview();
  browser = await chromium.launch();
  await checkViewport(browser, 1440, 900, 'dark');
  await checkViewport(browser, 1440, 900, 'light');
  await checkViewport(browser, 390, 844, 'dark');
  await checkViewport(browser, 390, 844, 'light');
  console.log('✓ efficiency page: hierarchy, sorting, expansion, themes, responsive overflow');
} finally {
  await browser?.close();
  preview.kill('SIGTERM');
}
