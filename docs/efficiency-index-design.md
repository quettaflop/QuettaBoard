# QuettaBench Efficiency Index — design decisions

Status: implemented on branch `kev/marketing-site`, deployed to
`https://dev.quettaboard.pages.dev/efficiency/`, not yet merged to `main`.
Last updated 2026-09-13. Canonical copy: `docs/efficiency-index-design.md` in
`quettaflop/QuettaBoard`. A mirror lives at `/home/debian/EFFICIENCY_INDEX_DESIGN.md`
on the dev server.

Code: `src/site/efficiency/` (scoring, TCO, indices, catalog, tests),
`src/site/components/EfficiencyIndex.tsx` (page), `scripts/build-efficiency-index.ts`
(snapshot), `scripts/check-efficiency-page.mjs` (browser gate),
`scripts/refresh-market-refs.ts` (OpenRouter reference).

---

## 1. Brief

From Aaron Zhao's direction in the September 2026 team meeting:

- One combined model × hardware × engine board is confusing. Publish separate indices
  instead, each a reduction over the other dimensions.
- A **hardware index**: is an H100 really N× better than an A800/A100? Ground it in what
  the hardware actually costs to own and run for three years, expressed as dollars per
  token, averaged over models and a workload mix.
- An **engine index** (vLLM vs SGLang) built the same way, averaged over hardware.
- A model-level "intelligence per FLOP" index is low priority: smaller models always win
  it and Artificial Analysis already publishes intelligence per dollar.
- Price hardware from secondary-market listings (eBay); use an average electricity price,
  not a country; include an amortisation schedule.
- Cross-validate the resulting cost per token against OpenRouter API pricing.
- UI flow: pick a model, then see the list of hardware × engine configurations.

## 2. What was wrong with the first draft (reviewed 2026-09-13)

1. The headline hardware ranking was the arithmetic mean $/MTok over whatever models each
   GPU had been measured on. A 2080 Ti measured on two small models ranked first; A100
   ranked last while the matched panel on the same page said A100 was 1.7× H100.
2. The engine comparison was demoted to a "sensitivity check" and used arithmetic dollars
   over loosely paired cells.
3. Internal meeting wording ("Tom Sawyer source could not be identified") was on the
   public page.
4. The OpenRouter figure was wrong ($0.04/M vs the listed $0.08/M) and rendered as a
   "−613% margin".
5. Eight of ten AA intelligence scores were flagged as estimates.

Kevin approved the fixes below on 2026-09-13.

---

## 3. Decisions

### D1. Two peer indices, no combined board, no model index

**Decision.** The page is titled *Efficiency Index* with three boards: **Hardware**,
**Engines**, **Configs**. Hardware and Engines are peers built with one method (D3).
Configs is the model-first drill-down Aaron asked for and is unchanged in spirit.

The experimental *model efficiency* panel (AA intelligence ÷ 2 × active params) was
removed on 2026-09-13. The ratio was almost entirely 1 ÷ active parameters (AA scores
in this catalog span 5–23 while active params span 3.3B–72B), the FLOP proxy ignores
attention and KV traffic, and AA already covers model intelligence per dollar. The
verified AA catalog stays in `models.ts` as a dated data asset for a possible future
*intelligence per owned-GPU dollar* view; nothing renders it.

### D2. Cost basis: three-year ownership TCO per GPU board

**Decision.** Cost is what it takes to *own* the GPU and run it for three years, not a
rental GPU-hour. `tco.ts`:

```
r  = (P − R) / (3 · 8760) + (TDP / 1000) · e          $ per GPU-hour
$/M(cell) = r · n_GPU · 10^6 / (tok/s(cell) · 3600)
```

| Input | Value | Source / rationale |
|---|---|---|
| Horizon | 3 years, straight-line to residual | brief |
| Utilisation | 100 % (base case) | disclosed; under-utilisation widens the gap in favour of cheap cards |
| PUE / host / rack / network / cooling | excluded (GPU board only) | disclosed; see §5 |
| Electricity `e` | $0.1002/kWh = mean of DumpsterCluster Table 4 industrial rates (China 0.0556, US 0.12, Brazil 0.125) | brief: an average, not a country. The "Tom Sawyer" paper mentioned in the meeting could not be identified and contributes nothing |
| H100 80GB | P $18,500, R 25 %, 700 W (as of 2026-08) | DumpsterCluster Fig. 2 secondary market |
| A100 40GB | P $1,900, R 10 %, 400 W (2026-03) | DumpsterCluster Fig. 1 eBay-fitted |
| RTX 3090 | P $1,275, R 15 %, 350 W (2026-08) | eBay used median (InsiderLLM) |
| RTX 2080 Ti | P $255, R 5 %, 250 W (2026-06) | eBay used tracker (BestValueGPU; returns 403 to non-browser clients) |

Resulting $/GPU-hour: H100 0.598, A100 0.105, 3090 0.076, 2080 Ti 0.034. Electricity is
12 % of the H100's hourly cost and 38 % of the A100's.

### D3. Rank on matched panels, not on coverage-dependent means

**Decision.** Each index is a ratio against a reference group computed only on
configurations that exist on both sides. `indexes.ts` → `matchedPanel()`.

| | Hardware Index | Engine Index |
|---|---|---|
| Reference | H100 | vLLM |
| Match key (config) | model \| engine \| quant \| GPU count | model \| hardware label \| quant |
| Match key (cell) | workload profile \| target load | same |

Per matched config: load-weighted geometric mean of cell ratios
`$_ref(cell) / $_group(cell)` using the published load weights 25 / 50 / 25 for
concurrency 1 / 40 / 160. Then an equal-weight geometric mean over configs within a model,
then over models. `> 1` means better value than the reference.

- A group matched on fewer than `MIN_MATCHED_MODELS = 3` models is **listed but not
  ranked** and its ratio is not published ("Not yet ranked" divider). The reference is
  always rankable.
- `score = 100 × ratio / best ranked ratio` drives the bar only; the ratio is the number.
- Sort: ranked rows by ratio descending, then unranked by name.

**Why not the alternatives.** Mean over models common to every family collapses to two
models and flips with the thinnest family. Per-model normalisation without a reference
lets a single outlier (Qwen3.5-27B on A100×4 SGLang at $16/M) define a model's baseline.
Two-way fixed effects on log cost is the principled generalisation and is the upgrade
path if a family without H100 overlap (e.g. A800) is added; on today's H100-star design
it reduces to this method.

### D4. The absolute dollar figure is the geo-mean over the same matched cells

**Decision.** The "Typical $ / M" column is the load-weighted geometric mean $/MTok over
exactly the matched cells, reported for both the group and the reference, so
`ref ÷ group` equals the published ratio and the two columns cannot contradict each other.
The arithmetic mean over everything a group ever ran is kept (`usdPerMTok`) but appears
only inside the expanded row, labelled coverage-dependent and not comparable across rows.
Two pathological A100×4 SGLang configs ($27–30/M) dominate any arithmetic mean; the
geo-mean is robust to them.

### D5. Engines are compared as measured builds

**Decision.** The Engine board names the builds recorded on the runs (vLLM 0.19.0–0.19.1,
SGLang 0.5.9, `engines.ts`) and says it compares those builds, not the projects. Runs
with fewer than 90 % successful requests (`MIN_SUCCESS`) are excluded upstream, so a
build that failed a workload is absent from that cell rather than penalised. Corpus check
on 2026-09-13: SGLang 0.5.9 delivered a median 0.64× vLLM 0.19 tok/s on 2,307 matched
raw cells, consistent across concurrency, worst on small and MoE models; the gap is real
in the data and is published rather than suppressed.

### D6. OpenRouter is a bound, not a validation

**Decision.** `market.ts` carries the dated OpenRouter list price for Llama-3.1-8B
($0.05/M in, $0.08/M out as of 2026-09-13), regenerated by
`npm run refresh:market` from the public models API. The page shows
*self-hosted floor ÷ API list* (3.6× on this snapshot) with the range and median of
matching self-hosted configs, and explains why: one node of 1–4 GPUs at ≤160 concurrent
requests costed at full utilisation versus pooled, heavily batched API serving. No
"margin" is shown; it is not a price.

### D7. Public copy hygiene is enforced, not assumed

**Decision.** `scripts/check-efficiency-page.mjs` renders the built page at 1440 px and
390 px in both themes and fails on: wrong board order, a two-model family leading the
board, missing engine versions, any of the strings `meeting`, `Tom Sawyer`,
`Margin at list`, `Withheld`, `full balanced panel`, `Experimental`, a negative
percentage, page errors, or horizontal overflow. `scripts/check-site-bundle.mjs`
separately guarantees the site bundle makes no network call.

### D8. The site ships a frozen snapshot

**Decision.** `snapshot.ts` is a generated literal (101 configs, source
`json/current/data.synthetic_distributional.json` modified 2026-08-30). Nothing is fetched
at runtime. Every decision above operates on fields already in the snapshot
(`raw.costCells[]`), so the method can change without regenerating data. Regenerate with
`scripts/build-efficiency-index.ts <corpus.json>`; the corpus is world-readable at
`https://pub-38e30ed030784867856634f1625c7130.r2.dev/json/current/data.synthetic_distributional.json`.
`INDEX_VERSION` is `2.0` (1.x was the draft method).

### D9. AA scores are verified or absent

**Decision.** Every entry in `models.ts` carries the Intelligence Index v4.3 value read
from the linked Artificial Analysis model page on 2026-09-13, plus the page variant the
score belongs to (AA scores reasoning and non-reasoning variants separately). There is no
`estimated` flag; a model without a verified score is not listed. The AA API needs a key
we do not have; the values are read from the rendered pages.

---

## 4. Results on the 2026-08-30 snapshot

| Hardware | Rank | Value vs H100 | Typical $/M (same cells) | Evidence |
|---|---|---|---|---|
| A100 40GB | 1 | 1.64× | $0.70 vs $1.14 | 9 matched models, better on 9, 30 configs, 441 cells |
| RTX 3090 | 2 | 1.17× | $0.60 vs $0.70 | 5 matched models, better on 3, 20 configs, 295 cells |
| H100 | 3 | 1.00× (reference) | $1.12 | 9 models, 40 configs, 590 cells |
| RTX 2080 Ti | — | not ranked | — | 2 of 3 required models |

| Engine | Rank | Value vs vLLM | Typical $/M | Evidence |
|---|---|---|---|---|
| vLLM 0.19 | 1 | 1.00× (reference) | $0.61 | 10 models, 50 configs, 744 cells |
| SGLang 0.5.9 | 2 | 0.54× | $1.12 vs $0.60 | 10 matched models, better on 0, 44 configs, 643 cells |

Pinned in `indexes.test.ts` (±0.02); a regenerated snapshot may legitimately move them.

## 5. Known sensitivities (read before quoting the A100 result)

The A100 lead is mechanically correct and is the DumpsterCluster thesis: H100 costs 5.7×
as much per GPU-hour on these inputs but delivers ~3.5× the tokens on the matched cells.
It is also fragile:

- **Price.** Break-even used A100 price is **$3,855** (assumed $1,900); the 3090 ties at
  **$1,665** (assumed $1,275); alternatively H100 would need to fall to **$10,350** used.
  Doubling the A100 price erases the result.
- **Load ceiling.** Workloads cap at 160 concurrent requests and configs are matched on
  GPU count, so the H100's larger memory and batching headroom are never exercised. The
  index compares the cards at the A100's comfortable operating point.
- **Board-only TCO.** No host, rack slot, networking, cooling or PUE. An A100 fleet needs
  ~3.5× the slots per token, so every excluded per-slot cost narrows the gap. Electricity
  is 38 % of the A100's hourly cost against 12 % for H100.

Recommended next page change: publish the break-even price on each ranked row so the
claim reads "1.64× at $1,900 a card; ties at about $3,850".

## 6. Not done / follow-ups

- Coverage: four GPU families, ten models ≤ 120B total params, BF16 only, vLLM and
  SGLang only. No RTX 6000 Pro, no QuettaServe, none of the 500B+ models Aaron prioritised.
  Needs benchmark runs and a snapshot regeneration, not a page change.
- Break-even price line (§5), then optionally a utilisation / host-cost slider.
- Two-way fixed-effects ranking if a family without H100 overlap is added.
- Replace or annotate the BestValueGPU 2080 Ti source (HTTP 403 to scripts).

## 7. Operating notes

- Gate: `npm run test:efficiency` (27 tests + snapshot invariants), `npm run build:web`
  (runs the bundle-boundary check), `node scripts/check-efficiency-page.mjs`.
- Deploy dev only: `npx wrangler@3 pages deploy dist-web --project-name=quettaboard
  --branch=dev --commit-dirty=true` (credentials in `/home/debian/.secrets/cloudflare.env`).
  `--branch=main` changes `www.quettaflop.ai`.
- Commits on `kev/marketing-site`: `c9f5979` draft as reviewed, `61fca4e` method and copy
  fixes, `ce45157` model panel removed.
