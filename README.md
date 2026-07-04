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

## Data pipeline

`scripts/build-data.ts` and friends turn raw benchmark results (R2 `results/`)
into the dashboard JSONs; the produced files are uploaded to R2 `json/current/`,
not committed. Prediction JSONs (`simulator-*.json`, `forward-predictions.json`)
are produced by the simulator repos and uploaded the same way.
