/**
 * QuettaBench Efficiency Index and Cost Index.
 *
 * Modelled on Artificial Analysis's composite index: one 0–100 score,
 * equal-weight subdomains, equation published. Raw serving metrics are
 * not already 0–100, so each subdomain is log-scaled from the corpus
 * min to the corpus max, then mapped onto 1–100. The slowest published
 * row is 1, the fastest is 100 — same shape as AA, without a zero that
 * reads as a fail. A faster run later rebases the scale.
 *
 * Efficiency (equal 25%):
 *   chat, coding, terminal, computer-use
 *
 * Inside a subdomain, at each load (concurrency 1 / 40 / 160, weights
 * 25 / 50 / 25), the cell score is the geometric mean of
 *   1 / median TPOT,  1 / median TTFT,  output tok/s.
 * Missing loads fall back to the nearest concurrency in a documented band.
 *
 * Cost Index (separate): tokens per dollar at concurrency 40, same
 * percentile scaling. GPU-hour rates are a dated assumption table, not
 * a quote. Higher cost score = cheaper.
 *
 * Provenance: a row is `verified` when every number came from a measured
 * QuettaBench run. `estimated` is reserved for analytical (QuettaSim)
 * rows that have not been executed.
 */

export const INDEX_VERSION = '1.1';

export const CANONICAL_PROFILES = [
  'chat-singleturn-synth',
  'chat-multiturn-synth',
  'swebench-multiturn-synth',
  'terminalbench-multiturn-synth',
  'osworld-multiturn-synth',
] as const;

export const DOMAINS = ['chat', 'coding', 'terminal', 'computerUse'] as const;
export type Domain = (typeof DOMAINS)[number];

export const DOMAIN_PROFILES: Record<Domain, readonly string[]> = {
  chat: ['chat-singleturn-synth', 'chat-multiturn-synth'],
  coding: ['swebench-multiturn-synth'],
  terminal: ['terminalbench-multiturn-synth'],
  computerUse: ['osworld-multiturn-synth'],
};

export const LOADS = [1, 40, 160] as const;
export type Load = (typeof LOADS)[number];

/** Interactive / typical serving / saturated. */
export const LOAD_WEIGHTS: Record<Load, number> = {
  1: 0.25,
  40: 0.5,
  160: 0.25,
};

export const LOAD_FALLBACK: Record<Load, readonly [number, number]> = {
  1: [1, 5],
  40: [20, 80],
  160: [120, 256],
};

/** Minimum successful-request fraction to keep a run. */
export const MIN_SUCCESS = 0.9;

/** A row must cover at least this many subdomains to appear. */
export const MIN_DOMAINS = 3;

export type HardwareFamily = 'H100' | 'A100' | '3090' | '2080 Ti';
export type Provenance = 'verified' | 'estimated';

/**
 * Assumed $/GPU-hour for the cost index. Datacentre figures are Lambda
 * public list (Sep 2026). Workstation figures are a marketplace midpoint
 * in the published Sep 2026 range — labelled as assumptions, not quotes.
 */
export const GPU_USD_PER_HOUR: Record<HardwareFamily, { usd: number; source: string }> = {
  H100: { usd: 3.99, source: 'Lambda H100 SXM list, Sep 2026' },
  A100: { usd: 1.99, source: 'Lambda A100 40GB list, Sep 2026' },
  '3090': { usd: 0.22, source: 'Marketplace midpoint (Vast/RunPod range ~0.07–0.28), Sep 2026' },
  '2080 Ti': { usd: 0.1, source: 'Marketplace midpoint for ageing cards, Sep 2026' },
};

export interface CellMetrics {
  tpotMs: number;
  ttftMs: number;
  tokPerSec: number;
}

export interface ParsedHardware {
  family: HardwareFamily;
  gpus: number;
  label: string;
}

export interface Scale {
  min: number;
  max: number;
}

export interface DomainScales {
  chat: Scale;
  coding: Scale;
  terminal: Scale;
  computerUse: Scale;
  cost: Scale;
}

export interface IndexRow {
  id: string;
  model: string;
  hardware: string;
  hardwareFamily: HardwareFamily;
  gpus: number;
  engine: string;
  quant: string;
  provenance: Provenance;
  efficiency: number;
  cost: number | null;
  domains: Record<Domain, number | null>;
  raw: {
    tpotMs: number | null;
    ttftMs: number | null;
    tokPerSec: number | null;
    usdPerMTok: number | null;
    loadsUsed: number[];
    domainCount: number;
    runCount: number;
  };
}

export interface BenchRun {
  hardware: string;
  modelShort: string;
  quant?: string;
  engine?: string;
  profile: string;
  concurrency: number;
  successRate: number;
  tpotMs: number;
  ttftMs: number;
  tokPerSec: number;
}

export function parseHardware(label: string): ParsedHardware | null {
  const raw = label.trim();
  const specs: Array<{ re: RegExp; family: HardwareFamily }> = [
    { re: /^H100(?:x(\d+))?$/i, family: 'H100' },
    { re: /^A100-40GB(?:x(\d+))?$/i, family: 'A100' },
    { re: /^3090(?:x(\d+))?$/i, family: '3090' },
    { re: /^2080Ti(?:x(\d+))?$/i, family: '2080 Ti' },
  ];
  for (const spec of specs) {
    const m = raw.match(spec.re);
    if (!m) continue;
    return { family: spec.family, gpus: m[1] ? Number(m[1]) : 1, label: raw };
  }
  return null;
}

export function pickConcurrency(available: Iterable<number>, target: Load): number | null {
  const set = new Set(available);
  if (set.has(target)) return target;
  const [lo, hi] = LOAD_FALLBACK[target];
  const inBand = [...set]
    .filter((c) => c >= lo && c <= hi)
    .sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b);
  return inBand[0] ?? null;
}

export function cellRaw(m: CellMetrics): number {
  const speed = 1 / m.tpotMs;
  const prefill = 1 / m.ttftMs;
  const tps = m.tokPerSec;
  if (!(speed > 0) || !(prefill > 0) || !(tps > 0)) return NaN;
  return Math.cbrt(speed * prefill * tps);
}

export function weightedGeoMean(values: Array<{ value: number; weight: number }>): number | null {
  let log = 0;
  let wsum = 0;
  for (const { value, weight } of values) {
    if (!(value > 0) || !(weight > 0)) continue;
    log += weight * Math.log(value);
    wsum += weight;
  }
  if (wsum <= 0) return null;
  return Math.exp(log / wsum);
}

/** 1–100 log scale between the corpus min and max. The worst row is 1. */
export function scaledScore(raw: number, scale: Scale): number {
  const lo = scale.min;
  const hi = scale.max;
  if (!(raw > 0) || !(lo > 0) || !(hi > lo)) return NaN;
  const t = (Math.log(raw) - Math.log(lo)) / (Math.log(hi) - Math.log(lo));
  const u = Math.min(1, Math.max(0, t));
  return clamp100(1 + 99 * u);
}

export function clamp100(n: number): number {
  if (!Number.isFinite(n)) return NaN;
  return Math.min(100, Math.max(0, n));
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function usdPerHour(family: HardwareFamily, gpus: number): number {
  return GPU_USD_PER_HOUR[family].usd * gpus;
}

export function usdPerMTok(tokPerSec: number, family: HardwareFamily, gpus: number): number | null {
  if (!(tokPerSec > 0)) return null;
  const tokPerHour = tokPerSec * 3600;
  const usd = usdPerHour(family, gpus);
  return (usd / tokPerHour) * 1e6;
}

export function tokensPerDollar(tokPerSec: number, family: HardwareFamily, gpus: number): number | null {
  const usd = usdPerMTok(tokPerSec, family, gpus);
  if (usd == null || !(usd > 0)) return null;
  return 1e6 / usd;
}

interface ConfigAccum {
  model: string;
  hardware: string;
  hw: ParsedHardware;
  engine: string;
  quant: string;
  cells: Map<string, CellMetrics[]>; // profile|concurrency
  runCount: number;
}

function cellKey(profile: string, concurrency: number): string {
  return `${profile}|${concurrency}`;
}

export function ingestRuns(runs: BenchRun[]): ConfigAccum[] {
  const byId = new Map<string, ConfigAccum>();
  for (const run of runs) {
    if (!CANONICAL_PROFILES.includes(run.profile as (typeof CANONICAL_PROFILES)[number])) continue;
    if (run.successRate < MIN_SUCCESS) continue;
    if (!(run.tpotMs > 0) || !(run.ttftMs > 0) || !(run.tokPerSec > 0)) continue;
    const hw = parseHardware(run.hardware);
    if (!hw) continue;
    const engine = run.engine || 'unknown';
    const quant = run.quant || 'BF16';
    const id = `${run.modelShort}|${run.hardware}|${engine}|${quant}`;
    let acc = byId.get(id);
    if (!acc) {
      acc = {
        model: run.modelShort,
        hardware: run.hardware,
        hw,
        engine,
        quant,
        cells: new Map(),
        runCount: 0,
      };
      byId.set(id, acc);
    }
    const k = cellKey(run.profile, run.concurrency);
    const list = acc.cells.get(k) ?? [];
    list.push({ tpotMs: run.tpotMs, ttftMs: run.ttftMs, tokPerSec: run.tokPerSec });
    acc.cells.set(k, list);
    acc.runCount += 1;
  }
  return [...byId.values()];
}

function medianCell(cells: CellMetrics[]): CellMetrics {
  const mid = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  };
  return {
    tpotMs: mid(cells.map((c) => c.tpotMs)),
    ttftMs: mid(cells.map((c) => c.ttftMs)),
    tokPerSec: mid(cells.map((c) => c.tokPerSec)),
  };
}

function availableConcurrencies(acc: ConfigAccum, profile: string): number[] {
  const out: number[] = [];
  for (const k of acc.cells.keys()) {
    const [p, c] = k.split('|');
    if (p === profile) out.push(Number(c));
  }
  return out;
}

function domainRaw(acc: ConfigAccum, domain: Domain): { raw: number; loads: number[] } | null {
  const parts: Array<{ value: number; weight: number }> = [];
  const loads: number[] = [];
  for (const profile of DOMAIN_PROFILES[domain]) {
    const available = availableConcurrencies(acc, profile);
    if (available.length === 0) continue;
    const loadParts: Array<{ value: number; weight: number }> = [];
    for (const target of LOADS) {
      const c = pickConcurrency(available, target);
      if (c == null) continue;
      const cells = acc.cells.get(cellKey(profile, c));
      if (!cells || cells.length === 0) continue;
      const raw = cellRaw(medianCell(cells));
      if (!(raw > 0)) continue;
      loadParts.push({ value: raw, weight: LOAD_WEIGHTS[target] });
      loads.push(c);
    }
    const profileRaw = weightedGeoMean(loadParts);
    if (profileRaw == null) continue;
    parts.push({ value: profileRaw, weight: 1 });
  }
  const raw = weightedGeoMean(parts);
  if (raw == null) return null;
  return { raw, loads };
}

function servingTokPerSec(acc: ConfigAccum): number | null {
  const vals: number[] = [];
  for (const profile of CANONICAL_PROFILES) {
    const c = pickConcurrency(availableConcurrencies(acc, profile), 40);
    if (c == null) continue;
    const cells = acc.cells.get(cellKey(profile, c));
    if (!cells) continue;
    vals.push(medianCell(cells).tokPerSec);
  }
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function servingLatencies(acc: ConfigAccum): { tpotMs: number; ttftMs: number } | null {
  const tpot: number[] = [];
  const ttft: number[] = [];
  for (const profile of CANONICAL_PROFILES) {
    const c = pickConcurrency(availableConcurrencies(acc, profile), 40);
    if (c == null) continue;
    const cells = acc.cells.get(cellKey(profile, c));
    if (!cells) continue;
    const m = medianCell(cells);
    tpot.push(m.tpotMs);
    ttft.push(m.ttftMs);
  }
  if (tpot.length === 0) return null;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return { tpotMs: mean(tpot), ttftMs: mean(ttft) };
}

interface PreparedConfig {
  acc: ConfigAccum;
  domainRaw: Record<Domain, number | null>;
  loadsUsed: number[];
  tokPerSec: number | null;
  lat: { tpotMs: number; ttftMs: number } | null;
  costRaw: number | null;
  usdPerMTok: number | null;
}

function prepare(acc: ConfigAccum): PreparedConfig | null {
  const domainRawMap = { chat: null, coding: null, terminal: null, computerUse: null } as Record<
    Domain,
    number | null
  >;
  const loads = new Set<number>();
  let present = 0;
  for (const d of DOMAINS) {
    const got = domainRaw(acc, d);
    if (!got) continue;
    domainRawMap[d] = got.raw;
    present += 1;
    for (const c of got.loads) loads.add(c);
  }
  if (present < MIN_DOMAINS) return null;
  const tokPerSec = servingTokPerSec(acc);
  const lat = servingLatencies(acc);
  // Serving-point metrics (concurrency 40, or the 20–80 band) are required
  // so a sparse cell with only c=1 / c=200 cannot land on the board.
  if (tokPerSec == null || lat == null) return null;
  const costRaw =
    tokPerSec != null ? tokensPerDollar(tokPerSec, acc.hw.family, acc.hw.gpus) : null;
  const usd =
    tokPerSec != null ? usdPerMTok(tokPerSec, acc.hw.family, acc.hw.gpus) : null;
  return {
    acc,
    domainRaw: domainRawMap,
    loadsUsed: [...loads].sort((a, b) => a - b),
    tokPerSec,
    lat,
    costRaw,
    usdPerMTok: usd,
  };
}

export function buildScales(prepared: PreparedConfig[]): DomainScales {
  const collect = (xs: number[]): Scale => {
    const s = xs.filter((n) => n > 0).sort((a, b) => a - b);
    return { min: s[0], max: s[s.length - 1] };
  };
  const of = (d: Domain) =>
    prepared.map((p) => p.domainRaw[d]).filter((n): n is number => n != null && n > 0);
  return {
    chat: collect(of('chat')),
    coding: collect(of('coding')),
    terminal: collect(of('terminal')),
    computerUse: collect(of('computerUse')),
    cost: collect(prepared.map((p) => p.costRaw).filter((n): n is number => n != null && n > 0)),
  };
}

function meanPresent(scores: Array<number | null>): number | null {
  const xs = scores.filter((n): n is number => n != null && Number.isFinite(n));
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function scoreCorpus(
  runs: BenchRun[],
  provenance: Provenance = 'verified',
): { rows: IndexRow[]; scales: DomainScales } {
  const prepared = ingestRuns(runs)
    .map(prepare)
    .filter((p): p is PreparedConfig => p != null);
  const scales = buildScales(prepared);
  const rows: IndexRow[] = prepared.map((p) => {
    const domains = {
      chat: p.domainRaw.chat != null ? round1(scaledScore(p.domainRaw.chat, scales.chat)) : null,
      coding: p.domainRaw.coding != null ? round1(scaledScore(p.domainRaw.coding, scales.coding)) : null,
      terminal:
        p.domainRaw.terminal != null ? round1(scaledScore(p.domainRaw.terminal, scales.terminal)) : null,
      computerUse:
        p.domainRaw.computerUse != null
          ? round1(scaledScore(p.domainRaw.computerUse, scales.computerUse))
          : null,
    };
    const efficiency = round1(meanPresent(DOMAINS.map((d) => domains[d])) ?? NaN);
    const cost = p.costRaw != null ? round1(scaledScore(p.costRaw, scales.cost)) : null;
    return {
      id: `${p.acc.model}|${p.acc.hardware}|${p.acc.engine}|${p.acc.quant}`,
      model: p.acc.model,
      hardware: p.acc.hardware,
      hardwareFamily: p.acc.hw.family,
      gpus: p.acc.hw.gpus,
      engine: p.acc.engine,
      quant: p.acc.quant,
      provenance,
      efficiency,
      cost,
      domains,
      raw: {
        tpotMs: p.lat ? Math.round(p.lat.tpotMs * 10) / 10 : null,
        ttftMs: p.lat ? Math.round(p.lat.ttftMs * 10) / 10 : null,
        tokPerSec: p.tokPerSec != null ? Math.round(p.tokPerSec * 10) / 10 : null,
        usdPerMTok: p.usdPerMTok != null ? Math.round(p.usdPerMTok * 100) / 100 : null,
        loadsUsed: p.loadsUsed,
        domainCount: DOMAINS.filter((d) => domains[d] != null).length,
        runCount: p.acc.runCount,
      },
    };
  });
  rows.sort((a, b) => b.efficiency - a.efficiency || a.id.localeCompare(b.id));
  return { rows, scales };
}

export function assertIndexInvariants(rows: IndexRow[]): string[] {
  const failures: string[] = [];
  if (rows.length < 50) failures.push(`expected ≥50 rows, got ${rows.length}`);
  const verified = rows.filter((r) => r.provenance === 'verified').length;
  if (verified < 50) failures.push(`expected ≥50 verified rows, got ${verified}`);
  for (const r of rows) {
    if (!(r.efficiency >= 0 && r.efficiency <= 100)) {
      failures.push(`${r.id}: efficiency ${r.efficiency} out of range`);
    }
    if (r.cost != null && !(r.cost >= 0 && r.cost <= 100)) {
      failures.push(`${r.id}: cost ${r.cost} out of range`);
    }
    for (const d of DOMAINS) {
      const v = r.domains[d];
      if (v != null && !(v >= 0 && v <= 100)) failures.push(`${r.id}: ${d} ${v} out of range`);
    }
    if (r.raw.domainCount < MIN_DOMAINS) failures.push(`${r.id}: only ${r.raw.domainCount} domains`);
    if (r.efficiency === 0) failures.push(`${r.id}: efficiency is 0 — scale should start at 1`);
    for (const d of DOMAINS) {
      if (r.domains[d] === 0) failures.push(`${r.id}: ${d} is 0 — scale should start at 1`);
    }
    if (r.cost === 0) failures.push(`${r.id}: cost is 0 — scale should start at 1`);
    if (r.raw.tpotMs == null || r.raw.ttftMs == null || r.raw.tokPerSec == null) {
      failures.push(`${r.id}: missing serving-point raw metrics`);
    }
  }
  const ids = new Set(rows.map((r) => r.id));
  if (ids.size !== rows.length) failures.push('duplicate row ids');
  return failures;
}
