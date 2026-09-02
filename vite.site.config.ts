import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * The MARKETING SITE build (site.html -> src/site/main.tsx).
 *
 * A separate config rather than a flag inside vite.config.ts, because the two
 * apps having disjoint module graphs is the security property this repo relies
 * on. The site entry never imports src/App.tsx, src/env.ts or src/dataUrls.ts,
 * so no internal page and no R2 endpoint is reachable from it — not
 * dead-code-eliminated, simply never linked.
 *
 * The dashboard's VITE_INTERNAL flag protects one graph with dead-code
 * elimination. This protects a different graph by not containing the code at
 * all. scripts/check-site-bundle.mjs asserts the result on the built output.
 *
 *   npm run dev:site    # dev server
 *   npm run build:site  # -> dist-site/
 *   npm run build:web   # site at root + public dashboard under /board/
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  build: {
    rollupOptions: { input: 'site.html' },
    outDir: 'dist-site',
    // The site is a single chunk with no dynamic imports, so Vite's
    // modulepreload polyfill has nothing to preload — it only adds a fetch()
    // for the page's own script. Dropping it keeps the bundle honest: the
    // built site makes no network calls at all, which is what
    // scripts/check-site-bundle.mjs asserts.
    modulePreload: { polyfill: false },
    // One page with a handful of small assets: inlining under 100kB keeps the
    // output to a single JS + CSS pair, which is what the single-file emitter
    // in scripts/inline-site-single-file.mjs folds together.
    assetsInlineLimit: 100 * 1024,
  },
})
