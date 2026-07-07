# QuettaBoard

The results dashboard for the Quetta stack: benchmark ground truth from
[QuettaBench](https://github.com/quettaflop/QuettaBench), latency predictions
from [QuettaSim](https://github.com/quettaflop/QuettaSim), profiling views, and
the roofline explorer. React + Vite + Tailwind, static — all data is fetched at
runtime as JSON from the `agent-bench` R2 bucket (`json/current/`).

## Develop

```bash
npm ci
npm run dev
```

The dev server reads the same R2 JSONs as production. To point at different
data, set the `VITE_*_JSON_URL` env vars (see `src/dataUrls.ts`) or
`VITE_R2_JSON_BASE` for the whole base.

## Build

```bash
npm run build      # tsc + vite -> dist/
```

Deploys as static files (Cloudflare Pages is the target host).

## Public vs internal builds

The dashboard ships in two flavours from the same source tree. Because a static
SPA sends all of its JS to the browser, internal tooling is *compiled out* of the
public bundle rather than merely hidden behind a tab — the boundary is network +
build, not UI.

| Build | Command | Pages | Where it may run |
| --- | --- | --- | --- |
| **Public** | `npm run build:public` | `benchmark` only (latency / throughput / comparison / multi-turn / raw) | Public Cloudflare Pages |
| **Internal** | `npm run build:internal` | `benchmark` + `simulator` (and future `gpu` / `profiling` orchestration pages) | Tailscale / loopback only — **never** public Cloudflare |

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

## Data pipeline

`scripts/build-data.ts` and friends turn raw benchmark results (R2 `results/`)
into the dashboard JSONs; the produced files are uploaded to R2 `json/current/`,
not committed. Prediction JSONs (`simulator-*.json`, `forward-predictions.json`)
are produced by the simulator repos and uploaded the same way.
