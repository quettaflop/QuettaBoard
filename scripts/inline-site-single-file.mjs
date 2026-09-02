#!/usr/bin/env node
/**
 * Folds a built marketing site into self-contained HTML, for sharing a preview
 * without a host:
 *
 *   <dir>/standalone.html — a complete document, droppable anywhere
 *   <dir>/artifact.html   — head + body CONTENT only, for hosts that supply
 *                           their own <!doctype>/<html>/<head>/<body> skeleton
 *
 *   node scripts/inline-site-single-file.mjs dist-site
 *
 * Both are assembled from the source template plus the emitted chunks. Nothing
 * regexes the *assembled* document: the minified bundle contains strings that
 * look like closing tags, so splitting it after the fact silently truncates the
 * page.
 *
 * Not part of the deploy — `npm run build:web` produces what Cloudflare serves.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist-site';

const html = await readFile(join(dist, 'index.html'), 'utf8');
const assets = await readdir(join(dist, 'assets'));

const js = assets.filter((f) => f.endsWith('.js'));
const css = assets.filter((f) => f.endsWith('.css'));
if (js.length !== 1 || css.length !== 1) {
  // More than one chunk means the vite config changed; bail loudly rather than
  // silently emitting a page that is missing half its code.
  throw new Error(`expected exactly 1 js and 1 css chunk, got ${js.length} js / ${css.length} css`);
}

const jsSrc = await readFile(join(dist, 'assets', js[0]), 'utf8');
const cssSrc = await readFile(join(dist, 'assets', css[0]), 'utf8');

// --- split the *template* (small, no minified payload) into head and body ---
const headMatch = html.match(/<head>([\s\S]*)<\/head>/);
const bodyMatch = html.match(/<body>([\s\S]*)<\/body>/);
if (!headMatch || !bodyMatch) throw new Error(`could not find <head>/<body> in ${dist}/index.html`);

const stripTagRefs = (s) =>
  s
    // the built asset links are replaced by inline <style>/<script>
    .replace(new RegExp(`\\s*<link rel="stylesheet"[^>]*${css[0]}[^>]*>`), '')
    .replace(new RegExp(`\\s*<script[^>]*${js[0]}[^>]*></script>`), '')
    // favicons point at paths that will not exist beside a lone file
    .replace(/\s*<link rel="(?:icon|apple-touch-icon)"[^>]*>/g, '');

const headInner = stripTagRefs(headMatch[1]).trim();
const bodyInner = stripTagRefs(bodyMatch[1]).trim();

const style = `<style>${cssSrc}</style>`;
const script = `<script type="module">${jsSrc}</script>`;

const standalone = `<!doctype html>
<html lang="en">
  <head>
    ${headInner}
    ${style}
  </head>
  <body>
    ${bodyInner}
    ${script}
  </body>
</html>
`;

// The deployed site wants the long, descriptive <title> for search results. A
// preview host uses <title> as the page's NAME in a gallery, where a sentence
// reads as a caption — so the fragment carries the short name instead.
const ARTIFACT_TITLE = 'Quettaflop';
const fragment =
  `${headInner.replace(/<title>[\s\S]*?<\/title>/, `<title>${ARTIFACT_TITLE}</title>`)}\n` +
  `${style}\n${bodyInner}\n${script}\n`;

await writeFile(join(dist, 'standalone.html'), standalone);
await writeFile(join(dist, 'artifact.html'), fragment);

const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} kB`;
console.log(`${dist}/standalone.html: ${kb(standalone)}`);
console.log(`${dist}/artifact.html:   ${kb(fragment)}`);
