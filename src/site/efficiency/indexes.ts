/**
 * The two published reductions of the model × hardware × engine board.
 *
 * Both indices rank on a **matched panel**: a group (GPU family, or serving
 * engine) is compared with a reference group only on configurations that
 * exist on both sides with the same model, quantization, GPU width and
 * counterpart, and only on workload cells (profile × target load) measured
 * on both. Within a config the cell cost ratios are combined with the
 * published load weights; configs are then geo-averaged within a model and
 * models are geo-averaged with equal weight. A model that was measured on
 * only one side therefore cannot move the ratio, and a family measured on
 * ten cheap small models does not look better than one measured on three
 * 70B models.
 *
 * Hardware: reference H100, match key model|engine|quant|gpus.
 * Engine:   reference vLLM, match key model|hardware|quant.
 *
 * Groups matched on fewer than MIN_MATCHED_MODELS models are listed but not
 * ranked, and their ratio is not published.
 *
 * The plain arithmetic mean $/MTok over everything a group was measured on
 * is still computed (`usdPerMTok`) but only as coverage-dependent context.

 */
import { LOAD_WEIGHTS, weightedGeoMean, type HardwareFamily, type IndexRow } from './score';
import { ENGINE_REFERENCE } from './engines';

export const MIN_MATCHED_MODELS = 3;
export const HARDWARE_REFERENCE: HardwareFamily = 'H100';

export interface IndexOptions {
  model?: string;
  minMatchedModels?: number;
}

/** Everything the matched comparison against the reference group yields. */
export interface MatchedPanel {
  /** reference $ ÷ group $ on identical cells; > 1 means better value than the reference. */
  ratio: number | null;
  nModels: number;
  nModelsBetter: number;
  nConfigs: number;
  nCells: number;
  /** Load-weighted geo-mean $/MTok on the matched cells, group side. */
  typicalUsd: number | null;
  /** The same cells, reference side. typicalRefUsd / typicalUsd === ratio. */
  typicalRefUsd: number | null;
}

interface RankedFields {
  rank: number | null;
  /** 100 × ratio / best ranked ratio. null when unranked. */
  score: number | null;
  typicalUsdPerMTok: number | null;
  typicalRefUsdPerMTok: number | null;
  nMatchedModels: number;
  nModelsBetter: number;
  nMatchedConfigs: number;
  nMatchedCells: number;
  thinCoverage: boolean;
}

export interface HardwareIndexRow extends RankedFields {
  family: HardwareFamily;
  /** Published only when ranked. */
  vsH100: number | null;
  /** Full-panel arithmetic mean over models; coverage-dependent, detail only. */
  usdPerMTok: number;
  tokPerDollar: number;
  nModels: number;
  nConfigs: number;
  minGpus: number;
  maxGpus: number;
}

export interface EngineIndexRow extends RankedFields {
  engine: string;
  /** Published only when ranked. */
  vsRef: number | null;
  usdPerMTok: number;
  tokPerDollar: number;
  nFamilies: number;
  nModels: number;
  nConfigs: number;
}

function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function geoMean(xs: number[]): number | null {
  const valid = xs.filter((x) => x > 0 && Number.isFinite(x));
  if (valid.length === 0) return null;
  return Math.exp(valid.reduce((sum, x) => sum + Math.log(x), 0) / valid.length);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Per-GPU TCO $/MTok for one measured config. */
export function configUsdPerMTok(row: IndexRow): number | null {
  return row.raw.tcoUsdPerMTok > 0 ? row.raw.tcoUsdPerMTok : null;
}

export function configTcoUsdPerMTok(row: IndexRow): number | null {
  return configUsdPerMTok(row);
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

function cellKey(cell: { profile: string; targetLoad: number }): string {
  return `${cell.profile}|${cell.targetLoad}`;
}

/**
 * Compare `group` with `ref` on identical configs and cells.
 * When group === ref every config matches itself and the ratio is exactly 1.
 */
export function matchedPanel(
  rows: IndexRow[],
  groupOf: (row: IndexRow) => string,
  group: string,
  ref: string,
  matchKey: (row: IndexRow) => string,
): MatchedPanel {
  const refRows = new Map<string, IndexRow>();
  for (const r of rows) if (groupOf(r) === ref) refRows.set(matchKey(r), r);

  // model -> per-config [ratio, usd, refUsd]
  const perModel = new Map<string, Array<{ ratio: number; usd: number; refUsd: number }>>();
  let nCells = 0;

  for (const row of rows) {
    if (groupOf(row) !== group) continue;
    const refRow = refRows.get(matchKey(row));
    if (!refRow) continue;
    const refCells = new Map(refRow.raw.costCells.map((c) => [cellKey(c), c.tcoUsdPerMTok]));
    const ratioParts: Array<{ value: number; weight: number }> = [];
    const usdParts: Array<{ value: number; weight: number }> = [];
    const refParts: Array<{ value: number; weight: number }> = [];
    for (const cell of row.raw.costCells) {
      const refUsd = refCells.get(cellKey(cell));
      if (refUsd == null || !(refUsd > 0) || !(cell.tcoUsdPerMTok > 0)) continue;
      const weight = LOAD_WEIGHTS[cell.targetLoad];
      ratioParts.push({ value: refUsd / cell.tcoUsdPerMTok, weight });
      usdParts.push({ value: cell.tcoUsdPerMTok, weight });
      refParts.push({ value: refUsd, weight });
      nCells += 1;
    }
    const ratio = weightedGeoMean(ratioParts);
    const usd = weightedGeoMean(usdParts);
    const refUsd = weightedGeoMean(refParts);
    if (ratio == null || usd == null || refUsd == null) continue;
    const list = perModel.get(row.model) ?? [];
    list.push({ ratio, usd, refUsd });
    perModel.set(row.model, list);
  }

  const modelRatios: number[] = [];
  const modelUsd: number[] = [];
  const modelRefUsd: number[] = [];
  let nConfigs = 0;
  for (const configs of perModel.values()) {
    const r = geoMean(configs.map((c) => c.ratio));
    const u = geoMean(configs.map((c) => c.usd));
    const v = geoMean(configs.map((c) => c.refUsd));
    if (r == null || u == null || v == null) continue;
    modelRatios.push(r);
    modelUsd.push(u);
    modelRefUsd.push(v);
    nConfigs += configs.length;
  }

  return {
    ratio: geoMean(modelRatios),
    nModels: modelRatios.length,
    nModelsBetter: group === ref ? 0 : modelRatios.filter((r) => r > 1).length,
    nConfigs,
    nCells,
    typicalUsd: geoMean(modelUsd),
    typicalRefUsd: geoMean(modelRefUsd),
  };
}

/**
 * Assign rank / score to groups that clear the coverage bar. The reference
 * group is always rankable. Returns rows sorted ranked-first (best ratio
 * first), then unranked by name.
 */
function rankGroups<T extends { name: string; panel: MatchedPanel }>(
  groups: T[],
  ref: string,
  minMatched: number,
): Array<T & RankedFields & { publishedRatio: number | null }> {
  const eligible = groups.filter(
    (g) => g.panel.ratio != null && (g.name === ref || g.panel.nModels >= minMatched),
  );
  const best = Math.max(...eligible.map((g) => g.panel.ratio as number));
  const rankOf = new Map<string, number>();
  [...eligible]
    .sort((a, b) => (b.panel.ratio as number) - (a.panel.ratio as number) || a.name.localeCompare(b.name))
    .forEach((g, i) => rankOf.set(g.name, i + 1));

  return groups
    .map((g) => {
      const rank = rankOf.get(g.name) ?? null;
      const ranked = rank != null;
      return {
        ...g,
        rank,
        score: ranked && best > 0 ? round1((100 * (g.panel.ratio as number)) / best) : null,
        publishedRatio: ranked ? g.panel.ratio : null,
        typicalUsdPerMTok: ranked ? g.panel.typicalUsd : null,
        typicalRefUsdPerMTok: ranked ? g.panel.typicalRefUsd : null,
        nMatchedModels: g.panel.nModels,
        nModelsBetter: g.panel.nModelsBetter,
        nMatchedConfigs: g.panel.nConfigs,
        nMatchedCells: g.panel.nCells,
        thinCoverage: !ranked,
      };
    })
    .sort((a, b) => {
      if (a.rank != null && b.rank != null) return a.rank - b.rank;
      if (a.rank != null) return -1;
      if (b.rank != null) return 1;
      return a.name.localeCompare(b.name);
    });
}

/** The ranking fields every published board row carries. */
function publicFields(g: RankedFields): RankedFields {
  return {
    rank: g.rank,
    score: g.score,
    typicalUsdPerMTok: g.typicalUsdPerMTok,
    typicalRefUsdPerMTok: g.typicalRefUsdPerMTok,
    nMatchedModels: g.nMatchedModels,
    nModelsBetter: g.nModelsBetter,
    nMatchedConfigs: g.nMatchedConfigs,
    nMatchedCells: g.nMatchedCells,
    thinCoverage: g.thinCoverage,
  };
}

const hardwareMatchKey = (r: IndexRow) => `${r.model}|${r.engine}|${r.quant}|${r.gpus}`;
const engineMatchKey = (r: IndexRow) => `${r.model}|${r.hardware}|${r.quant}`;

export function buildHardwareIndex(
  allRows: IndexRow[],
  options: IndexOptions = {},
): HardwareIndexRow[] {
  const rows = options.model ? allRows.filter((r) => r.model === options.model) : allRows;
  const families = [...new Set(rows.map((r) => r.hardwareFamily))];
  const minMatched = options.minMatchedModels ?? (options.model ? 1 : MIN_MATCHED_MODELS);

  const groups = families
    .map((family) => {
      const subset = rows.filter((r) => r.hardwareFamily === family);
      const byModel = meanUsdByModel(subset);
      const usdPerMTok = mean([...byModel.values()]);
      if (usdPerMTok == null || !(usdPerMTok > 0)) return null;
      return {
        name: family as string,
        family,
        panel: matchedPanel(rows, (r) => r.hardwareFamily, family, HARDWARE_REFERENCE, hardwareMatchKey),
        usdPerMTok,
        tokPerDollar: 1e6 / usdPerMTok,
        nModels: byModel.size,
        nConfigs: subset.filter((r) => configUsdPerMTok(r) != null).length,
        minGpus: Math.min(...subset.map((r) => r.gpus)),
        maxGpus: Math.max(...subset.map((r) => r.gpus)),
      };
    })
    .filter((g): g is NonNullable<typeof g> => g != null);

  return rankGroups(groups, HARDWARE_REFERENCE, minMatched).map((g) => ({
    ...publicFields(g),
    family: g.family,
    vsH100: g.publishedRatio,
    usdPerMTok: g.usdPerMTok,
    tokPerDollar: g.tokPerDollar,
    nModels: g.nModels,
    nConfigs: g.nConfigs,
    minGpus: g.minGpus,
    maxGpus: g.maxGpus,
  }));
}

export function buildEngineIndex(
  allRows: IndexRow[],
  options: IndexOptions = {},
): EngineIndexRow[] {
  const rows = options.model ? allRows.filter((r) => r.model === options.model) : allRows;
  const engines = [...new Set(rows.map((r) => r.engine))];
  const minMatched = options.minMatchedModels ?? (options.model ? 1 : MIN_MATCHED_MODELS);

  const groups = engines
    .map((engine) => {
      const subset = rows.filter((r) => r.engine === engine);
      const families = [...new Set(subset.map((r) => r.hardwareFamily))];
      const perFamily: number[] = [];
      for (const family of families) {
        const m = mean([...meanUsdByModel(subset.filter((r) => r.hardwareFamily === family)).values()]);
        if (m != null) perFamily.push(m);
      }
      const usdPerMTok = mean(perFamily);
      if (usdPerMTok == null || !(usdPerMTok > 0)) return null;
      return {
        name: engine,
        engine,
        panel: matchedPanel(rows, (r) => r.engine, engine, ENGINE_REFERENCE, engineMatchKey),
        usdPerMTok,
        tokPerDollar: 1e6 / usdPerMTok,
        nFamilies: perFamily.length,
        nModels: new Set(subset.map((r) => r.model)).size,
        nConfigs: subset.filter((r) => configUsdPerMTok(r) != null).length,
      };
    })
    .filter((g): g is NonNullable<typeof g> => g != null);

  return rankGroups(groups, ENGINE_REFERENCE, minMatched).map((g) => ({
    ...publicFields(g),
    engine: g.engine,
    vsRef: g.publishedRatio,
    usdPerMTok: g.usdPerMTok,
    tokPerDollar: g.tokPerDollar,
    nFamilies: g.nFamilies,
    nModels: g.nModels,
    nConfigs: g.nConfigs,
  }));
}

export function modelNames(rows: IndexRow[]): string[] {
  return [...new Set(rows.map((r) => r.model))].sort((a, b) => a.localeCompare(b));
}
