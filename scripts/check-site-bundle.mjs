#!/usr/bin/env node
/**
 * Fails the build if the marketing site's bundle contains anything it should
 * not, and if the PUBLIC dashboard bundle beside it contains control-plane
 * wiring.
 *
 * Why this exists
 * ---------------
 * The site and the dashboard live in one repo and deploy from one Cloudflare
 * Pages project. The site is a separate Rollup entry with a disjoint module
 * graph (see vite.config.ts), so leaking dashboard code into it should be
 * impossible — but "should be impossible" is worth an assertion when the blast
 * radius is the apex domain. A stray `import { INTERNAL } from '../env'` in a
 * site component would compile happily; this catches it.
 *
 *   node scripts/check-site-bundle.mjs dist-site   # site only
 *   node scripts/check-site-bundle.mjs dist-web    # site at root + dashboard in board/
 *
 * Zero dependencies on purpose: it must run in CI before anything is deployed,
 * without installing a browser.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: check-site-bundle.mjs <dist-dir>');
  process.exit(2);
}

/** Substrings that must never appear in the marketing bundle. */
const SITE_FORBIDDEN = [
  // R2 data plane — the site is a static snapshot and fetches nothing
  ['r2.dev', 'R2 bucket host'],
  ['pub-38e30ed030784867856634f1625c7130', 'R2 bucket id'],
  ['data.json', 'benchmark corpus'],
  ['sweep-state', 'sweep state'],
  ['serving-predictions', 'serving predictions'],
  ['forward-predictions', 'roofline predictions'],
  ['simulator-v2sim', 'simulator v2 predictions'],
  ['llmservingsim', 'LLMServingSim predictions'],
  // internal-only surfaces
  ['api/host-drain', 'host-drain control endpoint'],
  ['api/gpu-block', 'gpu-block control endpoint'],
  ['gpu-state', 'GPU fleet state'],
  ['coverage-blockers', 'coverage blockers'],
  ['VITE_INTERNAL', 'internal build flag'],
];

/**
 * The public dashboard must not carry the control plane either. This guards the
 * pre-existing public deploy, not just the new site.
 *
 * Deliberately NOT listed here: gpu-state.json, coverage-blockers.*.json and
 * simulator-v2sim-predictions.json. Those URLs are exported unconditionally from
 * src/dataUrls.ts (unlike hostDrainApiUrl/gpuBlockApiUrl, which are gated on
 * INTERNAL), so they DO appear in the public dashboard bundle today. They are
 * URL strings, not data, and whether that matters depends on what is actually
 * uploaded to the R2 bucket — a question for the data pipeline, not this check.
 * Gating them would be a behaviour change to the dashboard, so this script
 * reports on the boundary it owns and leaves that decision alone. If you do
 * decide those should be internal-only, add them here to keep it that way.
 */
const DASHBOARD_FORBIDDEN = [
  ['api/host-drain', 'host-drain control endpoint'],
  ['api/gpu-block', 'gpu-block control endpoint'],
];

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function jsAndCss(assetsDir) {
  if (!(await exists(assetsDir))) return { js: [], css: [] };
  const files = await readdir(assetsDir);
  return {
    js: files.filter((f) => f.endsWith('.js')),
    css: files.filter((f) => f.endsWith('.css')),
  };
}

const failures = [];

// ---------------------------------------------------------------- the site ---
const siteAssets = join(dir, 'assets');
const site = await jsAndCss(siteAssets);

if (site.js.length === 0) {
  failures.push(`no JS emitted in ${siteAssets} — did the site build run?`);
} else if (site.js.length > 1) {
  // A second chunk means something got code-split in. For a one-page static
  // site that is a signal, not an optimisation.
  failures.push(
    `expected exactly 1 site JS chunk, found ${site.js.length}: ${site.js.join(', ')} ` +
      '— an extra chunk usually means dashboard code was pulled in via a dynamic import',
  );
}

for (const file of site.js) {
  const src = await readFile(join(siteAssets, file), 'utf8');
  for (const [needle, what] of SITE_FORBIDDEN) {
    if (src.includes(needle)) failures.push(`site bundle ${file} references ${what} ("${needle}")`);
  }
  // The whole design of this page is that it ships its data as literals.
  if (/\bfetch\s*\(/.test(src) || /XMLHttpRequest/.test(src)) {
    failures.push(
      `site bundle ${file} contains a network call (fetch/XMLHttpRequest) — the landing page must load no data at runtime`,
    );
  }
}

// ------------------------------------------------- the public dashboard, if built ---
const boardAssets = join(dir, 'board', 'assets');
if (await exists(boardAssets)) {
  const board = await jsAndCss(boardAssets);
  if (board.js.length === 0) failures.push(`no JS emitted in ${boardAssets}`);
  for (const file of board.js) {
    const src = await readFile(join(boardAssets, file), 'utf8');
    for (const [needle, what] of DASHBOARD_FORBIDDEN) {
      if (src.includes(needle)) {
        failures.push(
          `PUBLIC dashboard bundle ${file} references ${what} ("${needle}") — ` +
            'this build should have INTERNAL folded to false',
        );
      }
    }
  }
}

// ------------------------------------------------------------------- report ---
if (failures.length) {
  console.error(`\n✗ bundle check failed for ${dir}:\n`);
  for (const f of failures) console.error(`  · ${f}`);
  console.error('');
  process.exit(1);
}

const counted = [
  `site: ${site.js.length} js + ${site.css.length} css`,
  (await exists(boardAssets)) ? 'dashboard: checked for control-plane wiring' : 'dashboard: not in this build',
];
console.log(`✓ bundle check passed for ${dir} (${counted.join('; ')})`);
