#!/usr/bin/env node
/**
 * Visual + layout check for the built marketing site.
 *
 *   npx vite preview --outDir dist-web --port 4173 &
 *   node scripts/check-site-visual.mjs http://localhost:4173 ./shots
 *
 * Asserts the things that are easy to break and invisible in a diff: no
 * horizontal overflow at desktop or phone width, no console errors, the app
 * actually mounted, and — when a dashboard is present under /board/ — that the
 * hop from the site to it resolves.
 *
 * Needs playwright + a chromium download (`npx playwright install chromium`).
 * CI does NOT run this: scripts/check-site-bundle.mjs is the check that gates
 * the deploy, and it has no dependencies.
 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4173';
const outDir = process.argv[3];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'phone', width: 390, height: 844 },
];

const browser = await chromium.launch();
const failures = [];

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));

  await page.goto(base, { waitUntil: 'networkidle' });
  // Scroll the whole page so every IntersectionObserver reveal fires, then
  // force the final state so a screenshot cannot race the transition.
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.7;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 80));
    }
    window.scrollTo(0, 0);
  });
  await page.addStyleTag({
    content: '.reveal{opacity:1 !important;transform:none !important;transition:none !important}',
  });
  await page.waitForTimeout(300);

  const m = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    mounted: (document.getElementById('root')?.childElementCount ?? 0) > 0,
    sections: document.querySelectorAll('section').length,
    bodyBg: getComputedStyle(document.body).backgroundColor,
  }));

  if (!m.mounted) failures.push(`${vp.name}: #root is empty — the app did not mount`);
  if (m.scrollWidth > m.clientWidth + 1) {
    failures.push(
      `${vp.name}: horizontal overflow (scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth})`,
    );
  }
  if (m.bodyBg === 'rgba(0, 0, 0, 0)') failures.push(`${vp.name}: body has no explicit background`);
  if (errors.length) failures.push(`${vp.name}: console errors\n    ${errors.join('\n    ')}`);

  console.log(
    `${vp.name.padEnd(8)} ${m.scrollWidth}x — mounted=${m.mounted} sections=${m.sections} ` +
      `overflow=${m.scrollWidth > m.clientWidth + 1 ? 'YES' : 'no'} errors=${errors.length}`,
  );

  if (outDir) await page.screenshot({ path: `${outDir}/${vp.name}.png`, fullPage: true });
  await page.close();
}

// --- does the site -> dashboard hop resolve? ---
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(base, { waitUntil: 'networkidle' });
// Find the dashboard link by where it points, not by a class name — the page's
// markup is expected to change, its link to /board/ is not.
const dashHref = await page.evaluate(() => {
  const a = [...document.querySelectorAll('a[href]')].find((el) =>
    (el.getAttribute('href') || '').replace(/\/+$/, '').endsWith('/board'),
  );
  return a?.getAttribute('href') ?? null;
});
if (!dashHref) failures.push('no link to the dashboard (/board/) found on the page');
const res = await page.goto(new URL(dashHref ?? '/board/', base).toString(), { waitUntil: 'domcontentloaded' });
if (!res || res.status() >= 400) {
  console.log(`dashboard  ${dashHref} -> ${res?.status() ?? 'no response'} (not in this build)`);
} else {
  const mounted = await page
    .waitForFunction(() => (document.getElementById('root')?.childElementCount ?? 0) > 0, { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  console.log(`dashboard  ${dashHref} -> ${res.status()} mounted=${mounted}`);
  if (!mounted) failures.push(`dashboard at ${dashHref} returned ${res.status()} but did not mount`);
}
await page.close();
await browser.close();

if (failures.length) {
  console.error('\n✗ visual check failed:\n');
  for (const f of failures) console.error(`  · ${f}`);
  process.exit(1);
}
console.log('\n✓ visual check passed');
