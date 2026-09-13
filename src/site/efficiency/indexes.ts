/**
 * Reductions the combined model×hardware×engine board was hiding.
 *
 * Hardware: for each GPU family, mean $/MTok across models (each
 * model is itself a mean across engines / widths), then a 0–100
 * score against the cheapest family. Per-GPU so 1× and 4× sit in
 * the same class — “is H100 cheaper than A100?”, not “is 4×H100
 * cheaper than 1×A100?”.
 *
 * Engine: same TCO, mean $/MTok across families (each family a
 * mean across models) so a corpus that is H100-heavy does not
 * crown an engine.
 *
 * Experimental model efficiency is kept separate from these reductions.
 */
import type { HardwareFamily, IndexRow, Scale } from './score';
import { MODEL_CATALOG_BY_NAME, gflopPerToken, intelPerGflop } from './models';

export const MIN_MATCHED_MODELS = 3;

export interface IndexOptions {
  model?: string;
  minMatchedModels?: number;
}

export interface HardwareIndexRow {
  family: HardwareFamily;
  score: number;
  usdPerMTok: number;
  tokPerDollar: number;
  vsH100: number | null;
  nModels: number;
  nMatchedModels: number;
  nConfigs: number;
  minGpus: number;
  maxGpus: number;
  thinCoverage: boolean;
}

export interface EngineIndexRow {
  engine: string;
  score: number;
  usdPerMTok: number;
  tokPerDollar: number;
  nFamilies: number;
  nModels: number;
  nMatchedPairs: number;
  nConfigs: number;
}

export interface ModelIndexRow {
  model: string;
  score: number;
  intelligence: number;
  estimated: boolean;
  totalParamsB: number;
  activeParamsB: number;
  gflopPerTok: number;
  intelPerGflop: number;
  href: string;
  nConfigs: number;
}

function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function scoreScale(xs: number[]): Scale {
  return { min: Math.min(...xs), max: Math.max(...xs) };
}

function indexScore(raw: number, scale: Scale): number {
  if (!(scale.max > 0)) return NaN;
  return Math.round((100 * raw / scale.max) * 10) / 10;
}

/** Per-GPU TCO $/MTok for one measured config. */
export function configUsdPerMTok(row: IndexRow): number | null {
  return row.raw.tcoUsdPerMTok > 0 ? row.raw.tcoUsdPerMTok : null;
}

/** Equal engines within each model; extra widths/configs cannot add weight. */
function meanUsdByModel(rows: IndexRow[]): Map<string, number> {
  const buckets = new Map<string, Map<string, number[]>>();
  for (const r of rows) {
    const usd = configUsdPerMTok(r);
    if (usd == null) continue;
    const engines = buckets.get(r.model) ?? new Map<string, number[]>();
    const list = engines.get(r.engine) ?? [];
    list.push(usd);
    engines.set(r.engine, list);
    buckets.set(r.model, engines);
  }
  const out = new Map<string, number>();
  for (const [model, engines] of buckets) {
    const m = mean(
      [...engines.values()]
        .map((xs) => mean(xs))
        .filter((n): n is number => n != null),
    );
    if (m != null) out.set(model, m);
  }
  return out;
}

function geoMean(xs: number[]): number | null {
  const valid = xs.filter((x) => x > 0 && Number.isFinite(x));
  if (valid.length === 0) return null;
  return Math.exp(valid.reduce((sum, x) => sum + Math.log(x), 0) / valid.length);
}

function rowMatchKey(r: IndexRow): string {
  return `${r.model}|${r.engine}|${r.quant}|${r.gpus}`;
}

function matchedVsH100(rows: IndexRow[], family: HardwareFamily): {
  ratio: number | null;
  nModels: number;
} {
  if (family === 'H100') {
    return {
      ratio: 1,
      nModels: new Set(rows.filter((r) => r.hardwareFamily === 'H100').map((r) => r.model)).size,
    };
  }
  const h100 = new Map(
    rows
      .filter((r) => r.hardwareFamily === 'H100')
      .map((r) => [rowMatchKey(r), r] as const),
  );
  const byModel = new Map<string, number[]>();
  for (const row of rows.filter((r) => r.hardwareFamily === family)) {
    const ref = h100.get(rowMatchKey(row));
    if (!ref) continue;
    const refCells = new Map(
      ref.raw.costCells.map((cell) => [
        `${cell.profile}|${cell.targetLoad}`,
        cell.tcoUsdPerMTok,
      ]),
    );
    const ratios = byModel.get(row.model) ?? [];
    for (const cell of row.raw.costCells) {
      const refUsd = refCells.get(`${cell.profile}|${cell.targetLoad}`);
      if (refUsd == null || !(cell.tcoUsdPerMTok > 0)) continue;
      ratios.push(refUsd / cell.tcoUsdPerMTok);
    }
    if (ratios.length === 0) continue;
    byModel.set(row.model, ratios);
  }
  const modelRatios = [...byModel.values()]
    .map((xs) => geoMean(xs))
    .filter((n): n is number => n != null);
  return { ratio: geoMean(modelRatios), nModels: modelRatios.length };
}

export function buildHardwareIndex(
  allRows: IndexRow[],
  options: IndexOptions = {},
): HardwareIndexRow[] {
  const rows = options.model ? allRows.filter((r) => r.model === options.model) : allRows;
  const families = [...new Set(rows.map((r) => r.hardwareFamily))];
  const minMatched = options.minMatchedModels ?? (options.model ? 1 : MIN_MATCHED_MODELS);
  const raw = families
    .map((family) => {
      const subset = rows.filter((r) => r.hardwareFamily === family);
      const byModel = meanUsdByModel(subset);
      const usdPerMTok = mean([...byModel.values()]);
      if (usdPerMTok == null || !(usdPerMTok > 0)) return null;
      const matched = matchedVsH100(rows, family);
      const thinCoverage =
        family !== 'H100' && matched.nModels < minMatched;
      return {
        family,
        usdPerMTok,
        tokPerDollar: 1e6 / usdPerMTok,
        matchedVsH100: thinCoverage ? null : matched.ratio,
        nModels: byModel.size,
        nMatchedModels: matched.nModels,
        nConfigs: subset.filter((r) => configUsdPerMTok(r) != null).length,
        minGpus: Math.min(...subset.map((r) => r.gpus)),
        maxGpus: Math.max(...subset.map((r) => r.gpus)),
        thinCoverage,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  const scale = scoreScale(raw.map((r) => r.tokPerDollar));
  return raw
    .map(({ matchedVsH100, ...r }) => ({
        ...r,
        score: indexScore(r.tokPerDollar, scale),
        vsH100: matchedVsH100,
      }))
    .sort((a, b) => a.usdPerMTok - b.usdPerMTok || a.family.localeCompare(b.family));
}

export function buildEngineIndex(
  allRows: IndexRow[],
  options: Pick<IndexOptions, 'model'> = {},
): EngineIndexRow[] {
  const rows = options.model ? allRows.filter((r) => r.model === options.model) : allRows;
  const engines = [...new Set(rows.map((r) => r.engine))];
  const pairsByEngine = new Map<string, Set<string>>();
  for (const engine of engines) {
    pairsByEngine.set(
      engine,
      new Set(
        rows
          .filter((r) => r.engine === engine && configUsdPerMTok(r) != null)
          .map((r) => `${r.hardwareFamily}|${r.model}`),
      ),
    );
  }
  const commonPairs = new Set(
    [...(pairsByEngine.get(engines[0]) ?? [])].filter((pair) =>
      engines.every((engine) => pairsByEngine.get(engine)?.has(pair)),
    ),
  );
  const raw = engines
    .map((engine) => {
      const subset = rows.filter(
        (r) =>
          r.engine === engine &&
          commonPairs.has(`${r.hardwareFamily}|${r.model}`),
      );
      const families = [...new Set(subset.map((r) => r.hardwareFamily))];
      const perFamily: number[] = [];
      for (const family of families) {
        const byModel = meanUsdByModel(subset.filter((r) => r.hardwareFamily === family));
        const m = mean([...byModel.values()]);
        if (m != null) perFamily.push(m);
      }
      const usdPerMTok = mean(perFamily);
      if (usdPerMTok == null || !(usdPerMTok > 0)) return null;
      return {
        engine,
        usdPerMTok,
        tokPerDollar: 1e6 / usdPerMTok,
        nFamilies: perFamily.length,
        nModels: new Set(subset.map((r) => r.model)).size,
        nMatchedPairs: commonPairs.size,
        nConfigs: subset.filter((r) => configUsdPerMTok(r) != null).length,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  const scale = scoreScale(raw.map((r) => r.tokPerDollar));

  return raw
    .map((r) => ({
      ...r,
      score: indexScore(r.tokPerDollar, scale),
    }))
    .sort((a, b) => a.usdPerMTok - b.usdPerMTok || a.engine.localeCompare(b.engine));
}

export function modelNames(rows: IndexRow[]): string[] {
  return [...new Set(rows.map((r) => r.model))].sort((a, b) => a.localeCompare(b));
}

export function buildModelIndex(rows: IndexRow[]): ModelIndexRow[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.model, (counts.get(row.model) ?? 0) + 1);
  const raw: Array<Omit<ModelIndexRow, 'score'>> = [];
  for (const [model, nConfigs] of counts) {
    const catalog = MODEL_CATALOG_BY_NAME.get(model);
    if (!catalog) continue;
    const ratio = intelPerGflop(catalog.intelligence, catalog.activeParamsB);
    if (!(ratio > 0)) continue;
    raw.push({
      model,
      intelligence: catalog.intelligence,
      estimated: catalog.estimated,
      totalParamsB: catalog.totalParamsB,
      activeParamsB: catalog.activeParamsB,
      gflopPerTok: gflopPerToken(catalog.activeParamsB),
      intelPerGflop: ratio,
      href: catalog.href,
      nConfigs,
    });
  }
  const scale = scoreScale(raw.map((r) => r.intelPerGflop));
  return raw
    .map((r) => ({ ...r, score: indexScore(r.intelPerGflop, scale) }))
    .sort(
      (a, b) =>
        b.intelPerGflop - a.intelPerGflop ||
        b.intelligence - a.intelligence ||
        a.model.localeCompare(b.model),
    );
}

export function configTcoUsdPerMTok(row: IndexRow): number | null {
  return configUsdPerMTok(row);
}
