import { useEffect, useMemo, useState } from 'react';
import { servingPredictionsJsonUrl, rooflinePredictionsJsonUrl, llmsimPredictionsJsonUrl } from '../dataUrls';
import { useSweepState } from '../hooks/useSweepState';
import type { DataScope } from '../profileMeta';
import { DATA_SCOPE_META } from '../profileMeta';
import {
  buildRooflineLookup,
  rooflineKey,
  type RooflineRow,
  type RooflineLookup,
} from '../rooflinePredictions';
import { buildLssLookup, type LssRow, type LssLookup } from '../llmsimPredictions';
import {
  buildServingIndex,
  rowParallelism,
  PARALLELISM_ORDER,
  type ServingIndex,
  type ServingRow,
} from './ServingPredictionsPage';

// The Predictions tab: one large hardware × model matrix. Rows = hardware configs (gpu_key),
// columns = models. A metric toggle (E2EL / TTFT / TPOT) selects the metric; a SOURCE toggle picks
// the predictor: Backtest (build_simulator_rows, reads the realized trajectory_pool + scores) vs
// Roofline (simulator.forward, fed the same workload as a client would — no-GT path). Both score
// against the SAME measured GT. Bands match the Simulator tab.

interface MetricAgg {
  pred: number | null;
  meas: number | null;
}

interface CellAgg {
  ttft: MetricAgg;
  tpot: MetricAgg;
  e2el: MetricAgg;
  // P90/P99 = 90th/99th percentile APE. MdAPE (median) is retired as a displayed metric —
  // P90 is the sole visible value now (toned by accuracy band); P99 is tooltip-only
  // (kc line only, where it was cheap to wire up).
  ttftP90: number | null;
  tpotP90: number | null;
  e2elP90: number | null;
  ttftP99: number | null;
  tpotP99: number | null;
  e2elP99: number | null;
  // Roofline predictor: cohort-mean pred + P90 vs the same measured GT (null if no roofline row).
  rflTtftPred: number | null;
  rflTpotPred: number | null;
  rflE2elPred: number | null;
  rflTtftP90: number | null;
  rflTpotP90: number | null;
  rflE2elP90: number | null;
  // LLMServingSim 2.0 predictor: cohort-mean pred + P90 vs the same measured GT (null if no row).
  lssTtftPred: number | null;
  lssTpotPred: number | null;
  lssE2elPred: number | null;
  lssTtftP90: number | null;
  lssTpotP90: number | null;
  lssE2elP90: number | null;
  n: number;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// Cell APE is shown as P90/P99, not mean (MAPE) or median (MdAPE, since retired): the
// per-turn/per-cell APE has a heavy tail on herd/queue-collapse cells, and a percentile
// surfaces that tail directly rather than averaging it away or routing around it.
function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

function aggregateCell(rows: ServingRow[], gpuKey: string, roofline: RooflineLookup, llmsim: LssLookup): CellAgg {
  // Only genuinely kernel-composed rows feed the "kc" line. A roofline FALLBACK
  // (multiturn_prediction_mode !== 'v2_kernel_composed' -- Qwen3.5 GDN, gpt-oss, or a
  // GPU with no device YAML) must never masquerade as kernel-composed; its number
  // surfaces on the rfl line instead. `meas` still comes from every row (GT exists
  // regardless of which predictor priced the cell).
  const isKc = (r: ServingRow): boolean => r.multiturn_prediction_mode === 'v2_kernel_composed';
  const kcRows = rows.filter(isKc);
  const rflFallbackRows = rows.filter(r => !isKc(r));
  const collectFrom = (rs: ServingRow[], key: keyof ServingRow): number[] => {
    const out: number[] = [];
    for (const row of rs) {
      const v = row[key];
      if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
    }
    return out;
  };
  const metric = (k: 'ttft' | 'tpot' | 'e2el'): MetricAgg => ({
    pred: average(collectFrom(kcRows, `${k}_pred` as keyof ServingRow)),
    meas: average(collectFrom(rows, `${k}_meas` as keyof ServingRow)),
  });
  // Join the roofline rows by (gpu_key, model, profile, concurrency).
  const rflPred: Record<'ttft' | 'tpot' | 'e2el', number[]> = { ttft: [], tpot: [], e2el: [] };
  const rflErr: Record<'ttft' | 'tpot' | 'e2el', number[]> = { ttft: [], tpot: [], e2el: [] };
  const lssPred: Record<'ttft' | 'tpot' | 'e2el', number[]> = { ttft: [], tpot: [], e2el: [] };
  const lssErr: Record<'ttft' | 'tpot' | 'e2el', number[]> = { ttft: [], tpot: [], e2el: [] };
  for (const row of rows) {
    const r = row as ServingRow & { profile?: string; concurrency?: number };
    if (r.model == null || r.profile == null || r.concurrency == null) continue;
    const key = rooflineKey(gpuKey, r.model, r.profile, r.concurrency);
    const f = roofline.get(key);
    if (f) {
      for (const k of ['ttft', 'tpot', 'e2el'] as const) {
        const p = f[`fwd_${k}_pred` as keyof RooflineRow];
        const e = f[`fwd_${k}_err` as keyof RooflineRow];
        if (typeof p === 'number' && Number.isFinite(p)) rflPred[k].push(p);
        if (typeof e === 'number' && Number.isFinite(e)) rflErr[k].push(e);
      }
    }
    const l = llmsim.get(key);
    if (l) {
      for (const k of ['ttft', 'tpot', 'e2el'] as const) {
        const p = l[`${k}_pred` as keyof LssRow];
        const e = l[`${k}_err` as keyof LssRow];
        if (typeof p === 'number' && Number.isFinite(p)) lssPred[k].push(p);
        if (typeof e === 'number' && Number.isFinite(e)) lssErr[k].push(e);
      }
    }
  }
  // forward-predictions.json doesn't cover every roofline model (e.g. Qwen3.5). For any
  // metric it leaves empty, fall back to the in-file roofline rows so a roofline cell's
  // number still shows on the rfl line rather than vanishing once kc is blanked.
  for (const k of ['ttft', 'tpot', 'e2el'] as const) {
    if (!rflPred[k].length) rflPred[k] = collectFrom(rflFallbackRows, `${k}_pred` as keyof ServingRow);
    if (!rflErr[k].length) rflErr[k] = collectFrom(rflFallbackRows, `${k}_err` as keyof ServingRow);
  }
  return {
    ttft: metric('ttft'),
    tpot: metric('tpot'),
    e2el: metric('e2el'),
    ttftP90: percentile(collectFrom(kcRows, 'ttft_err'), 90),
    tpotP90: percentile(collectFrom(kcRows, 'tpot_err'), 90),
    e2elP90: percentile(collectFrom(kcRows, 'e2el_err'), 90),
    ttftP99: percentile(collectFrom(kcRows, 'ttft_err'), 99),
    tpotP99: percentile(collectFrom(kcRows, 'tpot_err'), 99),
    e2elP99: percentile(collectFrom(kcRows, 'e2el_err'), 99),
    rflTtftPred: average(rflPred.ttft),
    rflTpotPred: average(rflPred.tpot),
    rflE2elPred: average(rflPred.e2el),
    rflTtftP90: percentile(rflErr.ttft, 90),
    rflTpotP90: percentile(rflErr.tpot, 90),
    rflE2elP90: percentile(rflErr.e2el, 90),
    lssTtftPred: average(lssPred.ttft),
    lssTpotPred: average(lssPred.tpot),
    lssE2elPred: average(lssPred.e2el),
    lssTtftP90: percentile(lssErr.ttft, 90),
    lssTpotP90: percentile(lssErr.tpot, 90),
    lssE2elP90: percentile(lssErr.e2el, 90),
    n: rows.length,
  };
}

// P90 is the sole displayed value for all three predictor lines (kc/rfl/lss), toned by
// accuracy band. P99 is tooltip-only and cellTooltip always renders all three metrics, so
// it has no need for a "currently selected metric" accessor the way these do.
const BT_P90 = { ttft: 'ttftP90', tpot: 'tpotP90', e2el: 'e2elP90' } as const;
const RFL_P90 = { ttft: 'rflTtftP90', tpot: 'rflTpotP90', e2el: 'rflE2elP90' } as const;
const LSS_P90 = { ttft: 'lssTtftP90', tpot: 'lssTpotP90', e2el: 'lssE2elP90' } as const;

function btP90(cell: CellAgg, metric: MetricKey): number | null {
  return cell[BT_P90[metric]];
}
function rflP90(cell: CellAgg, metric: MetricKey): number | null {
  return cell[RFL_P90[metric]];
}
function lssP90(cell: CellAgg, metric: MetricKey): number | null {
  return cell[LSS_P90[metric]];
}

function formatMs(value: number | null): string {
  if (value == null) return '—';
  if (value >= 10000) return `${(value / 1000).toFixed(1)} s`;
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  if (value >= 100) return `${value.toFixed(0)} ms`;
  return `${value.toFixed(1)} ms`;
}

function mapeTone(mape: number | null): { cell: string; badge: string } {
  if (mape == null) return { cell: 'bg-transparent', badge: 'text-[#676c76]' };
  const v = Math.abs(mape);
  if (v < 10) return { cell: 'bg-[#3fb950]/10', badge: 'text-[#3fb950]' };
  if (v < 25) return { cell: 'bg-[#58a6ff]/10', badge: 'text-[#58a6ff]' };
  if (v < 50) return { cell: 'bg-[#f0883e]/10', badge: 'text-[#f0883e]' };
  return { cell: 'bg-[#f85149]/10', badge: 'text-[#f85149]' };
}

function hardwareParts(gpuKey: string, rows: ServingRow[]): { gpu: string; tp: number; backend: string } {
  const backend = /\(sglang\)/i.test(gpuKey) ? 'sglang' : 'vllm';
  const base = gpuKey.replace(/\s*\(sglang\)\s*/i, '');
  const tpMatch = base.match(/x(\d+)$/);
  const rowTp = rows
    .map(r => (r as { tensor_parallel_size?: number }).tensor_parallel_size)
    .find(v => typeof v === 'number');
  return {
    gpu: tpMatch ? base.slice(0, -tpMatch[0].length) : base,
    tp: rowTp ?? (tpMatch ? Number(tpMatch[1]) : 1),
    backend,
  };
}

// Prediction gpu_key base -> sweep-state hardware_label (they name the same GPUs differently).
const HW_LABEL: Record<string, string> = {
  A100: 'A100-40GB',
  H100: 'H100',
  RTX3090: '3090',
  RTX2080Ti: '2080Ti',
};

// Prediction gpu_key base -> sweep-state host key, for the known_oom lookup.
const GPU2HOST: Record<string, string> = {
  A100: 'a100',
  H100: 'h100',
  RTX3090: '3090',
  RTX2080Ti: '2080ti',
};

// Why a (hardware, model) cell can't run — rendered as a shaded (hatched) cell, reason in the
// tooltip, matching what the Coverage tab marks infeasible. Two sources: it won't fit in VRAM, or
// it is declared known_oom in the sweep (an arch limit like MXFP4-on-sm75, or a fixable software
// gap). Returns null when the cell is feasible and simply has no data yet (rendered "—").
function cellBlockReason(
  gpu: string,
  tp: number,
  backend: string,
  model: string,
  vramByLabel: Map<string, number>,
  weightsByModel: Map<string, number>,
  ratio: number,
  knownOom: Map<string, string>,
): string | null {
  const vram = vramByLabel.get(HW_LABEL[gpu] ?? gpu);
  const weights = weightsByModel.get(model);
  if (vram && weights && weights > vram * tp * ratio) {
    return `won't fit — needs ≥${Math.ceil(weights / ratio)} GB VRAM (weights ${weights} GB); ${gpu}${tp > 1 ? `×${tp}` : ''} has ${vram * tp} GB`;
  }
  const host = GPU2HOST[gpu] ?? gpu;
  return knownOom.get(`${host}|${model}|${tp}|${backend}`) ?? knownOom.get(`${host}|${model}|${tp}`) ?? null;
}

const METRICS = [
  { key: 'e2el', label: 'E2EL' },
  { key: 'ttft', label: 'TTFT' },
  { key: 'tpot', label: 'TPOT' },
] as const;
type MetricKey = (typeof METRICS)[number]['key'];

const BACKENDS = [
  { key: 'all', label: 'All' },
  { key: 'vllm', label: 'vLLM' },
  { key: 'sglang', label: 'SGLang' },
] as const;
type BackendKey = (typeof BACKENDS)[number]['key'];

// Per-cell predictor accent colors — one dot per series so both read at a glance without a toggle.
const KC_COLOR = '#2dd4bf';   // kernel-composed
const RFL_COLOR = '#a855f7';  // roofline
const LSS_COLOR = '#fb923c';  // LLMServingSim 2.0

// "not applicable" (won't fit) is shown as a diagonal hatch — a texture, not a hue — so it can
// never collide with the green/blue/orange/red MAPE bands or the predictor dot colors.
const NA_HATCH = 'repeating-linear-gradient(45deg, rgba(148,163,184,0.20) 0 1px, transparent 1px 6px)';

// One predictor's line inside a matrix cell: colored dot + label + its APE (absolute
// percentage error vs the measured GT), toned by accuracy (the bands the legend
// explains). Shows "n/a" when this predictor produced no value for a cell that still has
// GT (e.g. kc on a roofline-fallback model, or lss where it didn't run) -- distinct from
// the "—" cells, which are not-run. The predicted/measured ms live in the tooltip.
// The displayed value is P90 (90th-percentile APE); P99 (the extreme tail) is available
// in the kc line's tooltip rather than inline here.
function PredLine({ label, color, value, emptyLabel = 'n/a' }: { label: string; color: string; value: number | null; emptyLabel?: string }) {
  const tone = mapeTone(value);
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="flex items-baseline gap-1">
        <span className="inline-block h-1.5 w-1.5 shrink-0 self-center rounded-full" style={{ backgroundColor: color }} aria-hidden />
        <span className="text-[9px] uppercase tracking-wide" style={{ color }}>{label}</span>
      </span>
      {value != null
        ? <span className="tabular-nums text-[10px]"><span className={tone.badge}>{value.toFixed(0)}%</span></span>
        : <span className="text-[10px] text-[#676c76]">{emptyLabel}</span>}
    </div>
  );
}

function cellTooltip(gpuKey: string, model: string, cell: CellAgg, par?: string): string {
  const line = (label: string, m: MetricAgg, p90: number | null, p99: number | null, rflP90: number | null) =>
    `${label} kern ${formatMs(m.pred)}/${formatMs(m.meas)}` +
    (p90 != null ? ` P90 ${p90.toFixed(1)}%${p99 != null ? ` (P99 ${p99.toFixed(1)}%)` : ''}` : '') +
    (rflP90 != null ? ` · rfl P90 ${rflP90.toFixed(1)}%` : '');
  const head = `${gpuKey} × ${model}${par ? ` · ${par}` : ''} — over ${cell.n} cells (P90 shown, P99 in parens for kernel-composed; rfl = roofline P90)`;
  return `${head}\n${line('TTFT', cell.ttft, cell.ttftP90, cell.ttftP99, cell.rflTtftP90)}\n${line('TPOT', cell.tpot, cell.tpotP90, cell.tpotP99, cell.rflTpotP90)}\n${line('E2EL', cell.e2el, cell.e2elP90, cell.e2elP99, cell.rflE2elP90)}`;
}

export function PredictionsMatrixPage({
  dataScope,
  predictionsUrl = servingPredictionsJsonUrl,
}: {
  dataScope: DataScope;
  predictionsUrl?: string;
}) {
  const [servingIndex, setServingIndex] = useState<ServingIndex | null>(null);
  const [roofline, setRoofline] = useState<RooflineLookup>(new Map());
  const [llmsim, setLlmsim] = useState<LssLookup>(new Map());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [metric, setMetric] = useState<MetricKey>('e2el');
  const [backend, setBackend] = useState<BackendKey>('vllm');
  // Parallelism axis: "all" blends every strategy into one cell (fine when a cell has a
  // single strategy; a coarse overview when it has more, since preds are identical), while
  // a specific value (tp / tp+ep / ...) disaggregates. EP-on and EP-off runs of one
  // (gpu, model) otherwise land in the same cell and mix their (different) measured GT.
  const [parallelism, setParallelism] = useState<string>('all');

  // VRAM / weights so an empty cell can be told apart: "won't fit" (not plausible) vs "not run".
  const { sweepState } = useSweepState();
  const vramByLabel = useMemo(() => {
    const m = new Map<string, number>();
    if (sweepState) for (const h of Object.values(sweepState.hosts)) m.set(h.hardware_label, h.vram_gb_per_gpu);
    return m;
  }, [sweepState]);
  const weightsByModel = useMemo(() => {
    const m = new Map<string, number>();
    if (sweepState) for (const [k, v] of Object.entries(sweepState.models)) m.set(k, v.weights_gb);
    return m;
  }, [sweepState]);
  const feasRatio = sweepState?.feasibility_ratio ?? 0.9;
  // Cells the sweep declares infeasible (arch or software), so the matrix can shade them like the
  // Coverage tab instead of a bare "—". hw_permanent limits apply to any engine (backend-agnostic).
  const knownOom = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of sweepState?.cells ?? []) {
      if (c.status !== 'known_oom') continue;
      const reason = c.reason ?? 'declared infeasible';
      m.set(`${c.host}|${c.model}|${c.tp}|${c.backend}`, reason);
      if (c.kind === 'hw_permanent') m.set(`${c.host}|${c.model}|${c.tp}`, reason);
    }
    return m;
  }, [sweepState]);

  useEffect(() => {
    setLoading(true);
    setFailed(false);
    fetch(predictionsUrl)
      .then(r => r.json())
      .then((json: Record<string, ServingRow[]>) => {
        setServingIndex(buildServingIndex(json));
        setLoading(false);
      })
      .catch(() => {
        setFailed(true);
        setLoading(false);
      });
  }, [predictionsUrl]);

  // Roofline predictions are optional — absent (404) until build_forward_rows has run.
  useEffect(() => {
    fetch(rooflinePredictionsJsonUrl)
      .then(r => (r.ok ? r.json() : null))
      .then((json: Record<string, RooflineRow[]> | null) => setRoofline(buildRooflineLookup(json)))
      .catch(() => setRoofline(new Map()));
  }, []);

  // LLMServingSim 2.0 predictions are optional — absent (404) until the sweep has been built.
  useEffect(() => {
    fetch(llmsimPredictionsJsonUrl)
      .then(r => (r.ok ? r.json() : null))
      .then((json: Record<string, LssRow[]> | null) => setLlmsim(buildLssLookup(json)))
      .catch(() => setLlmsim(new Map()));
  }, []);

  const scopeIndex = servingIndex?.[dataScope];

  // Parallelism strategies present anywhere in the scope, in canonical order — drives
  // the toggle. A stale selection (scope switch) falls back to "all".
  const availableParallelisms = useMemo(() => {
    if (!scopeIndex) return [] as string[];
    const present = new Set<string>();
    for (const rows of Object.values(scopeIndex.rowsByGpu))
      for (const r of rows) present.add(rowParallelism(r));
    return PARALLELISM_ORDER.filter(p => present.has(p));
  }, [scopeIndex]);
  const effParallelism = parallelism === 'all' || availableParallelisms.includes(parallelism)
    ? parallelism : 'all';

  const matrix = useMemo(() => {
    if (!scopeIndex) return null;
    const models = new Set<string>();
    for (const rows of Object.values(scopeIndex.rowsByGpu)) {
      for (const row of rows) if (row.model) models.add(row.model);
    }
    const modelList = Array.from(models).sort();
    const hardware = scopeIndex.gpuOptions.map(gpuKey => {
      const rows = (scopeIndex.rowsByGpu[gpuKey] ?? [])
        .filter(r => effParallelism === 'all' || rowParallelism(r) === effParallelism);
      // Group each model's rows by parallelism so tp and tp+ep never blend into one averaged
      // cell -- they score against DIFFERENT GT (EP-off vs EP-on). A filtered view (a specific
      // parallelism) yields a single group; "all" yields one sub-block per strategy present.
      const byModel: Record<string, Array<{ par: string; cell: CellAgg }>> = {};
      for (const model of modelList) {
        const modelRows = rows.filter(r => r.model === model);
        if (!modelRows.length) continue;
        const byPar = new Map<string, ServingRow[]>();
        for (const r of modelRows) {
          const p = rowParallelism(r);
          if (!byPar.has(p)) byPar.set(p, []);
          byPar.get(p)!.push(r);
        }
        byModel[model] = PARALLELISM_ORDER
          .filter(p => byPar.has(p))
          .map(p => ({ par: p, cell: aggregateCell(byPar.get(p)!, gpuKey, roofline, llmsim) }));
      }
      return { gpuKey, parts: hardwareParts(gpuKey, rows), byModel };
    }).filter(h => Object.keys(h.byModel).length > 0);
    return { modelList, hardware };
  }, [scopeIndex, roofline, llmsim, effParallelism]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-[#a9afba]">Loading predictions…</div>;
  }
  if (failed || !matrix) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-[#f97583]/30 bg-[#f97583]/10 text-[#f97583]">
        Failed to load predictions data.
      </div>
    );
  }
  if (!matrix.hardware.length) {
    return (
      <div className="flex h-64 items-center justify-center text-[#a9afba]">
        No prediction rows in the {DATA_SCOPE_META[dataScope].label.toLowerCase()} scope.
      </div>
    );
  }

  const availableBackends = Array.from(new Set(matrix.hardware.map(h => h.parts.backend)));
  const effBackend: BackendKey =
    backend !== 'all' && !availableBackends.includes(backend) ? 'all' : backend;
  const shownHardware = matrix.hardware.filter(h => effBackend === 'all' || h.parts.backend === effBackend);
  const shownModelList = matrix.modelList.filter(model => shownHardware.some(h => h.byModel[model]));
  const hasRoofline = roofline.size > 0;
  const hasLss = llmsim.size > 0;
  const metricLabel = METRICS.find(mm => mm.key === metric)!.label;

  const toggle = (
    items: readonly { key: string; label: string }[],
    active: string,
    on: (k: string) => void,
    disabledKeys: string[] = [],
  ) => (
    <div className="seg-track text-xs">
      {items.map(({ key, label }) => {
        const disabled = disabledKeys.includes(key);
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => on(key)}
            className={`seg-item px-3 py-1 font-medium ${
              active === key ? 'seg-item-active'
                : disabled ? 'cursor-not-allowed text-[#676c76] opacity-50'
                : 'text-[#a9afba] hover:text-[#f3f4f6]'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#f3f4f6]">Predictions matrix</h2>
          <p className="text-sm text-[#a9afba]">
            Per hardware config × model, averaged over all profiles and concurrencies
            ({DATA_SCOPE_META[dataScope].label.toLowerCase()}). Each cell shows the {metricLabel} APE per predictor —{' '}
            <span style={{ color: KC_COLOR }}>kernel-composed</span> and{' '}
            <span style={{ color: RFL_COLOR }}>roofline</span>; background tone = kernel-composed P90; each line reads <span className="tabular-nums">P90</span> (90th-percentile APE); hover the kernel-composed line for P99. Empty cells are shaded when the config can&apos;t run (won&apos;t fit or declared infeasible), or{' '}
            <span className="text-[#676c76]">—</span> when not run. Hover for details.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 text-xs text-[#a9afba]">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: KC_COLOR }} aria-hidden />
                kernel-composed
              </span>
              {hasRoofline && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: RFL_COLOR }} aria-hidden />
                  roofline
                </span>
              )}
              {hasLss && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: LSS_COLOR }} aria-hidden />
                  LLMServingSim
                </span>
              )}
            </div>
            {availableBackends.length > 1 &&
              toggle(BACKENDS.filter(b => b.key === 'all' || availableBackends.includes(b.key)),
                effBackend, k => setBackend(k as BackendKey))}
            {availableParallelisms.length > 1 &&
              toggle([{ key: 'all', label: 'All' }, ...availableParallelisms.map(p => ({ key: p, label: p }))],
                effParallelism, setParallelism)}
          </div>
          {toggle(METRICS, metric, k => setMetric(k as MetricKey))}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-[#a9afba]">{metricLabel} P90:</span>
            <span className="rounded border border-[#3fb950]/30 bg-[#3fb950]/10 px-2 py-0.5 text-[#3fb950]">&lt;10%</span>
            <span className="rounded border border-[#58a6ff]/30 bg-[#58a6ff]/10 px-2 py-0.5 text-[#58a6ff]">10–25%</span>
            <span className="rounded border border-[#f0883e]/30 bg-[#f0883e]/10 px-2 py-0.5 text-[#f0883e]">25–50%</span>
            <span className="rounded border border-[#f85149]/30 bg-[#f85149]/10 px-2 py-0.5 text-[#f85149]">≥50%</span>
            <span className="rounded border border-[#ffffff1f] bg-white/[0.08] px-2 py-0.5 text-[#676c76]">n/a = no prediction</span>
            <span className="inline-flex items-center gap-1.5 rounded border border-[#ffffff1f] px-2 py-0.5 text-[#8b949e]">
              <span className="inline-block h-2.5 w-2.5 rounded-sm border border-[#ffffff1f]" style={{ backgroundImage: NA_HATCH }} aria-hidden />
              can&apos;t run
            </span>
            <span className="rounded border border-[#ffffff1f] px-2 py-0.5 text-[#676c76]">— = not run</span>
          </div>
        </div>
      </div>

      <div className="glass-shell rounded-[20px] p-1.5">
      <div className="overflow-auto rounded-[15px] bg-[#0b0d10]" style={{ maxHeight: 'calc(100vh - 180px)' }}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 border-b border-r border-[#ffffff1f] bg-[#0b0d10] px-2.5 py-1 text-left font-medium text-[#a9afba]">
                Hardware config
              </th>
              {shownModelList.map(model => (
                <th key={model} className="sticky top-0 z-20 whitespace-nowrap border-b border-[#ffffff1f] bg-[#0b0d10] px-2.5 py-1 text-left font-medium text-[#f3f4f6]">
                  {model}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shownHardware.map(({ gpuKey, parts, byModel }) => (
              <tr key={gpuKey} className="odd:bg-[#0b0d10] even:bg-white/[0.02]">
                <td className="sticky left-0 z-10 whitespace-nowrap border-r border-t border-[#ffffff1f] bg-[#0b0d10] px-2.5 py-0.5 align-middle">
                  <div className="flex items-baseline gap-1.5 leading-none">
                    <span className="font-medium text-[#f3f4f6]">{parts.gpu}</span>
                    <span className="text-xs text-[#a9afba]">tp{parts.tp} · {parts.backend}{effParallelism !== 'all' ? ` · ${effParallelism}` : ''}</span>
                  </div>
                </td>
                {shownModelList.map(model => {
                  const entries = byModel[model];
                  if (!entries || entries.length === 0) {
                    const reason = cellBlockReason(parts.gpu, parts.tp, parts.backend, model, vramByLabel, weightsByModel, feasRatio, knownOom);
                    return reason
                      ? <td key={model} title={reason} style={{ backgroundImage: NA_HATCH }} className="border-t border-[#ffffff1f] px-2.5 py-1 align-middle"></td>
                      : <td key={model} title="not run yet" className="border-t border-[#ffffff1f] px-2.5 py-1 text-center align-middle text-[#676c76]">—</td>;
                  }
                  // Tone the cell by the first strategy's kc (usually tp); each sub-block below still
                  // carries its own per-predictor accuracy colors.
                  const tone = mapeTone(btP90(entries[0].cell, metric));
                  const hasGt = entries.some(e => e.cell[metric].meas != null);
                  const multi = entries.length > 1;
                  return (
                    <td key={model} className={`whitespace-nowrap border-t border-[#ffffff1f] px-2.5 py-1 align-middle ${hasGt ? tone.cell : 'bg-white/[0.04]'}`}
                        title={entries.map(e => cellTooltip(gpuKey, model, e.cell, multi ? e.par : undefined)).join('\n\n')}>
                      <div className="flex flex-col gap-1.5 font-mono text-[11px] leading-tight">
                        {entries.map(({ par, cell }) => (
                          <div key={par} className={multi ? 'border-l-2 border-[#ffffff1f] pl-1.5' : ''}>
                            {multi && <div className="text-[8px] font-semibold uppercase tracking-wide text-[#8b93a1]">{par}</div>}
                            <PredLine label="kc" color={KC_COLOR} value={btP90(cell, metric)} />
                            {hasRoofline && <PredLine label="rfl" color={RFL_COLOR} value={rflP90(cell, metric)} />}
                            {hasLss && <PredLine label="lss" color={LSS_COLOR} value={lssP90(cell, metric)} />}
                          </div>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}
