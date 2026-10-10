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

async function checkContact(page, label, keyboard = false) {
  const orbit = page.getByRole('link', { name: 'Get in touch with Quettaflop' });
  assert.equal(await orbit.getAttribute('href'), '#contact-title');
  await orbit.scrollIntoViewIfNeeded();
  if (keyboard) await orbit.focus();
  const startY = await page.evaluate(() => scrollY);
  if (keyboard) await orbit.press('Enter');
  else await orbit.locator('span').click();
  await page.waitForFunction(() => document.querySelector('.contact-orbit')?.classList.contains('is-confirmed'));
  assert.equal(await orbit.locator('span svg path').getAttribute('d'), 'M20 6 9 17l-5-5', `${label}: tick`);
  await page.waitForTimeout(700);
  assert.equal(await orbit.evaluate((el) => el.classList.contains('is-confirmed')), true, `${label}: one-second feedback`);
  assert.equal(await orbit.locator('span').evaluate((el) => getComputedStyle(el).backgroundColor), 'rgb(37, 99, 235)', `${label}: blue circle`);
  assert.ok(Math.abs(await page.evaluate(() => scrollY) - startY) < 2, `${label}: feedback before scroll`);
  await page.waitForFunction(() => {
    const heading = document.getElementById('contact-title');
    const rect = heading?.getBoundingClientRect();
    return heading?.classList.contains('contact-title-flash') && document.activeElement === heading
      && rect.top >= 0 && rect.bottom <= innerHeight;
  });
  const heading = page.locator('#contact-title');
  const reduced = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  assert.equal(await heading.evaluate((el) => getComputedStyle(el).animationName), reduced ? 'none' : 'contact-title-flash', `${label}: motion preference`);
  if (outDir && !reduced) {
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${outDir}/contact-${label}.png`, clip: await heading.boundingBox() });
  }
  await page.waitForFunction(() => !document.getElementById('contact-title')?.classList.contains('contact-title-flash'));
  assert.equal(await orbit.evaluate((el) => el.classList.contains('is-confirmed')), false, `${label}: feedback resets`);
  await noOverflow(page, `${label} contact`);
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
      await checkContact(page, `${width}-${theme}`);

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

      await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Careers', exact: true }).click();
      assert.match(new URL(page.url()).pathname, /\/careers\/$/);
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await page.title(), 'Careers — Quettaflop AI');
      assert.equal(await page.locator('h1').count(), 1);
      assert.equal(await page.locator('.career-area').count(), 3);
      assert.equal(await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Careers', exact: true }).getAttribute('aria-current'), 'page');
      const email = new URL(await page.getByRole('link', { name: 'Introduce yourself' }).getAttribute('href'));
      assert.equal(email.protocol, 'mailto:');
      assert.equal(email.pathname, 'pi@quettaflop.ai');
      assert.equal(email.searchParams.get('subject'), 'Careers at Quettaflop');
      await noOverflow(page, `${width}/${theme} careers`);
      await page.evaluate(() => document.fonts.ready);
      if (outDir && (width === 1440 || width === 390)) {
        await page.screenshot({ path: `${outDir}/careers-${width}-${theme}.png`, fullPage: true });
      }
      await page.getByRole('link', { name: 'Explore our work' }).click();
      assert.equal(new URL(page.url()).hash, '#work');
      assert.equal(await page.locator('.chapter').count(), 3);
      assert.deepEqual(errors, [], `${width}/${theme}: browser errors`);
      console.log(`✓ ${width}px ${theme}: layout, notes, theme, blog, careers, ${posts.length} article routes`);
      await page.close();
    }
  }
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.goto(new URL('/#predict', base).href, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('#predict .notes-btn').getAttribute('aria-expanded'), 'true', 'product deep link');
  assert.equal(await page.locator('.contact-orbit > svg').evaluate((el) => getComputedStyle(el).animationName), 'none', 'reduced motion');
  await page.close();
  for (const width of [1440, 390]) {
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'no-preference' });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript((t) => localStorage.setItem('qf-theme', t), theme);
      await page.goto(base, { waitUntil: 'networkidle' });
      await checkContact(page, `${width}-${theme}`);
      // Keyboard activation also replays the animation after a completed click.
      await checkContact(page, `${width}-${theme}-keyboard`, true);
      const orbit = page.locator('.contact-orbit');
      await orbit.scrollIntoViewIfNeeded();
      await orbit.click();
      await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Careers', exact: true }).click();
      await page.waitForTimeout(1300);
      assert.equal(await page.locator('#contact-title').count(), 0, 'navigation cancels contact effect');
      assert.deepEqual(errors, [], `${width}/${theme}: contact browser errors`);
      await page.close();
      console.log(`✓ ${width}px ${theme}: contact click, keyboard, repeat, animation, navigation cleanup`);
    }
  }
} finally {
  await browser.close();
}
console.log('✓ marketing site visual and interaction checks passed');
