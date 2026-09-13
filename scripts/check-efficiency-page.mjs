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

// Internal wording that must never reach the public page.
const FORBIDDEN_TEXT = ['meeting', 'Tom Sawyer', 'Margin at list', 'Withheld', 'full balanced panel'];

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

async function rankedRows(page) {
  return page.locator('.idx-board button.idx-rank').evaluateAll((rows) =>
    rows.map((row) => ({
      name: row.querySelector('.idx-rank-title > span')?.textContent?.trim() ?? '',
      rank: row.getAttribute('data-rank'),
      ratio: Number(row.getAttribute('data-ratio')),
    })),
  );
}

function assertBoardOrder(rows, label) {
  assert.ok(rows.length >= 2, `${label}: expected rows`);
  const ranked = rows.filter((r) => r.rank !== '');
  const unranked = rows.filter((r) => r.rank === '');
  assert.deepEqual(
    ranked.map((r) => Number(r.rank)),
    ranked.map((_, i) => i + 1),
    `${label}: ranks are 1..n in order`,
  );
  for (let i = 1; i < ranked.length; i += 1) {
    assert.ok(ranked[i - 1].ratio >= ranked[i].ratio, `${label}: ratios non-increasing`);
  }
  assert.deepEqual(
    rows.slice(ranked.length).map((r) => r.rank),
    unranked.map(() => ''),
    `${label}: unranked rows come last`,
  );
}

async function checkViewport(browser, width, height, theme) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript((value) => localStorage.setItem('qf-theme', value), theme);
  await page.goto(`${origin}/efficiency/`, { waitUntil: 'domcontentloaded' });

  assert.equal(await page.getByRole('heading', { name: 'Efficiency Index', level: 1 }).count(), 1);
  assert.equal(await page.getByRole('tab').count(), 3);
  assert.equal(
    await page.getByRole('tab', { name: 'Hardware' }).getAttribute('aria-selected'),
    'true',
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    true,
    `${width}px page overflow`,
  );

  // Hardware board: ranked by matched ratio, thin families unranked and last.
  const hw = await rankedRows(page);
  assertBoardOrder(hw, 'hardware');
  assert.notEqual(hw[0].name, '2080 Ti', 'a two-model family must not lead the board');
  assert.ok(hw.some((r) => r.name === 'H100' && r.rank !== ''), 'H100 reference is ranked');
  assert.equal(await page.locator('.idx-divider').count(), hw.some((r) => r.rank === '') ? 1 : 0);
  const hardwareRow = page.locator('.idx-board button.idx-rank').first();
  await hardwareRow.click();
  assert.equal(await hardwareRow.getAttribute('aria-expanded'), 'true');

  // Engines board: vLLM reference, versions shown.
  await page.getByRole('tab', { name: 'Engines' }).click();
  const en = await rankedRows(page);
  assertBoardOrder(en, 'engines');
  assert.equal(en[0].name, 'vLLM');
  const enginesText = await page.evaluate(() => document.body.innerText);
  assert.match(enginesText, /vLLM 0\.19/);
  assert.match(enginesText, /SGLang 0\.5\.9/);

  // Configs: model select, rows sorted by TCO, expandable.
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

  // Experimental panel closed by default, opens to the model list.
  const experimental = page.locator('details.idx-experimental');
  assert.equal(await experimental.getAttribute('open'), null);
  await experimental.locator('summary').click();
  assert.notEqual(await experimental.getAttribute('open'), null);
  assert.equal(await experimental.locator('.idx-plot-svg-model').count(), 1);

  // Methodology open, then sweep the whole page text for internal wording.
  await page.locator('details.idx-method summary').click();
  await page.getByRole('tab', { name: 'Hardware' }).click();
  const fullText = await page.evaluate(() => document.body.innerText);
  for (const needle of FORBIDDEN_TEXT) {
    assert.equal(fullText.toLowerCase().includes(needle.toLowerCase()), false, `page text contains "${needle}"`);
  }
  assert.match(fullText, /Self-hosted ÷ API/i);
  assert.doesNotMatch(fullText, /-\d+%/, 'no negative percentage on the page');
  assert.deepEqual(errors, [], 'no page errors');
  await page.close();
}

let browser;
try {
  await waitForPreview();
  browser = await chromium.launch();
  await checkViewport(browser, 1440, 900, 'dark');
  await checkViewport(browser, 1440, 900, 'light');
  await checkViewport(browser, 390, 844, 'dark');
  await checkViewport(browser, 390, 844, 'light');
  console.log('✓ efficiency page: boards ordered, versions shown, no internal wording, themes, responsive overflow');
} finally {
  await browser?.close();
  preview.kill('SIGTERM');
}
