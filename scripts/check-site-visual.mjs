#!/usr/bin/env node
/** Responsive and interaction checks against the built marketing site.
 * npx vite preview --outDir dist-site --port 4173
 * node scripts/check-site-visual.mjs http://localhost:4173 ./shots
 * The dashboard remains unadvertised, per the site's content policy.
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4173';
const outDir = process.argv[3];
if (outDir) await mkdir(outDir, { recursive: true });

const published = new URL('../src/site/posts/published/', import.meta.url);
const posts = [];
for (const entry of await readdir(published, { withFileTypes: true })) {
  if (entry.isDirectory()) {
    posts.push({ slug: entry.name, ...JSON.parse(await readFile(new URL(`${entry.name}/post.json`, published), 'utf8')) });
  }
}

async function noOverflow(page, label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${label}: horizontal overflow`);
}

const browser = await chromium.launch();
try {
  for (const width of [1440, 1024, 768, 390, 320]) {
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      await page.addInitScript((t) => {
        if (!localStorage.getItem('qf-theme')) localStorage.setItem('qf-theme', t);
      }, theme);
      const response = await page.goto(base, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200);
      assert.equal(await page.locator('h1').count(), 1);
      assert.equal(await page.locator('.chapter').count(), 3);
      await noOverflow(page, `${width}/${theme} home`);

      for (const id of ['measure', 'predict', 'run']) {
        const button = page.locator(`#${id} .notes-btn`);
        await button.click();
        assert.equal(await button.getAttribute('aria-expanded'), 'true');
        assert.equal(await page.locator(`#${id}-extra`).getAttribute('inert'), null);
        await noOverflow(page, `${width}/${theme} ${id} notes`);
        await button.click();
        assert.equal(await button.getAttribute('aria-expanded'), 'false');
      }

      await page.getByRole('button', { name: `Switch to ${theme === 'light' ? 'dark' : 'light'} theme` }).click();
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await page.locator('html').getAttribute('data-theme'), theme === 'light' ? 'dark' : 'light', 'theme persists');
      // Restore the screenshot's requested theme.
      await page.getByRole('button', { name: `Switch to ${theme} theme` }).click();
      await page.evaluate(() => document.fonts.ready);
      if (outDir && (width === 1440 || width === 390)) {
        await page.screenshot({ path: `${outDir}/${width}-${theme}.png`, fullPage: true });
      }

      await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Blog', exact: true }).click();
      assert.match(new URL(page.url()).pathname, /\/blog\/$/);
      assert.equal(await page.title(), 'Blog — Quettaflop AI');
      assert.equal(await page.locator('.post-card').count(), posts.length);
      await noOverflow(page, `${width}/${theme} blog`);
      for (const post of posts) {
        const response = await page.goto(new URL(`/blog/${post.slug}/`, base).href, { waitUntil: 'networkidle' });
        assert.equal(response.status(), 200, 'direct article route');
        assert.equal(await page.getByRole('heading', { name: post.title, level: 1 }).count(), 1);
        assert.equal(await page.title(), `${post.title} — Quettaflop AI`);
        assert.equal(await page.locator('meta[name="description"]').getAttribute('content'), post.summary);
        assert.ok((await page.locator('.article-body').innerText()).length > 0);
        await noOverflow(page, `${width}/${theme} article`);
      }
      await page.goto(new URL('/blog/missing-post/', base).href, { waitUntil: 'networkidle' });
      assert.equal(await page.getByRole('heading', { name: 'This page hasn’t been written.' }).count(), 1);
      assert.deepEqual(errors, [], `${width}/${theme}: browser errors`);
      console.log(`✓ ${width}px ${theme}: layout, notes, theme, blog, ${posts.length} article routes`);
      await page.close();
    }
  }
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.goto(new URL('/#predict', base).href, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('#predict .notes-btn').getAttribute('aria-expanded'), 'true', 'product deep link');
  assert.equal(await page.locator('.contact-orbit > svg').evaluate((el) => getComputedStyle(el).animationName), 'none', 'reduced motion');
  await page.close();
} finally {
  await browser.close();
}
console.log('✓ marketing site visual and interaction checks passed');
