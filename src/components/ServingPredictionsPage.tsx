import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  DATA_SCOPE_META,
  type DataScope,
  isProfileInScope,
  normalizeDataScope,
  normalizeProfileName,
  profileDisplayName,
} from '../profileMeta';
import { rooflinePredictionsJsonUrl, llmsimPredictionsJsonUrl, servingPredictionsJsonUrl } from '../dataUrls';
import { buildRooflineLookup, rooflineKey, type RooflineLookup, type RooflineRow } from '../rooflinePredictions';
import { buildLssLookup, type LssLookup, type LssRow } from '../llmsimPredictions';

interface ServingTurnPrediction {
  turn_index: number;
  successful: number;
  total_context_tokens: number;
  new_prefill_tokens: number;
  cached_context_tokens: number;
  cache_hit_rate: number;
  output_tokens: number;
  backend_trace_summary?: BackendTraceSummary;
  backend_cache_work?: BackendCacheWork;
  backend_step_trace?: BackendStepTrace[];
  ttft_pred?: number; ttft_meas?: number; ttft_err?: number;
  ttft_signed_err_ms?: number; ttft_abs_err_ms?: number;
  ttft_pred_static?: number; ttft_err_static?: number;
  tpot_pred?: number; tpot_meas?: number; tpot_err?: number;
  tpot_pred_kernel?: number;
  tpot_pred_kernel_hint?: number;
  tpot_pred_ramp?: number;
  tpot_regime?: string;
  tpot_signed_err_ms?: number; tpot_abs_err_ms?: number;
  base_tpot_signed_err_ms?: number; base_tpot_abs_err_ms?: number;
  e2el_pred?: number; e2el_meas?: number; e2el_err?: number;
  e2el_signed_err_ms?: number; e2el_abs_err_ms?: number;
  e2el_pred_static?: number; e2el_err_static?: number;
  scheduled_requests?: number;
  base_tpot_pred?: number;
  decode_waves?: number;
  decode_wave_token_pressure?: number;
  max_wave_batch?: number;
  batch_utilization?: number;
  scheduled_utilization?: number;
  continuous_batching_mode?: string;
  scheduling_regime?: string;
  turn_position_bin?: string;
  context_cache_regime?: string;
  decode_load_regime?: string;
  workload_regime?: string;
  turn_batching_regime?: string;
  startup_prefill_token_budget_scale?: number;
  steady_state_ttft_ms?: number;
  steady_state_request_count?: number;
}

interface BackendTraceSummary {
  total_steps?: number;
  max_decode_batch?: number;
  mean_decode_batch?: number;
  max_active_requests?: number;
  max_waiting_requests?: number;
  total_prefill_tokens?: number;
  total_decode_tokens?: number;
  scheduler_overhead_ms?: number;
  effective_prefill_tokens?: number;
  realized_cached_tokens?: number;
  replayed_cached_tokens?: number;
  evicted_cached_tokens?: number;
  logical_cached_tokens?: number;
  cache_pressure?: number;
}

interface BackendCacheWork {
  effective_prefill_tokens?: number;
  realized_cached_tokens?: number;
  replayed_cached_tokens?: number;
  evicted_cached_tokens?: number;
  logical_cached_tokens?: number;
  cache_pressure?: number;
}

interface BackendStepTrace {
  step_index: number;
  wall_start_ms: number;
  step_ms: number;
  scheduler_overhead_ms: number;
  prefill_tokens: number;
  decode_batch: number;
  active_requests: number;
  waiting_requests: number;
  max_context_tokens: number;
  kv_resident_tokens: number;
}

interface BackendSpecSummary {
  name?: string;
  max_num_batched_tokens?: number;
  max_num_seqs?: number;
  prefill_policy?: string;
  decode_policy?: string;
  cache_mode?: string;
  cache_realization_rate?: number;
  kv_block_tokens?: number;
  kv_budget_tokens?: number;
}

export interface ServingRow {
  model: string; backend?: string; profile: string; concurrency?: number; isl: number; osl: number;
  tensor_parallel_size?: number;
  enable_ep?: boolean;
  // Canonical parallelism-strategy label ("1gpu" | "tp" | "tp+ep" | "ep"), emitted by
  // build_simulator_predictions. Absent on legacy configs -> derived from tp (EP-off).
  parallelism?: string;
  data_scope?: string;
  dataScope?: string;
  mode?: string;
  total_context_tokens?: number;
  new_prefill_tokens?: number;
  cached_context_tokens?: number;
  cache_hit_rate?: number;
  cache_aware_applied?: boolean;
  cache_feature_source?: string;
  cache_prediction_regime?: string;
  unsupported_reason?: string;
  measurement_semantics_warning?: string;
  multiturn_prediction_mode?: string;
  predicted_turn_count?: number;
  total_successful_turn_requests?: number;
  scheduled_request_count?: number;
  mean_predicted_turn_ttft_ms?: number;
  mean_predicted_turn_tpot_ms?: number;
  continuous_batching_mode?: string;
  backend_emulator_status?: string;
  backend_spec?: BackendSpecSummary;
  backend_trace_summary?: BackendTraceSummary;
  kernel_source_summary?: Record<string, number>;
  multiturn_turn_predictions?: ServingTurnPrediction[];
  ttft_pred?: number; ttft_meas?: number; ttft_err?: number;
  ttft_signed_err_ms?: number; ttft_abs_err_ms?: number;
  ttft_pred_static?: number; ttft_err_static?: number;
  tpot_pred?: number; tpot_meas?: number; tpot_err?: number;
  tpot_signed_err_ms?: number; tpot_abs_err_ms?: number; tpot_max_abs_err_ms?: number;
  e2el_pred?: number; e2el_meas?: number; e2el_err?: number;
  e2el_signed_err_ms?: number; e2el_abs_err_ms?: number;
  e2el_pred_static?: number; e2el_err_static?: number;
}

// Parallelism axis (shared with the Predictions matrix). Canonical order for the
// selector; "1gpu" (single GPU) sorts before the multi-GPU strategies.
export const PARALLELISM_ORDER = ['1gpu', 'tp', 'tp+ep', 'ep', 'pp', 'ep+pp'] as const;

// A row's parallelism label, deriving it from tensor_parallel_size (EP-off) when the
// field is absent (legacy configs predate it): tp>1 -> "tp", else "1gpu".
export function rowParallelism(row: ServingRow): string {
  if (row.parallelism) return row.parallelism;
  const tp = row.tensor_parallel_size ?? 1;
  const axes: string[] = [];
  if (tp > 1) axes.push('tp');
  if (row.enable_ep) axes.push('ep');
  return axes.join('+') || '1gpu';
}

// Distinct parallelism labels present in a set of rows, in canonical order.
export function parallelismOptions(rows: ServingRow[]): string[] {
  const present = new Set(rows.map(rowParallelism));
  return PARALLELISM_ORDER.filter(p => present.has(p));
}

type ServingPerTurnRow = ServingRow & { multiturn_turn_predictions: ServingTurnPrediction[] };

interface ServingMatrixRow {
  key: string;
  model: string;
  backend?: string;
  profile: string;
  cells: Record<number, ServingRow>;
}

interface ServingProfileGroup {
  key: string;
  profile: string;
  backendRows: ServingMatrixRow[];
}

interface GpuConfigSummary {
  gpu: string;
  rows: number;
  models: number;
  profiles: number;
  backends: number;
  concurrencies: number;
  meanTtftMape?: number;
  meanTpotMape?: number;
  meanE2elMape?: number;
}

interface ServingScopeIndex {
  rowsByGpu: Record<string, ServingRow[]>;
  gpuOptions: string[];
  summaries: GpuConfigSummary[];
  summariesByGpu: Record<string, GpuConfigSummary>;
}

export interface ServingIndex {
  trace_replay: ServingScopeIndex;
  synthetic_distributional: ServingScopeIndex;
  archived: ServingScopeIndex;
}

interface ServingFocus {
  gpu: string;
  model: string;
  title: string;
  description: string;
  profiles?: string[];
}

type OptionalMetric = number | null | undefined;

type PredictionPageKind = 'serving' | 'simulator';

const EMPTY_GPU_OPTIONS: string[] = [];

const SERVING_GPU_ORDER = [
  'H100',
  'H100x2',
  'H100x4',
  'A100',
  'A100x2',
  'A100x4',
  'A100x8',
  'RTX3090',
  'RTX3090x2',
  'RTX3090x4',
  'RTX3090x8',
  'RTX2080Ti',
  'RTX2080Tix2',
  'RTX2080Tix4',
];

const SERVING_PROFILE_ORDER = [
  'chat-singleturn',
  'coding-singleturn',
  'chat-multiturn',
  'swebench-multiturn',
  'terminalbench-multiturn',
  'osworld-multiturn',
  'chat-singleturn-synth',
  'chat-multiturn-synth',
  'swebench-multiturn-synth',
  'terminalbench-multiturn-synth',
  'osworld-multiturn-synth',
  'chat-short',
  'chat-medium',
  'fixed-seq128',
  'prefill-heavy',
  'decode-heavy',
  'random-1k',
  'chat-multiturn-short',
  'chat-multiturn-medium',
  'chat-multiturn-long',
  'swebench-multiturn-short',
  'swebench-multiturn-medium',
  'swebench-multiturn-long',
  'terminalbench-multiturn-short',
  'terminalbench-multiturn-medium',
  'terminalbench-multiturn-long',
  'osworld-multiturn-short',
  'osworld-multiturn-medium',
  'osworld-multiturn-long',
];

type ServingMetricKey =
  | 'ttft_pred' | 'ttft_meas' | 'ttft_err'
  | 'ttft_signed_err_ms' | 'ttft_abs_err_ms'
  | 'tpot_pred' | 'tpot_meas' | 'tpot_err'
  | 'tpot_signed_err_ms' | 'tpot_abs_err_ms'
  | 'e2el_pred' | 'e2el_meas' | 'e2el_err'
  | 'e2el_signed_err_ms' | 'e2el_abs_err_ms';

interface ServingMetric {
  label: string;
  description: string;
  color: string;
  predKey: ServingMetricKey;
  measKey: ServingMetricKey;
  errKey: ServingMetricKey;
  // Explicit per-turn / cell signed + abs latency-error fields written by the
  // augmenter (ttft_signed_err_ms, tpot_abs_err_ms, …). When present they are
  // read directly; otherwise the (pred - meas) fallback applies.
  signedKey: ServingMetricKey;
  absKey: ServingMetricKey;
  isTotal?: boolean;
}

const SERVING_METRICS: ServingMetric[] = [
  {
    label: 'TTFT',
    description: 'first token',
    color: '#ff9f0a',
    predKey: 'ttft_pred',
    measKey: 'ttft_meas',
    errKey: 'ttft_err',
    signedKey: 'ttft_signed_err_ms',
    absKey: 'ttft_abs_err_ms',
  },
  {
    label: 'TPOT',
    description: 'per output token',
    color: '#2dd4bf',
    predKey: 'tpot_pred',
    measKey: 'tpot_meas',
    errKey: 'tpot_err',
    signedKey: 'tpot_signed_err_ms',
    absKey: 'tpot_abs_err_ms',
  },
  {
    label: 'E2EL',
    description: 'end-to-end',
    color: '#a855f7',
    predKey: 'e2el_pred',
    measKey: 'e2el_meas',
    errKey: 'e2el_err',
    signedKey: 'e2el_signed_err_ms',
    absKey: 'e2el_abs_err_ms',
    isTotal: true,
  },
];
const SERVING_TPOT_METRIC = SERVING_METRICS[1];
const SERVING_MAPE_COLUMN_WIDTH = 74;
const SERVING_MAPE_RAIL_WIDTH = SERVING_METRICS.length * SERVING_MAPE_COLUMN_WIDTH;

// Per-predictor accent colors, shared with the Predictions matrix so both surfaces read the same:
// kernel-composed = teal, roofline = purple.
const KC_COLOR = '#2dd4bf';
const RFL_COLOR = '#a855f7';
const LSS_COLOR = '#fb923c';  // LLMServingSim 2.0 (external simulator)

// The analytic roofline predictor is joined to the kernel-composed serving rows by
// (gpu_key, model, profile, concurrency) — the same join the Predictions matrix uses — and shown
// ALONGSIDE kernel-composed rather than behind a source toggle: an MdAPE badge in the target bar
// and a flat reference line in the per-turn chart. Both predictors score against the same measured GT.
function meanRooflineError(
  rows: ServingRow[],
  gpuKey: string,
  roofline: RooflineLookup,
  metric: 'ttft' | 'tpot' | 'e2el',
): number | undefined {
  const errs: number[] = [];
  for (const row of rows) {
    if (row.model == null || row.profile == null || row.concurrency == null) continue;
    const match = roofline.get(rooflineKey(gpuKey, row.model, row.profile, row.concurrency));
    const err = match?.[`fwd_${metric}_err` as keyof RooflineRow];
    if (typeof err === 'number' && Number.isFinite(err)) errs.push(Math.abs(err));
  }
  // forward-predictions.json doesn't cover every roofline model (e.g. Qwen3.5). Fall back
  // to the in-file roofline-fallback rows so the roofline rail still shows a number.
  if (!errs.length) {
    for (const row of rows) {
      if (isKernelComposedRow(row)) continue;
      const err = numericMetric(row, `${metric}_err` as ServingMetricKey);
      if (typeof err === 'number' && Number.isFinite(err)) errs.push(Math.abs(err));
    }
  }
  return errs.length ? median(errs) : undefined;  // MdAPE (median), not mean
}

// The roofline predictor's per-config scalar row for a single serving cell (no per-turn resolution),
// used to overlay a flat reference line on the per-turn chart. Undefined when no roofline row joins.
function rooflineRefFor(
  row: ServingRow | undefined,
  gpuKey: string,
  roofline: RooflineLookup,
): RooflineRow | undefined {
  if (!row || row.model == null || row.profile == null || row.concurrency == null) return undefined;
  return roofline.get(rooflineKey(gpuKey, row.model, row.profile, row.concurrency));
}

// LLMServingSim 2.0 (external simulator on QuettaSim-synthesized profiles). Joined the same way as
// roofline; shown as a third MdAPE badge + a third flat per-turn reference line.
function meanLssError(
  rows: ServingRow[],
  gpuKey: string,
  llmsim: LssLookup,
  metric: 'ttft' | 'tpot' | 'e2el',
): number | undefined {
  const errs: number[] = [];
  for (const row of rows) {
    if (row.model == null || row.profile == null || row.concurrency == null) continue;
    const match = llmsim.get(rooflineKey(gpuKey, row.model, row.profile, row.concurrency));
    const err = match?.[`${metric}_err` as keyof LssRow];
    if (typeof err === 'number' && Number.isFinite(err)) errs.push(Math.abs(err));
  }
  return errs.length ? median(errs) : undefined;  // MdAPE (median), not mean
}

function lssRefFor(
  row: ServingRow | undefined,
  gpuKey: string,
  llmsim: LssLookup,
): LssRow | undefined {
  if (!row || row.model == null || row.profile == null || row.concurrency == null) return undefined;
  return llmsim.get(rooflineKey(gpuKey, row.model, row.profile, row.concurrency));
}

// Tone + compact formatting shared by the cells, the row-MAPE rail and the badges.
function toneFor(value: OptionalMetric): { className: string } {
  return servingErrorTone(value);
}

function compactValueFor(value: OptionalMetric): string {
  return formatCompactPercent(value);
}

export function ServingPredictionsPage({
  dataScope,
  focus,
  predictionsUrl = servingPredictionsJsonUrl,
  pageKind = 'serving',
}: {
  dataScope: DataScope;
  focus?: ServingFocus;
  predictionsUrl?: string;
  pageKind?: PredictionPageKind;
}) {
  const [servingIndex, setServingIndex] = useState<ServingIndex | null>(null);
  const [gpu, setGpu] = useState('H100');
  const [model, setModel] = useState('');
  const [backend, setBackend] = useState<'all' | 'vllm' | 'sglang'>('vllm');
  const [parallelism, setParallelism] = useState<string>('');
  const [roofline, setRoofline] = useState<RooflineLookup>(new Map());
  const [llmsim, setLlmsim] = useState<LssLookup>(new Map());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

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
      .then(response => (response.ok ? response.json() : null))
      .then(json => setRoofline(buildRooflineLookup(json)))
      .catch(() => setRoofline(new Map()));
  }, []);

  // LLMServingSim 2.0 predictions are optional — absent (404) until the sweep has been built.
  useEffect(() => {
    fetch(llmsimPredictionsJsonUrl)
      .then(response => (response.ok ? response.json() : null))
      .then(json => setLlmsim(buildLssLookup(json)))
      .catch(() => setLlmsim(new Map()));
  }, []);

  const scopeIndex = servingIndex?.[dataScope];
  // The simulator page self-selects model + GPU via dropdowns (no fixed focus prop).
  const selectorMode = pageKind === 'simulator' && !focus;

  // Model options = distinct models across every GPU config in the scope.
  const modelOptions = useMemo(() => {
    if (!scopeIndex) return EMPTY_GPU_OPTIONS;
    const models = new Set<string>();
    for (const gpuRows of Object.values(scopeIndex.rowsByGpu)) {
      for (const row of gpuRows) if (row.model) models.add(row.model);
    }
    return Array.from(models).sort();
  }, [scopeIndex]);
  const selectedModel = focus?.model ?? (modelOptions.includes(model) ? model
    : modelOptions.includes('Llama-3.1-8B') ? 'Llama-3.1-8B'  // calibrated config first
    : (modelOptions[0] ?? ''));

  // GPU options — restricted to those that actually have rows for the selected model
  // (the "GPU given model" dropdown); otherwise every GPU config in the scope.
  // Does this scope have any SGLang configs? (gpu_key carries a "(sglang)" suffix.) Drives the
  // backend dropdown so SGLang and vLLM configs don't conflate in the GPU selector.
  const hasSglang = useMemo(
    () => (scopeIndex ? scopeIndex.gpuOptions.some(g => /\(sglang\)/i.test(g)) : false),
    [scopeIndex]);
  const gpuOptions = useMemo(() => {
    if (!scopeIndex) return EMPTY_GPU_OPTIONS;
    if (!selectorMode) return scopeIndex.gpuOptions;
    const matchesBackend = (g: string) =>
      backend === 'all' ? true : backend === 'sglang' ? /\(sglang\)/i.test(g) : !/\(sglang\)/i.test(g);
    return scopeIndex.gpuOptions.filter(g =>
      (scopeIndex.rowsByGpu[g] ?? []).some(row => row.model === selectedModel) && matchesBackend(g));
  }, [scopeIndex, selectorMode, selectedModel, backend]);
  const selectedGpu = focus?.gpu ?? (gpuOptions.includes(gpu) ? gpu : (gpuOptions[0] ?? gpu));

  useEffect(() => {
    if (focus?.gpu) return;
    if (!gpuOptions.length) return;
    setGpu(current => gpuOptions.includes(current) ? current : gpuOptions[0]);
  }, [focus?.gpu, gpuOptions]);

  // Parallelism axis, scoped to the selected (GPU, model): its rows can carry both a
  // tp and a tp+ep run (EP-off vs EP-on) that must not conflate (they'd collide in the
  // per-concurrency cell map). Options come from what's actually present; the effective
  // value defaults to the first in canonical order (1gpu/tp before tp+ep).
  const parallelismOpts = useMemo(() => {
    if (!scopeIndex) return EMPTY_GPU_OPTIONS;
    const base = (scopeIndex.rowsByGpu[selectedGpu] ?? []).filter(row => row.model === selectedModel);
    return parallelismOptions(base);
  }, [scopeIndex, selectedGpu, selectedModel]);
  const effParallelism = parallelismOpts.includes(parallelism)
    ? parallelism : (parallelismOpts[0] ?? '');

  const rows = useMemo(() => {
    const base = scopeIndex?.rowsByGpu[selectedGpu] ?? [];
    if (focus) return applyServingFocus(base, focus);
    if (selectorMode) return base.filter(row =>
      row.model === selectedModel && (!effParallelism || rowParallelism(row) === effParallelism));
    return base;
  }, [scopeIndex, selectedGpu, focus, selectorMode, selectedModel, effParallelism]);
  // Predictions are always the kernel-composed backtester rows (per-turn detail intact). The analytic
  // roofline is no longer a table-replacing mode toggle — it is joined via the `roofline` lookup and
  // shown alongside: as a MAPE badge group in the target bar and a reference line in the per-turn chart.
  const hasRoofline = roofline.size > 0;
  const hasLss = llmsim.size > 0;
  // In selector mode, keep the table's focused single-config view via a synthesized focus.
  const tableFocus: ServingFocus | undefined = selectorMode && selectedModel
    ? { gpu: selectedGpu, model: selectedModel, title: 'Simulator', description: '' }
    : focus;

  if (loading) return <div className="p-8 text-[#a9afba]">Loading predictions...</div>;
  if (failed || !scopeIndex) return <div className="p-8 text-[#ff3b30]">Failed to load predictions JSON</div>;

  return (
    <div className="space-y-4">
      {selectorMode ? (
        <SimulatorTargetBar
          modelOptions={modelOptions}
          selectedModel={selectedModel}
          onModel={setModel}
          gpuOptions={gpuOptions}
          selectedGpu={selectedGpu}
          onGpu={setGpu}
          backend={backend}
          onBackend={setBackend}
          showBackend={hasSglang}
          parallelismOpts={parallelismOpts}
          selectedParallelism={effParallelism}
          onParallelism={setParallelism}
          hasRoofline={hasRoofline}
          hasLss={hasLss}
          ttftMape={meanMetricError(rows, 'ttft_err')}
          tpotMape={meanMetricError(rows, 'tpot_err')}
          e2elMape={meanMetricError(rows, 'e2el_err')}
          rflTtftMape={meanRooflineError(rows, selectedGpu, roofline, 'ttft')}
          rflTpotMape={meanRooflineError(rows, selectedGpu, roofline, 'tpot')}
          rflE2elMape={meanRooflineError(rows, selectedGpu, roofline, 'e2el')}
          lssTtftMape={meanLssError(rows, selectedGpu, llmsim, 'ttft')}
          lssTpotMape={meanLssError(rows, selectedGpu, llmsim, 'tpot')}
          lssE2elMape={meanLssError(rows, selectedGpu, llmsim, 'e2el')}
        />
      ) : (
        <>
          <div className="border-b border-[#ffffff14] pb-5">
            <div>
              <h2 className="text-[22px] font-semibold tracking-tight text-[#f3f4f6]">{focus?.title ?? 'Predictions'}</h2>
              <p className="mt-1.5 max-w-3xl text-[13px] text-[#a9afba]">
                {focus?.description ?? `High-concurrency predictions vs measured benchmark results from ${DATA_SCOPE_META[dataScope].label.toLowerCase()}.`}
                Multi-turn TTFT reflects cache-aware serving behavior, not cumulative full-prefill latency.
              </p>
            </div>
          </div>

          {focus ? (
            <ServingFocusSummary
              rows={rows}
              focus={focus}
              dataScope={dataScope}
            />
          ) : (
            <GpuConfigSelector
              scopeIndex={scopeIndex}
              selectedGpu={gpu}
              onSelect={setGpu}
            />
          )}
        </>
      )}

      <ServingTable
        rows={rows}
        dataScope={dataScope}
        focus={tableFocus}
        roofline={roofline}
        llmsim={llmsim}
        gpuKey={selectedGpu}
      />
    </div>
  );
}


function applyServingFocus(rows: ServingRow[], focus?: ServingFocus): ServingRow[] {
  if (!focus) return rows;
  const profileSet = focus.profiles
    ? new Set(focus.profiles.map(profile => normalizeProfileName(profile)))
    : null;
  return rows.filter(row => {
    if (row.model !== focus.model) return false;
    if (profileSet && !profileSet.has(normalizeProfileName(row.profile))) return false;
    return true;
  });
}

function ServingFocusSummary({
  rows,
  focus,
  dataScope,
}: {
  rows: ServingRow[];
  focus: ServingFocus;
  dataScope: DataScope;
}) {
  const summary = summarizeGpuConfig(focus.gpu, rows);
  const profiles = new Set(rows.map(row => row.profile)).size;
  const backends = Array.from(new Set(rows.map(row => row.backend).filter(Boolean))).sort();
  const concurrencies = Array.from(new Set(rows.map(row => row.concurrency ?? 1))).sort((a, b) => a - b);
  const emulatorRows = rows.filter(row => row.backend_emulator_status === 'event_loop_enabled');
  const steadyRows = rows.filter(row => isSteadyStateRow(row));
  const replayedTokens = emulatorRows.reduce((total, row) => total + (row.backend_trace_summary?.replayed_cached_tokens ?? 0), 0);

  return (
    <section className="glass rounded-[22px] p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#676c76]">Focused target</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-[#2dd4bf]/30 bg-[#2dd4bf]/10 px-2.5 py-0.5 font-mono text-[#2dd4bf]">
              {focus.gpu}
            </span>
            <span className="rounded-full border border-[#34c759]/30 bg-[#34c759]/10 px-2.5 py-0.5 font-mono text-[#34c759]">
              {focus.model}
            </span>
            <span className="text-[#676c76]">{DATA_SCOPE_META[dataScope].label}</span>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <MetricBadge label="TTFT MdAPE" value={summary.meanTtftMape} />
          <MetricBadge label="TPOT MdAPE" value={summary.meanTpotMape} />
          <MetricBadge label="E2EL MdAPE" value={summary.meanE2elMape} />
        </div>
      </div>

      <div className="mt-4 grid gap-2 border-t border-white/60 pt-4 text-xs text-[#a9afba] sm:grid-cols-7">
        <FocusStat label="Rows" value={rows.length.toLocaleString()} />
        <FocusStat label="Profiles" value={profiles.toLocaleString()} />
        <FocusStat label="Backends" value={backends.length ? backends.join(', ') : '-'} />
        <FocusStat label="Concurrency" value={formatConcurrencyRange(concurrencies)} />
        <FocusStat label="Emulator" value={`${emulatorRows.length}/${rows.length}`} />
        <FocusStat label="Steady" value={`${steadyRows.length}/${rows.length}`} />
        <FocusStat label="Replay" value={formatTokenCount(replayedTokens)} />
      </div>
    </section>
  );
}

function FocusStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-[#676c76]">{label}</div>
      <div className="mt-0.5 font-mono text-[#a9afba]">{value}</div>
    </div>
  );
}

function LabeledSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[#676c76]">{label}</span>
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        disabled={options.length <= 1}
        className="glass-hover min-w-[150px] rounded-full border border-[#ffffff1f] bg-white/[0.04] px-3 py-1.5 font-mono text-[13px] text-[#f3f4f6] outline-none transition-colors focus:border-[#2dd4bf] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {options.length === 0 && <option value="">—</option>}
        {options.map(option => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function SimulatorTargetBar({
  modelOptions,
  selectedModel,
  onModel,
  gpuOptions,
  selectedGpu,
  onGpu,
  backend,
  onBackend,
  showBackend,
  parallelismOpts,
  selectedParallelism,
  onParallelism,
  hasRoofline,
  ttftMape,
  tpotMape,
  e2elMape,
  rflTtftMape,
  rflTpotMape,
  rflE2elMape,
  hasLss,
  lssTtftMape,
  lssTpotMape,
  lssE2elMape,
}: {
  modelOptions: string[];
  selectedModel: string;
  onModel: (model: string) => void;
  gpuOptions: string[];
  selectedGpu: string;
  onGpu: (gpu: string) => void;
  backend: 'all' | 'vllm' | 'sglang';
  onBackend: (backend: 'all' | 'vllm' | 'sglang') => void;
  showBackend: boolean;
  parallelismOpts: string[];
  selectedParallelism: string;
  onParallelism: (parallelism: string) => void;
  hasRoofline: boolean;
  ttftMape: OptionalMetric;
  tpotMape: OptionalMetric;
  e2elMape: OptionalMetric;
  rflTtftMape: OptionalMetric;
  rflTpotMape: OptionalMetric;
  rflE2elMape: OptionalMetric;
  hasLss: boolean;
  lssTtftMape: OptionalMetric;
  lssTpotMape: OptionalMetric;
  lssE2elMape: OptionalMetric;
}) {
  return (
    <section className="glass rounded-[22px] px-5 py-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <LabeledSelect label="Model" value={selectedModel} options={modelOptions} onChange={onModel} />
          <LabeledSelect label="GPU" value={selectedGpu} options={gpuOptions} onChange={onGpu} />
          {showBackend && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[#676c76]">Backend</span>
              <select
                value={backend}
                onChange={event => onBackend(event.target.value as 'all' | 'vllm' | 'sglang')}
                className="glass-hover min-w-[150px] rounded-full border border-[#ffffff1f] bg-white/[0.04] px-3 py-1.5 font-mono text-[13px] text-[#f3f4f6] outline-none transition-colors focus:border-[#2dd4bf]"
              >
                <option value="vllm">vLLM</option>
                <option value="sglang">SGLang</option>
                <option value="all">All</option>
              </select>
            </label>
          )}
          {parallelismOpts.length > 0 && (
            <LabeledSelect label="Parallelism" value={selectedParallelism}
              options={parallelismOpts} onChange={onParallelism} />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="flex w-[104px] shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: KC_COLOR }}>
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: KC_COLOR }} aria-hidden />
              kernel-composed
            </span>
            <div className="grid grow gap-2 sm:grid-cols-3">
              <MetricBadge label="TTFT MdAPE" value={ttftMape} />
              <MetricBadge label="TPOT MdAPE" value={tpotMape} />
              <MetricBadge label="E2EL MdAPE" value={e2elMape} />
            </div>
          </div>
          {hasRoofline && (
            <div className="flex items-center gap-2">
              <span className="flex w-[104px] shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: RFL_COLOR }}>
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: RFL_COLOR }} aria-hidden />
                roofline
              </span>
              <div className="grid grow gap-2 sm:grid-cols-3">
                <MetricBadge label="TTFT MdAPE" value={rflTtftMape} />
                <MetricBadge label="TPOT MdAPE" value={rflTpotMape} />
                <MetricBadge label="E2EL MdAPE" value={rflE2elMape} />
              </div>
            </div>
          )}
          {hasLss && (
            <div className="flex items-center gap-2">
              <span className="flex w-[104px] shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: LSS_COLOR }}>
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: LSS_COLOR }} aria-hidden />
                LLMServingSim
              </span>
              <div className="grid grow gap-2 sm:grid-cols-3">
                <MetricBadge label="TTFT MdAPE" value={lssTtftMape} />
                <MetricBadge label="TPOT MdAPE" value={lssTpotMape} />
                <MetricBadge label="E2EL MdAPE" value={lssE2elMape} />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function GpuConfigSelector({
  scopeIndex,
  selectedGpu,
  onSelect,
}: {
  scopeIndex: ServingScopeIndex;
  selectedGpu: string;
  onSelect: (gpu: string) => void;
}) {
  const selectedSummary = scopeIndex.summariesByGpu[selectedGpu];
  const groups = useMemo(
    () => groupGpuSummaries(scopeIndex.summaries),
    [scopeIndex.summaries],
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#676c76]">GPU config</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono text-sm font-semibold text-[#f3f4f6]">{selectedGpu}</span>
            {selectedSummary && (
              <>
                <span className="text-[#676c76]">{selectedSummary.rows} rows</span>
                <span className="text-[#676c76]">{selectedSummary.models} models</span>
                <span className="text-[#676c76]">{selectedSummary.profiles} profiles</span>
                <MetricBadge label="TTFT MdAPE" value={selectedSummary.meanTtftMape} />
                <MetricBadge label="TPOT MdAPE" value={selectedSummary.meanTpotMape} />
                <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${servingErrorTone(selectedSummary.meanE2elMape).className}`}>
                  E2EL MdAPE {formatCompactPercent(selectedSummary.meanE2elMape)}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="text-xs text-[#676c76]">
          {scopeIndex.summaries.length} configs in {Object.keys(groups).length} families
        </div>
      </div>

      <div className="glass space-y-2 rounded-[22px] p-3">
        {Object.entries(groups).map(([family, familySummaries]) => (
          <div key={family} className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
            <div className="w-20 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-[#676c76]">
              {family}
            </div>
            <div className="flex flex-1 flex-wrap gap-1.5">
              {familySummaries.map(summary => (
                <GpuConfigButton
                  key={summary.gpu}
                  summary={summary}
                  selected={summary.gpu === selectedGpu}
                  onClick={() => onSelect(summary.gpu)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function GpuConfigButton({
  summary,
  selected,
  onClick,
}: {
  summary: GpuConfigSummary;
  selected: boolean;
  onClick: () => void;
}) {
  const acceleratorCount = gpuAcceleratorCount(summary.gpu);

  return (
    <button
      onClick={onClick}
      className={`min-h-[72px] min-w-[146px] rounded-2xl border px-3 py-2 text-left transition-colors duration-150 ${
        selected
          ? 'border-[#2dd4bf] bg-[#2dd4bf]/[0.06] shadow-[inset_0_0_0_1px_rgba(45,212,191,0.35)]'
          : 'border-[#ffffff14] bg-white/[0.02] hover:border-[#ffffff2e] hover:bg-white/[0.05]'
      }`}
      title={`${summary.gpu}: TTFT MdAPE ${formatPercent(summary.meanTtftMape)}, TPOT MdAPE ${formatPercent(summary.meanTpotMape)}, E2EL MdAPE ${formatPercent(summary.meanE2elMape)}`}
    >
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="font-mono text-xs font-semibold text-[#f3f4f6]">{summary.gpu}</div>
          <span className={`shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] ${servingErrorTone(summary.meanE2elMape).className}`}>
            E2EL {formatCompactPercent(summary.meanE2elMape)}
          </span>
        </div>
        <div className="mt-0.5 text-[9px] uppercase tracking-wide text-[#676c76]">
          {acceleratorCount === 1 ? '1 GPU' : `${acceleratorCount} GPUs`} · {summary.models} models
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1">
          <MetricBadge label="TTFT MdAPE" value={summary.meanTtftMape} compact />
          <MetricBadge label="TPOT MdAPE" value={summary.meanTpotMape} compact />
        </div>
      </div>
    </button>
  );
}

function summarizeGpuConfig(gpu: string, rows: ServingRow[]): GpuConfigSummary {
  return {
    gpu,
    rows: rows.length,
    models: new Set(rows.map(row => row.model)).size,
    profiles: new Set(rows.map(row => row.profile)).size,
    backends: new Set(rows.map(row => row.backend ?? '')).size,
    concurrencies: new Set(rows.map(row => row.concurrency ?? 1)).size,
    meanTtftMape: meanMetricError(rows, 'ttft_err'),
    meanTpotMape: meanMetricError(rows, 'tpot_err'),
    meanE2elMape: meanMetricError(rows, 'e2el_err'),
  };
}

function MetricBadge({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: OptionalMetric;
  compact?: boolean;
}) {
  return (
    <span className={`inline-flex items-center justify-between gap-1 rounded-full px-1.5 py-0.5 font-mono ${compact ? 'text-[9px]' : 'text-[10px]'} ${toneFor(value).className}`}>
      <span className="font-sans font-semibold uppercase tracking-wide">{label}</span>
      <span>{compactValueFor(value)}</span>
    </span>
  );
}

// A config is kernel-composed only when tagged so; a roofline FALLBACK (Qwen3.5 GDN,
// gpt-oss, or a GPU with no device YAML) must not count toward the "kernel-composed"
// headline -- its number belongs on the roofline rail.
function isKernelComposedRow(row: ServingRow): boolean {
  return row.multiturn_prediction_mode === 'v2_kernel_composed';
}

function meanMetricError(rows: ServingRow[], errKey: ServingMetricKey): number | undefined {
  const errors = rows
    .filter(isKernelComposedRow)
    .map(row => numericMetric(row, errKey))
    .filter((value): value is number => value !== undefined)
    .map(value => Math.abs(value));
  return errors.length ? median(errors) : undefined;  // MdAPE (median), not mean
}

function groupGpuSummaries(summaries: GpuConfigSummary[]): Record<string, GpuConfigSummary[]> {
  const groups: Record<string, GpuConfigSummary[]> = {};
  for (const summary of summaries) {
    const family = gpuFamily(summary.gpu);
    if (!groups[family]) groups[family] = [];
    groups[family].push(summary);
  }
  return groups;
}

function gpuFamily(gpu: string): string {
  if (gpu.startsWith('H100')) return 'H100';
  if (gpu.startsWith('A100')) return 'A100';
  if (gpu.startsWith('RTX3090')) return 'RTX 3090';
  if (gpu.startsWith('RTX2080Ti')) return 'RTX 2080 Ti';
  return 'Other';
}

function gpuAcceleratorCount(gpu: string): number {
  const match = gpu.match(/x(\d+)$/);
  return match ? Number(match[1]) : 1;
}

function compareServingGpus(a: string, b: string): number {
  const aRank = SERVING_GPU_ORDER.indexOf(a);
  const bRank = SERVING_GPU_ORDER.indexOf(b);
  const normalizedARank = aRank === -1 ? SERVING_GPU_ORDER.length : aRank;
  const normalizedBRank = bRank === -1 ? SERVING_GPU_ORDER.length : bRank;
  if (normalizedARank !== normalizedBRank) return normalizedARank - normalizedBRank;
  return a.localeCompare(b);
}

function createServingScopeIndex(): ServingScopeIndex {
  return {
    rowsByGpu: {},
    gpuOptions: [],
    summaries: [],
    summariesByGpu: {},
  };
}

export function buildServingIndex(data: Record<string, ServingRow[]>): ServingIndex {
  const index: ServingIndex = {
    trace_replay: createServingScopeIndex(),
    synthetic_distributional: createServingScopeIndex(),
    archived: createServingScopeIndex(),
  };

  for (const [gpu, rows] of Object.entries(data)) {
    for (const row of rows) {
      const dataScope = normalizeDataScope(row.data_scope ?? row.dataScope ?? null) ?? 'archived';

      const profile = normalizeProfileName(row.profile);
      if (!isProfileInScope(profile, dataScope)) continue;

      const normalizedRow = profile === row.profile ? row : { ...row, profile };
      const rowsByGpu = index[dataScope].rowsByGpu;
      if (!rowsByGpu[gpu]) rowsByGpu[gpu] = [];
      rowsByGpu[gpu].push(normalizedRow);
    }
  }

  for (const scope of ['trace_replay', 'synthetic_distributional', 'archived'] as const) {
    const scopeIndex = index[scope];
    scopeIndex.gpuOptions = Object.keys(scopeIndex.rowsByGpu)
      .filter(gpu => scopeIndex.rowsByGpu[gpu].length > 0)
      .sort(compareServingGpus);
    scopeIndex.summaries = scopeIndex.gpuOptions.map(gpu => (
      summarizeGpuConfig(gpu, scopeIndex.rowsByGpu[gpu] ?? [])
    ));
    scopeIndex.summariesByGpu = Object.fromEntries(
      scopeIndex.summaries.map(summary => [summary.gpu, summary]),
    );
  }

  return index;
}

function ServingTable({
  rows,
  dataScope,
  focus,
  roofline,
  llmsim,
  gpuKey,
}: {
  rows: ServingRow[];
  dataScope: DataScope;
  focus?: ServingFocus;
  roofline?: RooflineLookup;
  llmsim?: LssLookup;
  gpuKey?: string;
}) {
  const [selectedPerTurnKey, setSelectedPerTurnKey] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<ServingMetric>(SERVING_TPOT_METRIC);
  const tableData = useMemo(() => {
    const concurrencies = Array.from(new Set(rows.map(r => r.concurrency ?? 1))).sort((a, b) => a - b);
    const matrixRows = buildServingMatrixRows(rows);
    const perTurnRows = rows.filter(hasTurnPredictions).sort(compareServingRows);
    const groupedByModel = groupServingRowsByModel(matrixRows);
    return { concurrencies, perTurnRows, groupedByModel };
  }, [rows]);
  const selectedPerTurnRow = useMemo(
    () => tableData.perTurnRows.find(row => servingRowKey(row) === selectedPerTurnKey) ?? tableData.perTurnRows[0],
    [selectedPerTurnKey, tableData.perTurnRows],
  );
  const selectedPerTurnRowKey = selectedPerTurnRow ? servingRowKey(selectedPerTurnRow) : null;

  if (rows.length === 0) {
    return (
      <div className="py-8 text-center">
        <div className="mb-2 text-sm text-[#676c76]">No {dataScope} predictions available yet</div>
        <div className="text-xs text-[#ffffff1f]">
          {focus
            ? `Expected ${focus.gpu} / ${focus.model} rows in predictions JSON`
            : (
              <>Run <code className="rounded bg-white/[0.06] px-1">python3 -m llm_predict.validate</code> to generate predictions</>
            )}
        </div>
      </div>
    );
  }

  const { concurrencies, groupedByModel } = tableData;

  return (
    <div className="space-y-5">
      <div className="glass grid overflow-hidden rounded-[22px] md:grid-cols-3 md:divide-x md:divide-white/10">
        {SERVING_METRICS.map(metric => (
          <ServingMetricSummary
            key={metric.label}
            metric={metric}
            rows={rows}
          />
        ))}
      </div>

      <div className="glass-shell rounded-[24px] p-1.5">
        <div className="overflow-x-auto rounded-[18px] bg-[#0b0d10]">
        <table
          className="w-full table-fixed border-collapse text-xs"
          style={{ minWidth: `${310 + concurrencies.length * 82 + SERVING_METRICS.length * 74}px` }}
        >
          <thead className="sticky top-0 z-10 bg-[#0b0d10]">
            <tr className="border-b border-[#ffffff1f] text-[#a9afba]">
              <th rowSpan={2} className="w-[210px] px-3 py-2.5 text-left font-medium">Profile</th>
              <th rowSpan={2} className="w-[72px] px-2 py-2.5 text-left font-medium">Backend</th>
              <th colSpan={concurrencies.length} className="px-1.5 py-1.5 text-left text-[10px] font-semibold uppercase tracking-widest text-[#676c76]">
                Concurrency
              </th>
              <th
                colSpan={SERVING_METRICS.length}
                className="serving-mape-rail serving-mape-rail-start sticky z-30 px-2 py-1.5 text-left"
                style={{ right: 0, width: `${SERVING_MAPE_RAIL_WIDTH}px` }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-[#a9afba]">Row MdAPE</span>
                  <span className="text-[9px] font-normal text-[#676c76]">median abs error</span>
                </div>
              </th>
            </tr>
            <tr className="border-b border-[#ffffff14] text-[#a9afba]">
              {concurrencies.map(concurrency => (
                <th key={concurrency} className="px-1.5 py-2 text-center font-mono font-normal">
                  {concurrency}
                </th>
              ))}
              {SERVING_METRICS.map((metric, metricIndex) => (
                <th
                  key={`mean-${metric.label}`}
                  className={`serving-mape-rail sticky z-20 w-[74px] px-1.5 py-2 text-center font-mono text-[10px] font-semibold ${
                    metricIndex === 0 ? 'serving-mape-rail-start' : 'border-l border-[#ffffff1f]'
                  }`}
                  style={{ right: `${(SERVING_METRICS.length - metricIndex - 1) * SERVING_MAPE_COLUMN_WIDTH}px` }}
                  title={`Median absolute ${metric.label} error across displayed concurrencies`}
                >
                  {metric.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(groupedByModel).map(([model, profileGroups]) => (
              <Fragment key={model}>
                <tr className="border-b-2 border-t-2 border-[#ffffff1f] bg-white/[0.03]">
                  <td colSpan={2 + concurrencies.length + SERVING_METRICS.length} className="px-3 py-1.5">
                    <span className="font-mono text-sm font-semibold text-[#a9afba]">{model}</span>
                    <span className="ml-2 text-[10px] text-[#676c76]">{profileGroups.length} profiles</span>
                  </td>
                </tr>
                {profileGroups.map(group => (
                  <Fragment key={group.key}>
                    {group.backendRows.map((row, backendIndex) => (
                      <tr key={row.key} className="group border-b border-[#ffffff14]/50 transition-colors hover:bg-white/[0.03]">
                        {backendIndex === 0 && (
                          <td rowSpan={group.backendRows.length} className="border-r border-[#ffffff14]/50 px-3 py-1.5 align-middle">
                            <div className="flex min-w-[190px] items-center gap-1.5">
                              <span className="truncate text-[11px] text-[#a9afba]" title={profileDisplayName(group.profile)}>
                                {profileDisplayName(group.profile)}
                              </span>
                            </div>
                          </td>
                        )}
                        <td className="px-2 py-1.5 align-middle">
                          {row.backend && (
                            <div className="flex flex-col gap-1">
                              <span className="text-[9px] uppercase text-[#676c76]">{row.backend}</span>
                              {matrixRowUsesBackendEmulator(row) && (
                                <span
                                  className="w-fit rounded border border-[#34c759]/30 bg-[#34c759]/10 px-1 py-0.5 font-mono text-[8px] uppercase leading-none text-[#34c759]"
                                  title={backendTooltipForMatrixRow(row)}
                                >
                                  emu
                                </span>
                              )}
                              {matrixRowUsesSteadyState(row) && (
                                <span
                                  className="w-fit rounded border border-[#2dd4bf]/30 bg-[#2dd4bf]/10 px-1 py-0.5 font-mono text-[8px] uppercase leading-none text-[#2dd4bf]"
                                  title={backendTooltipForMatrixRow(row)}
                                >
                                  steady
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        {concurrencies.map(concurrency => (
                          <ServingMatrixCell
                            key={concurrency}
                            row={row.cells[concurrency]}
                            selectedKey={selectedPerTurnRowKey}
                            onSelectPerTurn={setSelectedPerTurnKey}
                          />
                        ))}
                        {SERVING_METRICS.map((metric, metricIndex) => (
                          <ServingRowMeanCell
                            key={metric.label}
                            matrixRow={row}
                            metric={metric}
                            metricIndex={metricIndex}
                          />
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <ServingPerTurnBreakdown
        row={selectedPerTurnRow}
        rooflineRef={roofline && gpuKey ? rooflineRefFor(selectedPerTurnRow, gpuKey, roofline) : undefined}
        lssRef={llmsim && gpuKey ? lssRefFor(selectedPerTurnRow, gpuKey, llmsim) : undefined}
        selectedMetric={selectedMetric}
        onSelectMetric={setSelectedMetric}
      />

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#676c76]">
        <span>
          Cells show % error left-to-right: <span className="text-[#ff9f0a]">TTFT</span> / <span className="text-[#2dd4bf]">TPOT</span> / <span className="text-[#a855f7]">E2EL</span>.
        </span>
        <span className="font-medium text-[#a9afba]">Error bands:</span>
        <span className="rounded-full border border-[#34c759]/30 bg-[#34c759]/10 px-2 py-0.5 text-[#34c759]">&lt;10%</span>
        <span className="rounded-full border border-[#2dd4bf]/30 bg-[#2dd4bf]/10 px-2 py-0.5 text-[#2dd4bf]">10-25%</span>
        <span className="rounded-full border border-[#ff9f0a]/30 bg-[#ff9f0a]/10 px-2 py-0.5 text-[#ff9f0a]">25-50%</span>
        <span className="rounded-full border border-[#ff3b30]/30 bg-[#ff3b30]/10 px-2 py-0.5 text-[#ff3b30]">&gt;=50%</span>
        <span>Rightmost MdAPE columns are median absolute row errors across concurrency cells.</span>
      </div>
    </div>
  );
}

function buildServingMatrixRows(rows: ServingRow[]): ServingMatrixRow[] {
  const matrixByKey: Record<string, ServingMatrixRow> = {};
  for (const row of rows) {
    const key = `${row.model}|${row.backend ?? ''}|${row.profile}`;
    if (!matrixByKey[key]) {
      matrixByKey[key] = {
        key,
        model: row.model,
        backend: row.backend,
        profile: row.profile,
        cells: {},
      };
    }
    matrixByKey[key].cells[row.concurrency ?? 1] = row;
  }

  return Object.values(matrixByKey).sort((a, b) => {
    const modelOrder = a.model.localeCompare(b.model);
    if (modelOrder !== 0) return modelOrder;
    const profileOrder = servingProfileRank(a.profile) - servingProfileRank(b.profile);
    if (profileOrder !== 0) return profileOrder;
    const profileNameOrder = a.profile.localeCompare(b.profile);
    if (profileNameOrder !== 0) return profileNameOrder;
    return (a.backend ?? '').localeCompare(b.backend ?? '');
  });
}

function groupServingRowsByModel(matrixRows: ServingMatrixRow[]): Record<string, ServingProfileGroup[]> {
  const profileGroupsByModel: Record<string, Record<string, ServingProfileGroup>> = {};
  for (const row of matrixRows) {
    if (!profileGroupsByModel[row.model]) profileGroupsByModel[row.model] = {};
    const profileGroups = profileGroupsByModel[row.model];
    if (!profileGroups[row.profile]) {
      profileGroups[row.profile] = {
        key: `${row.model}|${row.profile}`,
        profile: row.profile,
        backendRows: [],
      };
    }
    profileGroups[row.profile].backendRows.push(row);
  }

  const groupedByModel: Record<string, ServingProfileGroup[]> = {};
  for (const [model, groups] of Object.entries(profileGroupsByModel)) {
    groupedByModel[model] = Object.values(groups)
      .map(group => ({
        ...group,
        backendRows: [...group.backendRows].sort((a, b) => (a.backend ?? '').localeCompare(b.backend ?? '')),
      }))
      .sort((a, b) => {
        const rankOrder = servingProfileRank(a.profile) - servingProfileRank(b.profile);
        if (rankOrder !== 0) return rankOrder;
        return a.profile.localeCompare(b.profile);
      });
  }
  return groupedByModel;
}

function servingProfileRank(profile: string): number {
  const index = SERVING_PROFILE_ORDER.indexOf(normalizeProfileName(profile));
  if (index >= 0) return index;
  if (profile.includes('multiturn')) return 1000;
  return 500;
}

function servingRowKey(row: ServingRow): string {
  return `${row.model}|${row.backend ?? ''}|${row.profile}|${row.concurrency ?? 1}`;
}

function compareServingRows(a: ServingRow, b: ServingRow): number {
  const modelOrder = a.model.localeCompare(b.model);
  if (modelOrder !== 0) return modelOrder;
  const profileOrder = servingProfileRank(a.profile) - servingProfileRank(b.profile);
  if (profileOrder !== 0) return profileOrder;
  const profileNameOrder = a.profile.localeCompare(b.profile);
  if (profileNameOrder !== 0) return profileNameOrder;
  const backendOrder = (a.backend ?? '').localeCompare(b.backend ?? '');
  if (backendOrder !== 0) return backendOrder;
  return (a.concurrency ?? 1) - (b.concurrency ?? 1);
}

function hasTurnPredictions(row: ServingRow): row is ServingPerTurnRow {
  return Array.isArray(row.multiturn_turn_predictions) && row.multiturn_turn_predictions.length > 0;
}

function ServingPerTurnChart({
  turns,
  metric,
  rooflineRef,
  lssRef,
  onSelectMetric,
}: {
  turns: ServingTurnPrediction[];
  metric: ServingMetric;
  rooflineRef?: RooflineRow;
  lssRef?: LssRow;
  onSelectMetric: (m: ServingMetric) => void;
}) {
  // The analytic roofline predictor is per-config (one value, no per-turn resolution), so it overlays
  // as a flat reference line — a second predictor series against the same measured GT trajectory.
  const rooflinePredRaw =
    metric.label === 'TTFT' ? rooflineRef?.fwd_ttft_pred
      : metric.label === 'TPOT' ? rooflineRef?.fwd_tpot_pred
        : rooflineRef?.fwd_e2el_pred;
  const rooflineFlat =
    typeof rooflinePredRaw === 'number' && Number.isFinite(rooflinePredRaw) ? rooflinePredRaw : null;
  const showRoofline = rooflineFlat !== null;
  // LLMServingSim 2.0 DOES predict per-turn (mean over sessions at each turn index), so it plots as a
  // real curve keyed by turn_index — not a flat line like the analytic roofline.
  const lssByTurn = useMemo(() => {
    const key = metric.label === 'TTFT' ? 'ttft_pred' : metric.label === 'TPOT' ? 'tpot_pred' : 'e2el_pred';
    const m = new Map<number, number>();
    for (const t of lssRef?.multiturn_turn_predictions ?? []) {
      const v = t[key];
      if (typeof v === 'number' && Number.isFinite(v)) m.set(t.turn_index, v);
    }
    return m;
  }, [lssRef, metric.label]);
  const showLss = lssByTurn.size > 0;
  // Build (turn_index, meas, pred) rows the chart can plot.  Nulls for
  // missing entries so Recharts breaks the line at gaps rather than
  // interpolating across them.
  const chartData = useMemo(
    () =>
      turns.map(turn => {
        const meas = turn[metric.measKey];
        const pred = turn[metric.predKey];
        // Kernel-composition: measured decode-kernel step + pressure-driven
        // amplifier to an output-amortized saturation ceiling. Workload-only,
        // no engine telemetry. See simulator/kernel_tpot.py.
        const kernel =
          metric.label === 'TPOT' ? turn.tpot_pred_kernel : undefined;
        // Kernel + classifier stepping-ramp soft hint. The standalone regime
        // classifier predicts WHEN saturation steps (KV-eviction crossing) and over
        // how many turns it ramps; this pulls the kernel up over that window (one-
        // sided, never lowers). Beats the headline kernel on every profile but is
        // shown as a comparison line. See simulator/_legacy/kernel_tpot_hint.py (retired 2026-06-10, L7).
        const kernelHint =
          metric.label === 'TPOT' ? turn.tpot_pred_kernel_hint : undefined;
        // Roofline 3D eviction-deficit ramp predictor (comparison line).
        // Forecasts the cohort drain from the profile survival curve and ramps the
        // saturation from the eviction-watermark crossing. See simulator/ramp_tpot.py.
        const rampPred =
          metric.label === 'TPOT' ? turn.tpot_pred_ramp : undefined;
        // Static-M0 prediction (comparison line for TTFT/E2EL). The headline pred line is
        // now the queue sim (metric.predKey = ttft_pred/e2el_pred); this static comparison
        // (prefill baseline × Little's-law amplifier) is the line the queue sim beat. TPOT
        // has no static variant. See simulator/ttft_predict.py.
        const staticPred =
          metric.label === 'TTFT'
            ? turn.ttft_pred_static
            : metric.label === 'E2EL'
              ? turn.e2el_pred_static
              : undefined;
        return {
          turn: displayTurn(turn),
          meas: typeof meas === 'number' && Number.isFinite(meas) ? meas : null,
          pred: typeof pred === 'number' && Number.isFinite(pred) ? pred : null,
          kernel:
            typeof kernel === 'number' && Number.isFinite(kernel)
              ? kernel
              : null,
          kernelHint:
            typeof kernelHint === 'number' && Number.isFinite(kernelHint)
              ? kernelHint
              : null,
          rampPred:
            typeof rampPred === 'number' && Number.isFinite(rampPred)
              ? rampPred
              : null,
          staticPred:
            typeof staticPred === 'number' && Number.isFinite(staticPred)
              ? staticPred
              : null,
          // Flat per-config roofline value repeated on every turn, so it renders as a line AND shows
          // up in the hover tooltip (a ReferenceLine would draw but not report a value on hover).
          roofline: rooflineFlat,
          // LLMServingSim's per-turn value at this turn index (a real curve, gaps left null).
          lss: lssByTurn.get(turn.turn_index) ?? null,
        };
      }),
    [turns, metric.measKey, metric.predKey, metric.label, rooflineFlat, lssByTurn],
  );
  const showKernel =
    metric.label === 'TPOT' && chartData.some(d => d.kernel !== null);
  const showKernelHint =
    metric.label === 'TPOT' && chartData.some(d => d.kernelHint !== null);
  const showRamp =
    metric.label === 'TPOT' && chartData.some(d => d.rampPred !== null);
  const showStatic =
    metric.label !== 'TPOT' && chartData.some(d => d.staticPred !== null);
  // Which plotted line the prediction TABLE + MAPE badge actually use. The table reads <metric>_err,
  // and for TPOT that error is repointed to the kernel composition: it is the 'kernel' line on H100
  // (where tpot_pred is the roofline) but plain tpot_pred on tp2 (no separate kernel line) — i.e. the
  // kernel-composed line either way. TTFT/E2EL err is always against the headline 'pred' (queue sim).
  const tableKey = metric.label === 'TPOT' ? (showKernel ? 'kernel' : 'pred') : 'pred';
  if (chartData.length === 0) return null;
  return (
    <div className="border-b border-white/10 px-5 py-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="text-[11px] font-medium uppercase tracking-widest text-[#676c76]">Per-Turn</div>
        <div className="seg-track">
          {SERVING_METRICS.map(m => {
            const selected = m.label === metric.label;
            return (
              <button
                key={m.label}
                type="button"
                onClick={() => onSelectMetric(m)}
                className={`seg-item px-2.5 py-1 text-[10px] font-mono uppercase ${
                  selected ? 'seg-item-active' : 'text-[#a9afba] hover:text-[#f3f4f6]'
                }`}
                style={selected ? { color: m.color } : undefined}
              >
                {m.label}
              </button>
            );
          })}
        </div>
        <span className="text-[10px] text-[#676c76]">{metric.description} · actual vs predicted (ms)</span>
      </div>
      <div className="h-56 w-full rounded-2xl border border-[#ffffff0f] bg-[#0b0d10] p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#ffffff14" strokeDasharray="3 3" />
            <XAxis
              dataKey="turn"
              tick={{ fill: '#a9afba', fontSize: 11 }}
              stroke="#ffffff1f"
              label={{ value: 'turn', position: 'insideBottomRight', offset: -2, fill: '#676c76', fontSize: 10 }}
            />
            <YAxis
              tick={{ fill: '#a9afba', fontSize: 11 }}
              stroke="#ffffff1f"
              width={48}
              label={{ value: 'ms', angle: -90, position: 'insideLeft', offset: 12, fill: '#676c76', fontSize: 10 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0b0d10',
                border: '1px solid #ffffff1f',
                fontSize: 11,
              }}
              labelStyle={{ color: '#a9afba' }}
              formatter={(value) =>
                typeof value === 'number' ? `${value.toFixed(2)} ms` : '—'
              }
              labelFormatter={(turn) => `Turn ${turn}`}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, color: '#a9afba' }}
              content={() => (
                <div className="mt-1">
                  <div className="flex flex-wrap justify-center gap-4">
                  <span className="flex items-center gap-2">
                    <svg width="26" height="8" aria-hidden>
                      <line x1="0" y1="4" x2="26" y2="4" stroke="#a9afba" strokeWidth="2" strokeDasharray="6 3" />
                    </svg>
                    <span className="text-[11px] text-[#a9afba]">{metric.label} actual</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <svg width="26" height="8" aria-hidden>
                      <line x1="0" y1="4" x2="26" y2="4" stroke={metric.color} strokeWidth={tableKey === 'pred' ? 3.5 : 2} />
                    </svg>
                    <span className="text-[11px] text-[#a9afba]">
                      {(metric.label === 'TPOT'
                        ? `${metric.label} predicted`
                        : `${metric.label} predicted (queue sim)`)
                        + (tableKey === 'pred' ? ' ★ table' : '')}
                    </span>
                  </span>
                  {showKernel && (
                    <span className="flex items-center gap-2">
                      <svg width="26" height="8" aria-hidden>
                        <line x1="0" y1="4" x2="26" y2="4" stroke="#facc15" strokeWidth={tableKey === 'kernel' ? 3.5 : 2} />
                      </svg>
                      <span className="text-[11px] text-[#a9afba]">{`${metric.label} predicted (kernel)` + (tableKey === 'kernel' ? ' ★ table' : '')}</span>
                    </span>
                  )}
                  {showKernelHint && (
                    <span className="flex items-center gap-2">
                      <svg width="26" height="8" aria-hidden>
                        <line x1="0" y1="4" x2="26" y2="4" stroke="#fb7185" strokeWidth="2" />
                      </svg>
                      <span className="text-[11px] text-[#a9afba]">{metric.label} predicted (kernel+hint)</span>
                    </span>
                  )}
                  {showRamp && (
                    <span className="flex items-center gap-2">
                      <svg width="26" height="8" aria-hidden>
                        <line x1="0" y1="4" x2="26" y2="4" stroke="#2dd4bf" strokeWidth="2" />
                      </svg>
                      <span className="text-[11px] text-[#a9afba]">{metric.label} predicted (roofline-ramp)</span>
                    </span>
                  )}
                  {showStatic && (
                    <span className="flex items-center gap-2">
                      <svg width="26" height="8" aria-hidden>
                        <line x1="0" y1="4" x2="26" y2="4" stroke="#34c759" strokeWidth="2" />
                      </svg>
                      <span className="text-[11px] text-[#a9afba]">{metric.label} predicted (static M0)</span>
                    </span>
                  )}
                  {showRoofline && (
                    <span className="flex items-center gap-2">
                      <svg width="26" height="8" aria-hidden>
                        <line x1="0" y1="4" x2="26" y2="4" stroke={RFL_COLOR} strokeWidth="2" strokeDasharray="2 3" />
                      </svg>
                      <span className="text-[11px] text-[#a9afba]">{metric.label} roofline (analytic, per-config)</span>
                    </span>
                  )}
                  {showLss && (
                    <span className="flex items-center gap-2">
                      <svg width="26" height="8" aria-hidden>
                        <line x1="0" y1="4" x2="26" y2="4" stroke={LSS_COLOR} strokeWidth="2" />
                      </svg>
                      <span className="text-[11px] text-[#a9afba]">{metric.label} LLMServingSim 2.0 (per-turn)</span>
                    </span>
                  )}
                  </div>
                  <div className="mt-1 text-center text-[10px] text-[#676c76]">
                    ★ = the line the prediction table &amp; MdAPE badge use · other predicted lines are comparison-only
                  </div>
                </div>
              )}
            />
            <Line
              type="monotone"
              dataKey="meas"
              name={`${metric.label} actual`}
              stroke="#a9afba"
              strokeDasharray="6 3"
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="pred"
              name={
                (metric.label === 'TPOT'
                  ? `${metric.label} predicted (roofline)`
                  : `${metric.label} predicted (queue sim)`)
                + (tableKey === 'pred' ? ' ★ table' : '')
              }
              stroke={metric.color}
              strokeWidth={tableKey === 'pred' ? 3.5 : 2}
              dot={{ r: 2 }}
              activeDot={tableKey === 'pred' ? { r: 5 } : undefined}
              connectNulls={false}
              isAnimationActive={false}
            />
            {showKernel && (
              <Line
                type="monotone"
                dataKey="kernel"
                name={`${metric.label} predicted (kernel)` + (tableKey === 'kernel' ? ' ★ table' : '')}
                stroke="#facc15"
                strokeWidth={tableKey === 'kernel' ? 3.5 : 2}
                dot={{ r: 2 }}
                activeDot={tableKey === 'kernel' ? { r: 5 } : undefined}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
            {showKernelHint && (
              <Line
                type="monotone"
                dataKey="kernelHint"
                name={`${metric.label} predicted (kernel+hint)`}
                stroke="#fb7185"
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
            {showRamp && (
              <Line
                type="monotone"
                dataKey="rampPred"
                name={`${metric.label} predicted (roofline-ramp)`}
                stroke="#2dd4bf"
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
            {showStatic && (
              <Line
                type="monotone"
                dataKey="staticPred"
                name={`${metric.label} predicted (static M0)`}
                stroke="#34c759"
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
            {showRoofline && (
              <Line
                type="monotone"
                dataKey="roofline"
                name={`${metric.label} roofline (analytic)`}
                stroke={RFL_COLOR}
                strokeDasharray="2 3"
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls
                isAnimationActive={false}
              />
            )}
            {showLss && (
              <Line
                type="monotone"
                dataKey="lss"
                name={`${metric.label} LLMServingSim 2.0`}
                stroke={LSS_COLOR}
                strokeWidth={2}
                dot={{ r: 2 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ServingPerTurnBreakdown({
  row,
  rooflineRef,
  lssRef,
  selectedMetric,
  onSelectMetric,
}: {
  row?: ServingPerTurnRow;
  rooflineRef?: RooflineRow;
  lssRef?: LssRow;
  selectedMetric: ServingMetric;
  onSelectMetric: (m: ServingMetric) => void;
}) {
  const turns = useMemo(
    () => row ? [...row.multiturn_turn_predictions].sort((a, b) => a.turn_index - b.turn_index) : [],
    [row],
  );
  const meanHit = turns.length
    ? turns.reduce((total, turn) => total + turn.cache_hit_rate, 0) / turns.length
    : 0;
  if (!row) return null;

  // Per-metric signed-err / MAE headers. Prefer the explicit cell-level field
  // (tpot/ttft/e2el_signed_err_ms, *_abs_err_ms) the augmenter now writes; fall
  // back to the per-turn average (turnSignedErrorMs is exact now too).
  const metricErrSummaries = SERVING_METRICS.map(metric => {
    const cellSigned = numericMetric(row, metric.signedKey);
    const cellAbs = numericMetric(row, metric.absKey);
    const signedErr = cellSigned ?? (
      turns.length
        ? turns.reduce((total, turn) => total + (turnSignedErrorMs(turn, metric) ?? 0), 0) / turns.length
        : undefined
    );
    const absErr = cellAbs ?? (
      turns.length
        ? turns.reduce((total, turn) => total + Math.abs(turnSignedErrorMs(turn, metric) ?? 0), 0) / turns.length
        : undefined
    );
    return { metric, signedErr, absErr };
  });

  return (
    <div className="glass rounded-[22px]">
      <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-[#f3f4f6]">Per-Turn Multi-Turn Prediction</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[#676c76]">
            <span className="font-mono text-[#a9afba]">{row.model}</span>
            <span>{row.backend ?? 'backend'}</span>
            {row.backend_emulator_status === 'event_loop_enabled' && (
              <>
                <span>backend steps {formatTokenCount(row.backend_trace_summary?.total_steps)}</span>
                <span>max decode {formatTokenCount(row.backend_trace_summary?.max_decode_batch)}</span>
                <span>replay {formatTokenCount(row.backend_trace_summary?.replayed_cached_tokens)}</span>
              </>
            )}
            <span>{profileDisplayName(row.profile)}</span>
            <span>c{row.concurrency ?? 1}</span>
            <span>{turns.length} turns</span>
            <span>{row.total_successful_turn_requests ?? 0} successful turn requests</span>
            <span>mean cache hit {(meanHit * 100).toFixed(0)}%</span>
            <span>mean TTFT {formatLatency(row.mean_predicted_turn_ttft_ms)}</span>
            <span>mean TPOT {formatLatency(row.mean_predicted_turn_tpot_ms)}</span>
            {metricErrSummaries.map(({ metric, signedErr, absErr }) => (
              <Fragment key={metric.label}>
                <span>{metric.label} signed err {formatSignedLatency(signedErr)}</span>
                <span>{metric.label} MAE {formatLatency(absErr)}</span>
              </Fragment>
            ))}
          </div>
        </div>
        <div className="rounded-full border border-[#ffffff1f] bg-white/[0.03] px-2.5 py-1 font-mono text-[10px] text-[#2dd4bf]">
          selected from predictions table
        </div>
      </div>

      <ServingPerTurnChart
        turns={turns}
        metric={selectedMetric}
        rooflineRef={rooflineRef}
        lssRef={lssRef}
        onSelectMetric={onSelectMetric}
      />

      <div className="overflow-x-auto border-b border-white/10 bg-white/[0.04]">
        <div className="flex min-w-max gap-2 p-3">
          {turns.map(turn => (
            <div key={turn.turn_index} className="w-[122px] shrink-0 rounded-xl border border-[#ffffff14] bg-white/[0.03] p-2.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[11px] font-semibold text-[#a9afba]">Turn {displayTurn(turn)}</span>
                <span className="text-[10px] text-[#676c76]">{turn.successful} req</span>
              </div>
              <ServingTurnCacheBar turn={turn} compact />
              <div className="mt-2 space-y-1">
                {SERVING_METRICS.map(metric => (
                  <ServingTurnErrorBadge key={metric.label} turn={turn} metric={metric} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-b-[22px] bg-[#0b0d10]">
        <table className="w-full min-w-[1240px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#ffffff14] text-[#a9afba]">
              <th className="px-3 py-2 text-left font-medium">Turn</th>
              <th className="px-2 py-2 text-left font-medium">Regime</th>
              <th className="px-2 py-2 text-right font-medium">Req</th>
              <th className="px-2 py-2 text-right font-medium">Ctx</th>
              <th className="px-2 py-2 text-right font-medium">New</th>
              <th className="px-2 py-2 text-right font-medium">Cached</th>
              <th className="w-[150px] px-2 py-2 text-left font-medium">Hit</th>
              <th className="px-2 py-2 text-right font-medium">Out</th>
              <th className="px-2 py-2 text-right font-medium">Steps/Waves</th>
              <th className="px-2 py-2 text-right font-medium">Replay</th>
              {SERVING_METRICS.map(metric => (
                <th key={metric.label} className="w-[170px] px-2 py-2 text-left font-medium" style={{ color: metric.color }}>
                  {metric.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {turns.map(turn => (
              <tr key={turn.turn_index} className="border-b border-[#ffffff14]/50 hover:bg-white/[0.03]">
                <td className="px-3 py-2 font-mono text-[#a9afba]">{displayTurn(turn)}</td>
                <td className="px-2 py-2 text-[10px] text-[#a9afba]" title={turn.scheduling_regime ?? turn.workload_regime ?? turn.turn_batching_regime}>
                  <div>{compactRegime(turn.turn_position_bin)}</div>
                  <div className="font-mono text-[#676c76]">{compactRegime(turn.scheduling_regime ?? turn.decode_load_regime)}</div>
                </td>
                <td className="px-2 py-2 text-right font-mono text-[#a9afba]">{formatTokenCount(turn.successful)}</td>
                <td className="px-2 py-2 text-right font-mono text-[#a9afba]">{formatTokenCount(turn.total_context_tokens)}</td>
                <td className="px-2 py-2 text-right font-mono text-[#a9afba]">{formatTokenCount(turn.new_prefill_tokens)}</td>
                <td className="px-2 py-2 text-right font-mono text-[#a9afba]">{formatTokenCount(turn.cached_context_tokens)}</td>
                <td className="px-2 py-2"><ServingTurnCacheBar turn={turn} /></td>
                <td className="px-2 py-2 text-right font-mono text-[#a9afba]">{formatTokenCount(turn.output_tokens)}</td>
                <td className="px-2 py-2 text-right font-mono text-[#a9afba]">{formatTokenCount(turn.decode_waves ?? turn.backend_trace_summary?.total_steps)}</td>
                <td className="px-2 py-2 text-right font-mono text-[#a9afba]">{formatTokenCount(turn.backend_cache_work?.replayed_cached_tokens)}</td>
                {SERVING_METRICS.map(metric => (
                  <ServingTurnMetricCell key={metric.label} turn={turn} metric={metric} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ServingMetricSummary({
  metric,
  rows,
}: {
  metric: ServingMetric;
  rows: ServingRow[];
}) {
  // Aggregate absolute errors for the MdAPE view (median, matching the badges/matrix).
  const values = rows
    .map(row => numericMetric(row, metric.errKey))
    .filter((value): value is number => value !== undefined)
    .map(value => Math.abs(value));
  const headline = values.length ? median(values) : undefined;
  const best = values.length ? Math.min(...values) : undefined;
  const worst = values.length ? Math.max(...values) : undefined;
  const displayedRowCount = values.length;
  const fmt = (value: OptionalMetric) => formatPercent(value);

  return (
    <div className="border-b border-white/10 px-5 py-4 last:border-b-0 md:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: metric.color }}>{metric.label}</div>
          <div className="mt-0.5 text-[11px] text-[#676c76]">{metric.description}</div>
        </div>
        <div className="text-right">
          <div className="text-[28px] font-semibold leading-none tracking-tight tabular-nums text-[#f3f4f6]">{fmt(headline)}</div>
          <div className="mt-1 text-[10px] text-[#676c76]">MdAPE</div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5 text-[10px] text-[#676c76]">
        <span>{displayedRowCount} rows</span>
        <span>best {fmt(best)} / worst {fmt(worst)}</span>
      </div>
    </div>
  );
}

function ServingTurnCacheBar({ turn, compact = false }: { turn: ServingTurnPrediction; compact?: boolean }) {
  const pct = Math.max(0, Math.min(100, turn.cache_hit_rate * 100));
  return (
    <div className={compact ? 'space-y-1' : 'flex items-center gap-2'}>
      <span className={compact ? 'block text-[9px] uppercase text-[#676c76]' : 'w-8 text-[10px] uppercase text-[#676c76]'}>Hit</span>
      <div className="relative h-4 flex-1 overflow-hidden rounded bg-white/[0.06]">
        <div className="h-full rounded bg-[#2dd4bf]/70" style={{ width: `${pct}%` }} />
        <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] text-[#f3f4f6]">
          {pct.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

function ServingTurnErrorBadge({ turn, metric }: { turn: ServingTurnPrediction; metric: ServingMetric }) {
  const err = numericTurnMetric(turn, metric.errKey);
  const signedMs = turnSignedErrorMs(turn, metric);
  const tone = servingErrorTone(err);
  return (
    <div className="grid grid-cols-[34px_1fr] items-center gap-1">
      <span className="text-[9px] font-semibold uppercase" style={{ color: metric.color }}>{metric.label}</span>
      <span className={`rounded px-1.5 py-0.5 text-right font-mono text-[10px] leading-none ${tone.className}`}>
        {formatCompactPercent(err)}
        {signedMs !== undefined && (
          <span className="ml-1 text-[#a9afba]">{formatSignedLatency(signedMs)}</span>
        )}
      </span>
    </div>
  );
}

function ServingTurnMetricCell({ turn, metric }: { turn: ServingTurnPrediction; metric: ServingMetric }) {
  const pred = numericTurnMetric(turn, metric.predKey);
  const meas = numericTurnMetric(turn, metric.measKey);
  const err = numericTurnMetric(turn, metric.errKey);
  const signedMs = turnSignedErrorMs(turn, metric);
  const tone = servingErrorTone(err);
  return (
    <td className="px-2 py-2 align-top">
      <div className="space-y-1">
        <MetricLine label="Pred" value={formatLatency(pred, metric.isTotal)} />
        <MetricLine label="Actual" value={formatLatency(meas, metric.isTotal)} />
        <MetricLine label="Signed" value={formatSignedLatency(signedMs)} />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-[#676c76]">Err</span>
          <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${tone.className}`}>
            {formatPercent(err)}
          </span>
        </div>
      </div>
    </td>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] text-[#676c76]">{label}</span>
      <span className="font-mono text-[10px] text-[#a9afba]">{value}</span>
    </div>
  );
}

function ServingMatrixCell({
  row,
  selectedKey,
  onSelectPerTurn,
}: {
  row?: ServingRow;
  selectedKey: string | null;
  onSelectPerTurn: (key: string) => void;
}) {
  if (!row) {
    return (
      <td className="border-l border-[#ffffff14]/50 px-1.5 py-1 text-center">
        <span className="text-[#ffffff1f]">.</span>
      </td>
    );
  }
  const canSelect = hasTurnPredictions(row);
  const rowKey = servingRowKey(row);
  const selected = canSelect && rowKey === selectedKey;
  return (
    <td
      onClick={canSelect ? () => onSelectPerTurn(rowKey) : undefined}
      className={`border-l border-[#ffffff14]/50 px-1 py-0.5 align-middle transition-colors ${
        canSelect ? 'cursor-pointer hover:bg-[#2dd4bf]/10' : ''
      } ${selected ? 'bg-[#2dd4bf]/10 shadow-[inset_0_0_0_1px_#2dd4bf]' : ''}`}
      title={canSelect ? `Show ${row.multiturn_turn_predictions.length} per-turn predictions — pick the metric with the toggle above the chart` : undefined}
    >
      <div className="min-w-0 space-y-0.5" title={`ISL->OSL ${row.isl}->${row.osl}`}>
        <div className="grid min-w-0 grid-cols-3 gap-0.5">
          {SERVING_METRICS.map(metric => (
            <ServingMiniMetric key={metric.label} row={row} metric={metric} />
          ))}
        </div>
      </div>
    </td>
  );
}

function ServingRowMeanCell({
  matrixRow,
  metric,
  metricIndex,
}: {
  matrixRow: ServingMatrixRow;
  metric: ServingMetric;
  metricIndex: number;
}) {
  const value = medianMatrixRowMetricError(matrixRow, metric.errKey);
  const tone = toneFor(value);
  const rows = Object.values(matrixRow.cells).length;

  return (
    <td
      className={`serving-mape-rail sticky z-10 px-1 py-0.5 align-middle ${
        metricIndex === 0 ? 'serving-mape-rail-start' : 'border-l border-[#ffffff1f]'
      }`}
      style={{ right: `${(SERVING_METRICS.length - metricIndex - 1) * SERVING_MAPE_COLUMN_WIDTH}px` }}
      title={`${matrixRow.profile} ${matrixRow.backend ?? ''}: mean absolute ${metric.label} error across ${rows} concurrency cells`}
    >
      <span className={`block rounded px-1 py-0.5 text-center font-mono text-[10px] leading-none ${tone.className}`}>
        {compactValueFor(value)}
      </span>
    </td>
  );
}

function medianMatrixRowMetricError(matrixRow: ServingMatrixRow, errKey: ServingMetricKey): number | undefined {
  const values = Object.values(matrixRow.cells)
    .map(row => numericMetric(row, errKey))
    .filter((value): value is number => value !== undefined)
    .map(value => Math.abs(value));
  return values.length ? median(values) : undefined;  // MdAPE (median), matching the cells/badges
}

function representativeMatrixRowCell(matrixRow: ServingMatrixRow): ServingRow | undefined {
  return Object.values(matrixRow.cells)[0];
}

function matrixRowUsesBackendEmulator(matrixRow: ServingMatrixRow): boolean {
  return Object.values(matrixRow.cells).some(row => row.backend_emulator_status === 'event_loop_enabled');
}

function matrixRowUsesSteadyState(matrixRow: ServingMatrixRow): boolean {
  return Object.values(matrixRow.cells).some(row => isSteadyStateRow(row));
}

function isSteadyStateRow(row: ServingRow): boolean {
  return row.continuous_batching_mode?.includes('steady_state') ?? false;
}

function backendTooltipForMatrixRow(matrixRow: ServingMatrixRow): string {
  const row = representativeMatrixRowCell(matrixRow);
  return row ? backendTooltip(row) : 'legacy scheduler';
}

function ServingMiniMetric({ row, metric }: { row: ServingRow; metric: ServingMetric }) {
  const pred = numericMetric(row, metric.predKey);
  const meas = numericMetric(row, metric.measKey);
  const err = numericMetric(row, metric.errKey);
  const signedMs = rowSignedErrorMs(row, metric);
  const tone = toneFor(err);
  const title = [
    `${metric.label}: ${formatPercent(err)} error`,
    `signed ${formatSignedLatency(signedMs)}`,
    `pred ${formatLatency(pred, metric.isTotal)}`,
    `meas ${formatLatency(meas, metric.isTotal)}`,
    `ISL->OSL ${row.isl}->${row.osl}`,
    cacheTooltip(row),
    backendTooltip(row),
    measurementTooltip(row),
  ].join(' | ');

  return (
    <span
      title={title}
      className={`block rounded px-1 py-0.5 text-center font-mono text-[9px] leading-none ${tone.className}`}
    >
      {compactValueFor(err)}
    </span>
  );
}

function cacheTooltip(row: ServingRow): string {
  if (row.cache_prediction_regime === 'unknown_prefix_cache') {
    return `prefix cache features missing${row.unsupported_reason ? `; ${row.unsupported_reason}` : ''}`;
  }
  if (!row.cache_aware_applied) return 'full prefill';
  const hit = row.cache_hit_rate === undefined ? 'n/a' : `${(row.cache_hit_rate * 100).toFixed(0)}%`;
  const total = row.total_context_tokens ?? row.isl;
  const fresh = row.new_prefill_tokens ?? total;
  const cached = row.cached_context_tokens ?? Math.max(0, total - fresh);
  const source = row.cache_feature_source ? `; source ${row.cache_feature_source}` : '';
  const multiturn = row.multiturn_prediction_mode
    ? `; ${row.multiturn_prediction_mode} ${row.predicted_turn_count ?? 0} turns`
    : '';
  return `cache hit ${hit}; new/full ${fresh}/${total}; cached ${cached}${source}${multiturn}`;
}

function backendTooltip(row: ServingRow): string {
  if (row.backend_emulator_status !== 'event_loop_enabled') return 'legacy scheduler';
  const summary = row.backend_trace_summary;
  const spec = row.backend_spec;
  const batching = row.continuous_batching_mode
    ? `; batching ${row.continuous_batching_mode}`
    : '';
  const scheduled = row.scheduled_request_count
    ? `; scheduled ${formatTokenCount(row.scheduled_request_count)}`
    : '';
  const sourceSummary = row.kernel_source_summary
    ? `; kernels ${formatKernelSourceSummary(row.kernel_source_summary)}`
    : '';
  return [
    `backend emulator ${spec?.name ?? row.backend ?? 'selected'}`,
    `policy ${spec?.prefill_policy ?? 'n/a'}`,
    `cache ${spec?.cache_mode ?? 'n/a'}`,
    `steps ${formatTokenCount(summary?.total_steps)}`,
    `max decode ${formatTokenCount(summary?.max_decode_batch)}`,
    `cache replay ${formatTokenCount(summary?.replayed_cached_tokens)}`,
  ].join('; ') + batching + scheduled + sourceSummary;
}

function formatKernelSourceSummary(summary: Record<string, number>): string {
  return Object.entries(summary)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${key}=${count}`)
    .join(', ');
}

function measurementTooltip(row: ServingRow): string {
  if (row.measurement_semantics_warning === 'measured_e2el_lt_ttft') {
    return 'measurement warning: measured E2EL is below measured TTFT';
  }
  return 'measurement semantics ok';
}

function numericMetric(row: ServingRow, key: ServingMetricKey): number | undefined {
  const value = row[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function numericTurnMetric(turn: ServingTurnPrediction, key: ServingMetricKey): number | undefined {
  const value = turn[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function rowSignedErrorMs(row: ServingRow, metric: ServingMetric): number | undefined {
  // Prefer the explicit metric-keyed signed field (tpot/ttft/e2el_signed_err_ms)
  // now that the augmenter writes it for every metric; fall back to (pred - meas).
  const explicit = numericMetric(row, metric.signedKey);
  if (explicit !== undefined) return explicit;
  const pred = numericMetric(row, metric.predKey);
  const meas = numericMetric(row, metric.measKey);
  return pred !== undefined && meas !== undefined ? pred - meas : undefined;
}

function turnSignedErrorMs(turn: ServingTurnPrediction, metric: ServingMetric): number | undefined {
  // Prefer the explicit per-turn signed field; fall back to (pred - meas).
  const explicit = numericTurnMetric(turn, metric.signedKey);
  if (explicit !== undefined) return explicit;
  const pred = numericTurnMetric(turn, metric.predKey);
  const meas = numericTurnMetric(turn, metric.measKey);
  return pred !== undefined && meas !== undefined ? pred - meas : undefined;
}

function servingErrorTone(err: OptionalMetric): { className: string } {
  if (err === undefined || err === null) return { className: 'border border-[#ffffff1f] bg-white/[0.06] text-[#676c76]' };
  const value = Math.abs(err);
  if (value < 10) return { className: 'border border-[#34c759]/30 bg-[#34c759]/10 text-[#34c759]' };
  if (value < 25) return { className: 'border border-[#2dd4bf]/30 bg-[#2dd4bf]/10 text-[#2dd4bf]' };
  if (value < 50) return { className: 'border border-[#ff9f0a]/30 bg-[#ff9f0a]/10 text-[#ff9f0a]' };
  return { className: 'border border-[#ff3b30]/30 bg-[#ff3b30]/10 text-[#ff3b30]' };
}

function formatLatency(value: number | undefined, isTotal?: boolean): string {
  if (value === undefined) return 'n/a';
  return `${isTotal ? value.toFixed(0) : value.toFixed(1)} ms`;
}

function formatSignedLatency(value: number | undefined): string {
  if (value === undefined) return 'n/a';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)} ms`;
}

function formatPercent(value: OptionalMetric): string {
  if (value === undefined || value === null) return 'N/A';
  return `${value.toFixed(1)}%`;
}

function formatCompactPercent(value: OptionalMetric): string {
  if (value === undefined || value === null) return 'N/A';
  return `${value.toFixed(0)}%`;
}

function formatTokenCount(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '-';
  return Math.round(value).toLocaleString();
}

function compactRegime(value: string | undefined): string {
  if (!value) return '-';
  return value
    .replace('startup_0_4', 'startup')
    .replace('ramp_5_9', 'ramp')
    .replace('steady_10_19', 'steady')
    .replace('tail_20_plus', 'tail')
    .replace('queued_saturated_decode', 'queued sat')
    .replace('saturated_decode', 'sat decode')
    .replace('high_decode', 'high decode')
    .replace('medium_decode', 'med decode')
    .replace('low_decode', 'low decode')
    .split('_').join(' ');
}

function formatConcurrencyRange(values: number[]): string {
  if (!values.length) return '-';
  if (values.length === 1) return `c${values[0]}`;
  return `c${values[0]}-c${values[values.length - 1]} (${values.length})`;
}

function displayTurn(turn: ServingTurnPrediction): number {
  return turn.turn_index + 1;
}

// The serving badges report MdAPE = median APE (not MAPE = mean): the per-cell APE has
// a heavy tail on herd/queue-collapse cells, so the mean is outlier-fragile.
function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
