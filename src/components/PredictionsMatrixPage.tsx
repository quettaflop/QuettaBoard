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
  ttftMape: number | null;
  tpotMape: number | null;
  e2elMape: number | null;
  // Roofline predictor: cohort-mean pred + MAPE vs the same measured GT (null if no roofline row).
  rflTtftPred: number | null;
  rflTpotPred: number | null;
  rflE2elPred: number | null;
  rflTtftMape: number | null;
  rflTpotMape: number | null;
  rflE2elMape: number | null;
  // LLMServingSim 2.0 predictor: cohort-mean pred + MAPE vs the same measured GT (null if no row).
  lssTtftPred: number | null;
  lssTpotPred: number | null;
  lssE2elPred: number | null;
  lssTtftMape: number | null;
  lssTpotMape: number | null;
  lssE2elMape: number | null;
  n: number;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function aggregateCell(rows: ServingRow[], gpuKey: string, roofline: RooflineLookup, llmsim: LssLookup): CellAgg {
  const collect = (key: keyof ServingRow): number[] => {
    const out: number[] = [];
    for (const row of rows) {
      const v = row[key];
      if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
    }
    return out;
  };
  const metric = (k: 'ttft' | 'tpot' | 'e2el'): MetricAgg => ({
    pred: average(collect(`${k}_pred` as keyof ServingRow)),
    meas: average(collect(`${k}_meas` as keyof ServingRow)),
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
  return {
    ttft: metric('ttft'),
    tpot: metric('tpot'),
    e2el: metric('e2el'),
    ttftMape: average(collect('ttft_err')),
    tpotMape: average(collect('tpot_err')),
    e2elMape: average(collect('e2el_err')),
    rflTtftPred: average(rflPred.ttft),
    rflTpotPred: average(rflPred.tpot),
    rflE2elPred: average(rflPred.e2el),
    rflTtftMape: average(rflErr.ttft),
    rflTpotMape: average(rflErr.tpot),
    rflE2elMape: average(rflErr.e2el),
    lssTtftPred: average(lssPred.ttft),
    lssTpotPred: average(lssPred.tpot),
    lssE2elPred: average(lssPred.e2el),
    lssTtftMape: average(lssErr.ttft),
    lssTpotMape: average(lssErr.tpot),
    lssE2elMape: average(lssErr.e2el),
    n: rows.length,
  };
}

const BT_MAPE = { ttft: 'ttftMape', tpot: 'tpotMape', e2el: 'e2elMape' } as const;
const RFL_MAPE = { ttft: 'rflTtftMape', tpot: 'rflTpotMape', e2el: 'rflE2elMape' } as const;
const LSS_MAPE = { ttft: 'lssTtftMape', tpot: 'lssTpotMape', e2el: 'lssE2elMape' } as const;

function btMape(cell: CellAgg, metric: MetricKey): number | null {
  return cell[BT_MAPE[metric]];
}
function rflMape(cell: CellAgg, metric: MetricKey): number | null {
  return cell[RFL_MAPE[metric]];
}
function lssMape(cell: CellAgg, metric: MetricKey): number | null {
  return cell[LSS_MAPE[metric]];
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

// Why a (hardware, model) cell has no data: it physically can't run ("won't fit" — the model
// weights exceed the VRAM budget, so it was never benchmarked) vs simply "not run yet". Returns
// the reason string when infeasible, else null. Mirrors CoveragePage.infeasibilityReason.
function fitReason(
  gpu: string,
  tp: number,
  model: string,
  vramByLabel: Map<string, number>,
  weightsByModel: Map<string, number>,
  ratio: number,
): string | null {
  const vram = vramByLabel.get(HW_LABEL[gpu] ?? gpu);
  const weights = weightsByModel.get(model);
  if (!vram || !weights) return null;
  if (weights > vram * tp * ratio) {
    return `won't fit — needs ≥${Math.ceil(weights / ratio)} GB VRAM (weights ${weights} GB); ${gpu}${tp > 1 ? `×${tp}` : ''} has ${vram * tp} GB`;
  }
  return null;
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

// One predictor's line inside a matrix cell: colored dot + label + its APE (absolute
// percentage error vs the measured GT), toned by accuracy (the bands the legend
// explains). "no GT" when the predictor produced no scored row for this cell. The
// predicted/measured ms live in the cell tooltip, not the grid.
function PredLine({ label, color, mape }: { label: string; color: string; mape: number | null }) {
  const tone = mapeTone(mape);
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="flex items-baseline gap-1">
        <span className="inline-block h-1.5 w-1.5 shrink-0 self-center rounded-full" style={{ backgroundColor: color }} aria-hidden />
        <span className="text-[9px] uppercase tracking-wide" style={{ color }}>{label}</span>
      </span>
      {mape != null
        ? <span className={`tabular-nums text-[10px] ${tone.badge}`}>{mape.toFixed(0)}%</span>
        : <span className="text-[10px] text-[#676c76]">no GT</span>}
    </div>
  );
}

function cellTooltip(gpuKey: string, model: string, cell: CellAgg): string {
  const line = (label: string, m: MetricAgg, mape: number | null, rflM: number | null) =>
    `${label} kern ${formatMs(m.pred)}/${formatMs(m.meas)}` +
    (mape != null ? ` (${mape.toFixed(1)}%)` : '') +
    (rflM != null ? ` · rfl ${rflM.toFixed(1)}%` : '');
  const head = `${gpuKey} × ${model} — avg over ${cell.n} cells (kernel-composed vs roofline MAPE)`;
  return `${head}\n${line('TTFT', cell.ttft, cell.ttftMape, cell.rflTtftMape)}\n${line('TPOT', cell.tpot, cell.tpotMape, cell.rflTpotMape)}\n${line('E2EL', cell.e2el, cell.e2elMape, cell.rflE2elMape)}`;
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

  const matrix = useMemo(() => {
    if (!scopeIndex) return null;
    const models = new Set<string>();
    for (const rows of Object.values(scopeIndex.rowsByGpu)) {
      for (const row of rows) if (row.model) models.add(row.model);
    }
    const modelList = Array.from(models).sort();
    const hardware = scopeIndex.gpuOptions.map(gpuKey => {
      const rows = scopeIndex.rowsByGpu[gpuKey] ?? [];
      const byModel: Record<string, CellAgg> = {};
      for (const model of modelList) {
        const modelRows = rows.filter(r => r.model === model);
        if (modelRows.length) byModel[model] = aggregateCell(modelRows, gpuKey, roofline, llmsim);
      }
      return { gpuKey, parts: hardwareParts(gpuKey, rows), byModel };
    }).filter(h => Object.keys(h.byModel).length > 0);
    return { modelList, hardware };
  }, [scopeIndex, roofline, llmsim]);

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
            <span style={{ color: RFL_COLOR }}>roofline</span>; background tone = kernel-composed MAPE. Empty cells read{' '}
            <span className="text-[#64b5f6]">n/a</span> (won&apos;t fit) or <span className="text-[#676c76]">—</span> (not run). Hover for details.
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
          </div>
          {toggle(METRICS, metric, k => setMetric(k as MetricKey))}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-[#a9afba]">{metricLabel} MAPE:</span>
            <span className="rounded border border-[#3fb950]/30 bg-[#3fb950]/10 px-2 py-0.5 text-[#3fb950]">&lt;10%</span>
            <span className="rounded border border-[#58a6ff]/30 bg-[#58a6ff]/10 px-2 py-0.5 text-[#58a6ff]">10–25%</span>
            <span className="rounded border border-[#f0883e]/30 bg-[#f0883e]/10 px-2 py-0.5 text-[#f0883e]">25–50%</span>
            <span className="rounded border border-[#f85149]/30 bg-[#f85149]/10 px-2 py-0.5 text-[#f85149]">≥50%</span>
            <span className="rounded border border-[#ffffff1f] bg-white/[0.08] px-2 py-0.5 text-[#676c76]">no GT</span>
            <span className="rounded border border-[#64b5f6]/30 bg-[#64b5f6]/10 px-2 py-0.5 text-[#64b5f6]">n/a = won&apos;t fit</span>
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
                    <span className="text-xs text-[#a9afba]">tp{parts.tp} · {parts.backend}</span>
                  </div>
                </td>
                {shownModelList.map(model => {
                  const cell = byModel[model];
                  if (!cell) {
                    const reason = fitReason(parts.gpu, parts.tp, model, vramByLabel, weightsByModel, feasRatio);
                    return reason
                      ? <td key={model} title={reason} className="border-t border-[#ffffff1f] bg-[#64b5f6]/10 px-2.5 py-1 text-center align-middle text-[10px] font-medium text-[#64b5f6]">n/a</td>
                      : <td key={model} title="not run yet" className="border-t border-[#ffffff1f] px-2.5 py-1 text-center align-middle text-[#676c76]">—</td>;
                  }
                  const agg = cell[metric];
                  const kcMape = btMape(cell, metric);
                  const rflMapeVal = rflMape(cell, metric);
                  const lssMapeVal = lssMape(cell, metric);
                  const tone = mapeTone(kcMape);
                  const hasGt = agg.meas != null;
                  return (
                    <td key={model} className={`whitespace-nowrap border-t border-[#ffffff1f] px-2.5 py-1 align-middle ${hasGt ? tone.cell : 'bg-white/[0.04]'}`} title={cellTooltip(gpuKey, model, cell)}>
                      <div className="flex flex-col gap-0.5 font-mono text-[11px] leading-tight">
                        <PredLine label="kc" color={KC_COLOR} mape={kcMape} />
                        {hasRoofline && <PredLine label="rfl" color={RFL_COLOR} mape={rflMapeVal} />}
                        {hasLss && <PredLine label="lss" color={LSS_COLOR} mape={lssMapeVal} />}
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
