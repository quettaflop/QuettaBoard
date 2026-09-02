# QuettaBoard

The results dashboard for the Quetta stack: benchmark ground truth from
[QuettaBench](https://github.com/quettaflop/QuettaBench), latency predictions
from [QuettaSim](https://github.com/quettaflop/QuettaSim), profiling views, and
the roofline explorer. React + Vite + Tailwind, static — all data is fetched at
runtime as JSON from the `agent-bench` R2 bucket (`json/current/`).

This repo also holds the **public marketing site** for quettaflop.ai as a second,
separate app — see [The marketing site](#the-marketing-site). The two deploy
together from one Cloudflare Pages project: site at `/`, dashboard at `/board/`.

## Develop

```bash
npm ci
npm run dev        # the dashboard
npm run dev:site   # the marketing site (site.html)
```

The dev server reads the same R2 JSONs as production. To point at different
data, set the `VITE_*_JSON_URL` env vars (see `src/dataUrls.ts`) or
`VITE_R2_JSON_BASE` for the whole base.

## Build

Three different kinds of thing get built here, and it is worth keeping them
straight:

| Command | Kind | Output | What |
| --- | --- | --- | --- |
| `npm run build` (= `build:public`) | dashboard **flavour** | `dist/` | the dashboard, internal pages compiled out |
| `npm run build:internal` | dashboard **flavour** | `dist/` | the dashboard plus internal pages — tailnet only |
| `npm run build:site` | separate **app** | `dist-site/` | the marketing landing page |
| `npm run build:web` | **deploy bundle** | `dist-web/` | `build:site` + `build:public` composed: site at `/`, dashboard at `/board/` |

A *flavour* is one source tree compiled two ways behind `VITE_INTERNAL` (see
[Public vs internal builds](#public-vs-internal-builds)). The *site* is a
different app that happens to live in this repo. The *web* bundle is neither — it
is just the two outputs stacked into one directory for Cloudflare. `build:web` is
what CI deploys.

Deploys as static files (Cloudflare Pages is the target host).

## Public vs internal builds

The dashboard ships in two flavours from the same source tree. Because a static
SPA sends all of its JS to the browser, internal tooling is *compiled out* of the
public bundle rather than merely hidden behind a tab — the boundary is network +
build, not UI.

| Flavour | Command | Pages | Where it may run |
| --- | --- | --- | --- |
| **Public** | `npm run build:public` | `benchmark` only (latency / throughput / comparison / multi-turn / raw) | Public Cloudflare Pages |
| **Internal** | `npm run build:internal` | `benchmark` + `simulator` (and future `gpu` / `profiling` orchestration pages) | Tailscale / loopback only — **never** public Cloudflare |

The marketing site is **not** a third flavour. It lives in this repo, but it has
its own entry and its own module graph, so none of the above applies to it —
there is no flag to get wrong, because the internal code is never linked in. See
[The marketing site](#the-marketing-site).

The split is driven by a single flag, `VITE_INTERNAL=1` (see `src/env.ts`). When
it is unset, `INTERNAL` folds to a compile-time `false`, so:

- `#simulator` in a public URL just resolves to the benchmark page.
- The internal page component is a gated dynamic import, so Rollup never emits
  its chunk into the public `dist/` — the internal page code is physically
  absent from the public bundle.
- The GPU control API endpoints (`hostDrainApiUrl` / `gpuBlockApiUrl` /
  `dashboardApiBase` in `src/dataUrls.ts`) resolve to empty strings, so public
  JS has no reachable orchestrator.

The **control API server is internal-only** and must sit behind the same
Tailscale/loopback boundary as the internal build — it is never exposed on the
public host. For internal development use `npm run dev:internal`.

## The marketing site

`src/site/` is the public landing page for quettaflop.ai. It is a **second app in
this repo**, not a third mode of the dashboard:

| | dashboard | site |
| --- | --- | --- |
| entry | `index.html` → `src/main.tsx` | `site.html` → `src/site/main.tsx` |
| vite config | `vite.config.ts` | `vite.site.config.ts` |
| stylesheet | `src/index.css` | `src/site/site.css` |
| data | fetched from R2 at runtime | **none** — literals in `src/site/siteData.ts` |
| output | `dist/` | `dist-site/`, or `dist-web/` alongside the dashboard |

### Why a separate entry rather than a third flag

`VITE_INTERNAL` protects one module graph using dead-code elimination. That is
the right tool for one app with two faces, but it is still a flag, and the
marketing page sits on the apex domain — the widest audience anything here has.
So the site is a **disjoint module graph** instead: `src/site/` imports nothing
from `src/env.ts`, `src/dataUrls.ts` or `src/App.tsx`, so the GPU control plane
and the R2 endpoints are not eliminated from the site bundle, they were never
linked into it.

`scripts/check-site-bundle.mjs` asserts that on the built output — it fails the
build if the site bundle mentions an R2 URL, a control endpoint, or any network
call at all, and if the *public* dashboard bundle carries control-plane wiring.
It has no dependencies so CI runs it before anything is deployed. `npm run
build:site` and `build:web` both invoke it; CI runs it again as its own step.

### Commands

```bash
npm run dev:site           # dev server on site.html
npm run build:site         # -> dist-site/  (runs the bundle check)
npm run build:web          # -> dist-web/   site at /, public dashboard at /board/
npm run check:site-bundle  # the boundary check on its own
npm run check:site-visual  # overflow / console / mount check, needs playwright
npm run build:site-single  # dist-site/standalone.html + artifact.html, for previews
```

`check:site-visual` needs `npx playwright install chromium` once. CI does not run
it — the dependency-free bundle check is what gates the deploy.

### Figures on the page

Every number is a literal in `src/site/siteData.ts`, snapshotted from the
published corpus and dated by `SNAPSHOT_DATE`. Nothing is fetched, so the page
renders identically forever and survives the bucket being re-keyed. To update
the figures, re-derive them and edit that file.

One figure needs care: `VALIDATION` quotes the simulator's median absolute
percentage error on the **active validation scope** (827 of 5,756 runs,
`data_scope="current"`), not the whole corpus — the archived scopes score far
worse and are excluded deliberately. The rendered section says so, and names
TTFT-under-live-cache as the metric that is still bad. Keep both caveats if you
change the numbers.

### Design

`src/site/site.css` is a deliberate copy of the dashboard's palette, glass
surfaces, dot-grid canvas and grain, so site and product read as one thing. It is
a copy rather than a shared import because the site loads Archivo + JetBrains
Mono and the dashboard does not — a shared `--mono` would change the dashboard's
figures on any machine with JetBrains Mono installed. **Restyle a surface in one
file and you must restyle it in the other.**

## Data pipeline

`scripts/build-data.ts` and friends turn raw benchmark results (R2 `results/`)
into the dashboard JSONs; the produced files are uploaded to R2 `json/current/`,
not committed. Prediction JSONs (`simulator-*.json`, `forward-predictions.json`)
are produced by the simulator repos and uploaded the same way.
