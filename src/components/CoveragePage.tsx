import { useMemo, useState } from 'react';
import { useCoverageBlockers } from '../hooks/useCoverageBlockers';
import { coverageBlockersMoeEpJsonUrl } from '../dataUrls';
import type { BenchmarkResult } from '../types';
import type { CoverageBlocker, CoverageBlockersState, CoverageEvidence, CoverageFailure, CoveragePoint } from '../types-coverage-blockers';
import type { SweepCell, SweepState } from '../types-sweep';
import { DATA_SCOPE_META, normalizeDataScope, profileDisplayName, type DataScope } from '../profileMeta';


interface CoveragePageProps {
  allData: BenchmarkResult[];
  sweepState: SweepState | null;
  loading: boolean;
  dataScope: DataScope;
}

const CURRENT_SINGLE_CONCS = [1, 10, 20, 40, 80, 160, 256, 320];
const CURRENT_MULTI_CONCS = [5, 20, 40, 80, 160];
const FIXED_SINGLE_CONCS = [200, 320];
const FIXED_MULTI_CONCS = [200, 320];
const MSE_SINGLE_CONCS: number[] = [];
const MSE_MULTI_CONCS = [40, 80];
const ARCHIVE_SINGLE_CONCS = [1, 10, 20, 40, 80, 120, 160, 200, 256, 320, 500];
const ARCHIVE_MULTI_CONCS = [5, 10, 20, 40, 80, 120, 160, 200, 256, 320];

const CURRENT_SINGLE_PROFILES = [
  'chat-singleturn',
  'coding-singleturn',
];
const CURRENT_MULTI_PROFILES = [
  'chat-multiturn',
  'swebench-multiturn',
  'terminalbench-multiturn',
  'osworld-multiturn',
];
const FIXED_SINGLE_PROFILES = [
  'chat-singleturn',
];
const FIXED_MULTI_PROFILES = [
  'chat-multiturn',
  'swebench-multiturn',
  'terminalbench-multiturn',
  'osworld-multiturn',
];
const MSE_SINGLE_PROFILES: string[] = [];
const MSE_MULTI_PROFILES = [
  'swebench-multiturn-mse',
  'swebench-multiturn-short',
  'terminalbench-multiturn-mse',
  'terminalbench-multiturn-short',
  'osworld-multiturn-mse',
  'osworld-multiturn-short',
];
const ARCHIVE_SINGLE_PROFILES = [
  'chat-short', 'chat-medium', 'chat-singleturn',
  'coding-singleturn', 'prefill-heavy', 'decode-heavy', 'random-1k', 'fixed-seq128',
];
const ARCHIVE_MULTI_PROFILES = [
  'chat-multiturn-short', 'chat-multiturn-medium', 'chat-multiturn-long',
  'swebench-multiturn-short', 'swebench-multiturn-medium', 'swebench-multiturn-long',
  'terminalbench-multiturn-short', 'terminalbench-multiturn-medium', 'terminalbench-multiturn-long',
  'osworld-multiturn-short', 'osworld-multiturn-medium', 'osworld-multiturn-long',
];

const TP_OPTIONS = [1, 2, 4];

// Backends we always want a coverage row for. sglang is active now that
// the orchestrator routes by backend and all three hosts have sglang 0.5.9
// environments. Each (hw, model) gets a row for every active backend, plus
// any historical backend with data in data.json.
const ACTIVE_BACKENDS = ['vllm', 'sglang'];
const KNOWN_BACKENDS = ['vllm', 'sglang'];

type ModelFamily = 'Llama' | 'Qwen' | 'GPT-OSS' | 'Mixtral' | 'Gemma' | 'Granite' | 'Other';

const FAMILY_ORDER: ModelFamily[] = ['Llama', 'Qwen', 'GPT-OSS', 'Mixtral', 'Gemma', 'Granite', 'Other'];

function modelFamily(model: string): ModelFamily {
  const normalized = model.toLowerCase();
  if (normalized.startsWith('llama')) return 'Llama';
  if (normalized.startsWith('qwen')) return 'Qwen';
  if (normalized.startsWith('gpt-oss')) return 'GPT-OSS';
  if (normalized.startsWith('mixtral')) return 'Mixtral';
  if (normalized.startsWith('gemma')) return 'Gemma';
  if (normalized.startsWith('granite')) return 'Granite';
  return 'Other';
}

function compareModels(a: string, b: string): number {
  const familyDelta = FAMILY_ORDER.indexOf(modelFamily(a)) - FAMILY_ORDER.indexOf(modelFamily(b));
  if (familyDelta !== 0) return familyDelta;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

// Full per-cell failure record, bundled from the blocker's missing_points[] and
// the blocker-level failure metadata. Carries the finer failure_class so cells
// can be colored by CLASS (red/yellow) rather than the coarse disposition.
interface CellDetail {
  failClass?: string;
  disposition?: 'failed' | 'na' | 'todo' | null;
  label?: string;
  reason?: string;
  explanation?: string;
  evidence?: CoverageEvidence | null;
  attempt?: number | null;
  maxAttempts?: number | null;
  remoteLog?: string | null;
}

// Machine-readable infeasibility class from sweep-state (known_oom /
// profile_infeasible `kind`, plus VRAM skips which are always hardware):
//   'hw_permanent' → blue "hardware can't"; 'sw_fixable' → yellow "fixable".
type InfeasibleKind = 'hw_permanent' | 'sw_fixable';

interface ProfileRow {
  profile: string;
  isMultiTurn: boolean;
  expected: number[];
  present: Set<number>;
  blocked?: Map<number, string>;
  failed?: Map<number, string>;
  // Per-concurrency failure detail (class + evidence) keyed by concurrency.
  detail?: Map<number, CellDetail>;
  infeasibleReason?: string;
  infeasibleKind?: InfeasibleKind;
  todoReason?: string;
}

// The cell the user clicked, lifted to CoveragePage and rendered by the side card.
interface SelectedCell {
  hardware: string;
  model: string;
  backend: string;
  profile: string;
  concurrency: number;
  tone: 'red' | 'yellow' | 'hw' | 'green' | 'gray';
  failureClass?: string;
  infeasibleKind?: InfeasibleKind;
  label?: string;
  reason?: string;
  explanation?: string;
  evidence?: CoverageEvidence | null;
  attempt?: number | null;
  maxAttempts?: number | null;
  remoteLog?: string | null;
}

interface DataModel {
  kind: 'data';
  hardware: string;
  model: string;
  backend: string;
  engineVersion?: string;
  profiles: ProfileRow[];
  // Aggregate coverage across all profiles.
  totalHave: number;
  totalNeed: number;
}

interface StatusModel {
  kind: 'status';
  hardware: string;
  model: string;
  backend: string;
  status: 'oom' | 'untested' | 'infeasible' | 'running' | 'skipped' | 'pending' | 'failed';
  reason?: string;
  attempt?: number;
  maxAttempts?: number | null;
  failure?: CoverageFailure | null;
  updatedAt?: string | null;
  totalNeed: number;
  profiles?: ProfileRow[];
}

type ModelEntry = DataModel | StatusModel;

interface HwGroup {
  hardware: string;
  models: ModelEntry[];
  // Aggregate counts for the header summary.
  summary: {
    complete: number;  // model has data + all expected concs
    partial: number;   // model has data but incomplete
    running: number;
    pending: number;
    failed: number;
    skipped: number;
    oom: number;
    infeasible: number;
    untested: number;
    totalHave: number;
    totalNeed: number;
    failedCells: number;
    // Tone-based counts computed via failureTone over the points, so the
    // header chips match the cell colors exactly.
    runtimeFailures: number;  // red cells
    hwCells: number;          // blue cells (hardware genuinely can't)
    blockedCells: number;     // yellow cells (couldn't run — fixable)
    pendingCells: number;     // gray/hollow cells (expected, not run, no failure)
  };
}

function hwLabel(base: string, tp: number): string {
  return tp === 1 ? base : `${base}x${tp}`;
}

function infeasibilityReason(
  vramGb: number | undefined,
  weightsGb: number | undefined,
  tp: number,
  ratio: number,
): string | null {
  if (!vramGb || !weightsGb) return null;
  const budget = vramGb * tp * ratio;
  if (weightsGb > budget) {
    const minGb = Math.ceil(weightsGb / ratio);
    return `needs ≥${minGb} GB VRAM (weights ${weightsGb} GB); this config has ${vramGb * tp} GB`;
  }
  return null;
}

const STATUS_PRIORITY: Record<SweepCell['status'], number> = {
  known_oom: 5, skipped: 4, failed: 4, running: 3, pending: 2, done: 1,
};

function aggregateCells(cells: SweepCell[]): Map<string, SweepCell> {
  const out = new Map<string, SweepCell>();
  for (const c of cells) {
    const key = `${c.hw_label}|${c.model}|${c.backend}`;
    const prev = out.get(key);
    if (!prev || STATUS_PRIORITY[c.status] > STATUS_PRIORITY[prev.status]) {
      out.set(key, c);
    }
  }
  return out;
}

function stateCellScope(cell: SweepCell): DataScope {
  return normalizeDataScope(cell.data_scope ?? null) ?? 'archived';
}

// EP-on (expert-parallel) cells live in the dedicated moe_ep scope. To show EP
// off vs on as distinct, labeled rows in the same grid, MoE cells + coverage
// jobs are relabeled with a display backend ("sglang · tp" / "· tp+ep") and
// their job ids recomputed so the grid's hw|model|backend keying and per-job
// blocker lookups line up. EP-on entries are folded into the synthetic scope.
const SYNTHETIC_SCOPE_VALUES = new Set(['synthetic_distributional', 'synthetic', 'synthetic-distributional', 'latest']);

function isEpOnCell(cell: Pick<SweepCell, 'ep' | 'data_scope'>): boolean {
  return cell.ep === true || cell.data_scope === 'moe_ep';
}

// Parallelism strategy shown to users. The launcher today only expresses
// tensor-parallel and expert-parallel-over-TP, so a run is "tp" (EP off) or
// "tp+ep" (EP on). The label is suffixed onto the backend so EP-off and EP-on
// render as distinct grid rows and keying + blocker lookups line up. The other
// strategies (ep = expert-parallel without TP, pp = pipeline, ep+pp) are not
// wired in the launcher yet — see the parallelism legend.
function epBackendLabel(backend: string, on: boolean): string {
  return `${backend} · ${on ? 'tp+ep' : 'tp'}`;
}

function moeModelsFromCells(cells: SweepCell[] | undefined): Set<string> {
  return new Set((cells ?? []).filter(isEpOnCell).map((c) => c.model));
}

// Relabel MoE cells: EP-on -> "· tp+ep" (folded into synthetic scope), EP-off
// synthetic -> "· tp". Dense models and other scopes pass through untouched.
function transformSweepCellsForEp(cells: SweepCell[], moeModels: Set<string>): SweepCell[] {
  if (moeModels.size === 0) return cells;
  return cells.map((c) => {
    if (!moeModels.has(c.model)) return c;
    if (isEpOnCell(c)) {
      return { ...c, backend: epBackendLabel(c.backend, true), data_scope: 'synthetic_distributional' };
    }
    if (SYNTHETIC_SCOPE_VALUES.has(String(c.data_scope))) {
      return { ...c, backend: epBackendLabel(c.backend, false) };
    }
    return c;
  });
}

function relabelPoints(points: CoveragePoint[] | undefined, on: boolean): CoveragePoint[] | undefined {
  return points?.map((p) => ({ ...p, backend: epBackendLabel(p.backend, on) }));
}

function transformBlockerForEp(job: CoverageBlocker, on: boolean): CoverageBlocker {
  const backend = epBackendLabel(job.backend, on);
  return {
    ...job,
    backend,
    job_id: jobIdForCell({ host: job.host, model: job.model, tp: job.tp, mode: job.mode, backend }),
    scope: 'synthetic_distributional',
    present_points: relabelPoints(job.present_points, on),
    missing_points: relabelPoints(job.missing_points, on),
    expected_points: relabelPoints(job.expected_points, on),
  };
}

// Merge the EP-off (synthetic) + EP-on (moe_ep) coverage manifests into one, with
// MoE jobs/blockers relabeled so they render as separate "· tp"/"· tp+ep" rows.
function mergeEpBlockers(
  base: CoverageBlockersState | null,
  moeEp: CoverageBlockersState | null,
  moeModels: Set<string>,
): CoverageBlockersState | null {
  if (!base && !moeEp) return null;
  const offJobs = (base?.jobs ?? []).map((j) => (moeModels.has(j.model) ? transformBlockerForEp(j, false) : j));
  const offBlockers = (base?.blockers ?? []).map((b) => (moeModels.has(b.model) ? transformBlockerForEp(b, false) : b));
  const onJobs = (moeEp?.jobs ?? []).map((j) => transformBlockerForEp(j, true));
  const onBlockers = (moeEp?.blockers ?? []).map((b) => transformBlockerForEp(b, true));
  const seed = base ?? moeEp!;
  const sum = (a: number | undefined, b: number | undefined) => (a ?? 0) + (b ?? 0);
  return {
    ...seed,
    jobs: [...offJobs, ...onJobs],
    blockers: [...offBlockers, ...onBlockers],
    expected_points: sum(base?.expected_points, moeEp?.expected_points),
    present_points: sum(base?.present_points, moeEp?.present_points),
    missing_points: sum(base?.missing_points, moeEp?.missing_points),
    observed_present_points: sum(base?.observed_present_points, moeEp?.observed_present_points),
    coverage_required_points: sum(base?.coverage_required_points, moeEp?.coverage_required_points),
  };
}

function isMultiTurnProfile(profile: string): boolean {
  return profile.includes('multiturn') || profile.includes('multi-turn');
}

function usesCanonicalCoverage(scope: DataScope): boolean {
  return scope === 'synthetic_distributional';
}

function coverageGridScope(scope: DataScope): DataScope {
  return scope;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function uniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function sweepProfilesForMode(cells: SweepCell[], mode: SweepCell['mode']): string[] {
  return uniqueStrings(cells.flatMap((cell) => cell.mode === mode ? cell.profiles ?? [] : []));
}

function sweepConcurrenciesForMode(cells: SweepCell[], mode: SweepCell['mode']): number[] {
  return uniqueNumbers(cells.flatMap((cell) => cell.mode === mode ? cell.concurrencies ?? [] : []));
}

function jobIdForCell(cell: { host: string; model: string; tp: number; mode: string; backend: string }): string {
  const base = `${cell.host}_${cell.model}_tp${cell.tp}_${cell.mode}`;
  return cell.backend && cell.backend !== 'vllm' ? `${base}_${cell.backend}` : base;
}

function pointKey(hw: string, model: string, backend: string, profile: string, concurrency: number): string {
  return `${hw}|${model}|${backend}|${profile}|${concurrency}`;
}

function pointKeyFromSummary(point: CoveragePoint): string {
  return pointKey(point.hardware, point.model, point.backend, point.profile, point.concurrency);
}

function profileInfeasibleKeys(hw: string, model: string, backend: string, profile: string): string[] {
  const profiles = new Set([profile]);
  if (profile.endsWith('-synth')) {
    profiles.add(profile.replace(/-synth$/, ''));
  } else {
    profiles.add(`${profile}-synth`);
  }
  return Array.from(profiles, (p) => `${hw}|${model}|${backend}|${p}`);
}

function summarizeReasons(reasons: Array<string | undefined>, fallback?: string): string | undefined {
  const unique = Array.from(new Set(reasons.filter((reason): reason is string => Boolean(reason))));
  if (unique.length === 0) return fallback;
  if (unique.length === 1) return unique[0];
  return unique.join(' | ');
}

function failureLabel(failure?: CoverageFailure | null): string | undefined {
  if (!failure) return undefined;
  const attempt = failure.attempt;
  const maxAttempts = failure.max_attempts;
  const attempts = attempt == null
    ? null
    : maxAttempts == null ? `${attempt} attempts` : `${attempt}/${maxAttempts} attempts`;
  return `${failure.label}${attempts ? ` after ${attempts}` : ''}`;
}

function failureReason(failure?: CoverageFailure | null, fallback?: string | null): string | undefined {
  const label = failureLabel(failure);
  const reason = failure?.reason ?? fallback ?? undefined;
  if (label && reason) return `${label}: ${reason}`;
  return label ?? reason;
}

// LEGACY — non-compact scopes only (no coverage artifact, e.g. some
// trace_replay/archived cells). The synthetic_distributional path is driven
// entirely by the artifact's `coverage_disposition` (see disposition() below);
// this regex is NOT the source of truth and must not be extended for policy.
// Coverage classification policy lives in reconcile_sweep_coverage.py.
// (RFC: docs/coverage-classification-rfc.md §4.3 — dumb renderer.)
function failureCategoryFromReason(reason?: string | null): string | undefined {
  const lower = (reason ?? '').toLowerCase();
  if (!lower) return undefined;
  if (/(xid|nvml|driver|gpu has fallen off|cuda error|uncorrectable|nvidia-smi|cuda initialization)/.test(lower)) return 'driver_failure';
  if (/(out of memory|cuda out of memory|kv-cache|kv cache|cache blocks)/.test(lower)) return 'oom_or_kv_cache';
  if (lower.includes('success rate') && lower.includes('below minimum')) return 'success_rate_below_min';
  if (lower.includes('[warn]') && lower.includes('failed')) return 'benchmark_failed';
  if (lower.includes('zero results') || lower.includes('zero expected outputs') || lower.includes('no usable temporary directory')) return 'zero_results';
  if (lower.includes('incomplete') || lower.includes('expected outputs missing')) return 'incomplete_outputs';
  return 'unknown';
}

function failureCategory(failure?: CoverageFailure | null, fallback?: string | null): string | undefined {
  return failure?.category ?? failureCategoryFromReason(failure?.reason ?? fallback);
}

// Legacy N/A categories for the non-compact fallback only (matches
// classifySweepFailure's vocabulary). The compact artifact never reaches here.
const N_A_FAILURE_CATEGORIES = new Set([
  'oom_or_kv_cache',
  'success_rate_below_min',
  'zero_results',
  'incomplete_outputs',
]);

function failureCoverageDisposition(
  failure?: CoverageFailure | null,
  fallback?: string | null,
  explicit?: CoverageBlocker['coverage_disposition'],
): 'failed' | 'na' | undefined {
  // The coverage artifact is authoritative (dumb renderer): when an explicit
  // disposition is present we NEVER re-derive from the reason string.
  if (explicit === 'failed' || explicit === 'na') return explicit;
  if (explicit === 'todo') return undefined;  // fillable work, not a blocked cell
  // Legacy fallback: only scopes without a coverage artifact get here.
  const category = failureCategory(failure, fallback);
  if (!category) return undefined;
  return N_A_FAILURE_CATEGORIES.has(category) ? 'na' : 'failed';
}

function shouldCountFailureAsMissing(
  failure?: CoverageFailure | null,
  fallback?: string | null,
  explicit?: CoverageBlocker['coverage_disposition'],
): boolean {
  return failureCoverageDisposition(failure, fallback, explicit) === 'failed';
}

const TERMINAL_BLOCKER_STATUSES = new Set(['skipped', 'failed', 'known_oom']);

// Coverage artifact older than this (minutes) -> warn that it may be stale
// (the orchestrator regenerates it every tick; staleness means it stopped).
// RFC: docs/coverage-classification-rfc.md §4.7 (provenance).
const COVERAGE_STALE_MINUTES = 20;

function shouldRenderBlockedPoints(blocker: CoverageBlocker, exhaustedJobIds: Set<string>): boolean {
  if ((blocker.missing_points ?? []).length === 0) return false;
  // Demoted to TODO (attempted but no captured OOM): render as outstanding work,
  // not as a blocked N/A cell. Must precede the exhausted check because these
  // jobs are also in reset_exhausted.
  if (blocker.coverage_disposition === 'todo') return false;
  if (exhaustedJobIds.has(blocker.job_id)) return true;
  if (blocker.status === 'known_oom') return true;
  return Boolean(blocker.failure) && TERMINAL_BLOCKER_STATUSES.has(blocker.status);
}

function classifySweepFailure(failure?: SweepCell['failure_metadata'] | null): CoverageFailure | null {
  if (!failure?.reason) return null;
  const lower = failure.reason.toLowerCase();
  let category = 'unknown';
  let label = 'unknown failure';
  if (/(xid|nvml|driver|gpu has fallen off|cuda error|uncorrectable|nvidia-smi|cuda initialization)/.test(lower)) {
    category = 'driver_failure';
    label = 'driver failure';
  } else if (/(out of memory|cuda out of memory|kv-cache|kv cache|cache blocks)/.test(lower)) {
    category = 'oom_or_kv_cache';
    label = 'OOM / KV-cache limit';
  } else if (lower.includes('success rate') && lower.includes('below minimum')) {
    category = 'success_rate_below_min';
    label = 'success rate below threshold';
  } else if (lower.includes('[warn]') && lower.includes('failed')) {
    category = 'benchmark_failed';
    label = 'benchmark command failed';
  } else if (lower.includes('zero results') || lower.includes('zero expected outputs')) {
    category = 'zero_results';
    label = 'zero results';
  } else if (lower.includes('incomplete') || lower.includes('expected outputs missing')) {
    category = 'incomplete_outputs';
    label = 'incomplete outputs';
  }
  return { ...failure, category, label };
}

// --- Failure-class → tone mapping (the semantic core of this page) -----------
// Cells are colored by the FINER failure_class, not the coarse disposition, so
// "model not staged" reads yellow while "low success / OOM / crash" read red.
//   RED    = ran but failed operationally.
//   YELLOW = couldn't run / blocked (not staged, unsupported, infeasible).
const RED_FAILURE_CLASSES = new Set<string>([
  'engine_crash', 'low_success_rate', 'oom_kv_cache', 'timeout',
  'requests_aborted', 'driver_fault', 'cuda_error',
]);
const YELLOW_FAILURE_CLASSES = new Set<string>([
  'model_missing', 'hw_infeasible', 'arch_unsupported', 'unsupported', 'sm_unsupported',
]);

// 'hw' = blue/slate: the GPU physically can't run this (arch / compute
// capability). Distinct from yellow "couldn't run — fixable".
type CellTone = 'red' | 'yellow' | 'hw';

// The single source of truth for failure color. Applied everywhere failure is
// shown (cells, profile-row badges, header chips, the detail card) so they all
// agree. failure_class wins; when absent, fall back to disposition/feasibility.
// Infeasible cells route by `kind`: a permanent hardware limit (hw_permanent, or
// omitted — VRAM skips) → blue 'hw'; a fixable env/software gap → yellow.
function failureTone(
  failureClass?: string | null,
  disposition?: 'failed' | 'na' | 'todo' | null,
  infeasible?: boolean,
  infeasibleKind?: InfeasibleKind | null,
): CellTone | null {
  const fc = failureClass ? failureClass.toLowerCase() : '';
  if (fc) {
    if (fc.startsWith('oom')) return 'red';          // any oom* is red
    if (RED_FAILURE_CLASSES.has(fc)) return 'red';
    if (YELLOW_FAILURE_CLASSES.has(fc)) return 'yellow';
  }
  // Fallback when failure_class is absent or unrecognized.
  if (infeasible) return infeasibleKind === 'sw_fixable' ? 'yellow' : 'hw';
  if (disposition === 'failed') return 'red';
  if (disposition === 'na') return 'yellow';
  return null;
}

type CellVisual = 'present' | 'red' | 'yellow' | 'hw' | 'missing' | 'faint';

// Resolve the visual state of one (profile, concurrency) cell. Shared by the
// cell renderer, the model-row aggregate, the profile-row badges, and the
// header-chip counting so every surface stays consistent.
function profileCellTone(p: ProfileRow, c: number): { visual: CellVisual; detail?: CellDetail } {
  const detail = p.detail?.get(c);
  if (p.present.has(c)) return { visual: 'present', detail };
  const expected = p.expected.includes(c);
  const failedReason = p.failed?.get(c);
  const blockedReason = p.blocked?.get(c);
  const disposition = detail?.disposition
    ?? (failedReason ? 'failed' : blockedReason ? 'na' : undefined);
  const tone = failureTone(detail?.failClass, disposition, Boolean(p.infeasibleReason), p.infeasibleKind);
  if (tone === 'red') return { visual: 'red', detail };
  if (tone === 'yellow') return { visual: 'yellow', detail };
  if (tone === 'hw') return { visual: 'hw', detail };
  if (expected) return { visual: 'missing', detail };
  return { visual: 'faint', detail };
}

interface ConcAgg {
  present: number;
  runnable: number;  // present + red + missing (expected, not blocked as N/A)
  red: number;
  yellow: number;
  hw: number;        // blue cells (hardware genuinely can't)
  missing: number;
  rep?: { p: ProfileRow; c: number; visual: CellVisual };  // representative failing cell
}

// Aggregate every profile's cell at each concurrency into one model-row column.
function aggregateConcs(profiles: ProfileRow[]): Map<number, ConcAgg> {
  const out = new Map<number, ConcAgg>();
  for (const p of profiles) {
    for (const c of p.expected) {
      const { visual } = profileCellTone(p, c);
      const s = out.get(c) ?? { present: 0, runnable: 0, red: 0, yellow: 0, hw: 0, missing: 0 };
      if (visual === 'present') { s.present += 1; s.runnable += 1; }
      else if (visual === 'red') { s.red += 1; s.runnable += 1; if (!s.rep || s.rep.visual !== 'red') s.rep = { p, c, visual }; }
      else if (visual === 'yellow') { s.yellow += 1; if (!s.rep) s.rep = { p, c, visual }; }
      else if (visual === 'hw') { s.hw += 1; if (!s.rep) s.rep = { p, c, visual }; }
      else if (visual === 'missing') { s.missing += 1; s.runnable += 1; }
      out.set(c, s);
    }
  }
  return out;
}

function toneToCard(visual: CellVisual): SelectedCell['tone'] {
  return visual === 'red' ? 'red' : visual === 'yellow' ? 'yellow' : visual === 'hw' ? 'hw' : visual === 'present' ? 'green' : 'gray';
}

// Build the side-card payload from a profile row + concurrency.
function buildSelectedCell(
  hardware: string,
  model: string,
  backend: string,
  p: ProfileRow,
  c: number,
  visual: CellVisual,
): SelectedCell {
  const d = p.detail?.get(c);
  const fallbackLabel = p.failed?.get(c) ?? p.blocked?.get(c) ?? p.infeasibleReason;
  return {
    hardware,
    model,
    backend,
    profile: p.profile,
    concurrency: c,
    tone: toneToCard(visual),
    failureClass: d?.failClass,
    infeasibleKind: p.infeasibleKind,
    label: d?.label ?? fallbackLabel,
    reason: d?.reason,
    explanation: d?.explanation,
    evidence: d?.evidence ?? null,
    attempt: d?.attempt ?? null,
    maxAttempts: d?.maxAttempts ?? null,
    remoteLog: d?.remoteLog ?? null,
  };
}

export function CoveragePage({
  allData,
  sweepState: rawSweepState,
  loading,
  dataScope,
}: CoveragePageProps) {
  const canonicalCoverage = usesCanonicalCoverage(dataScope);
  const gridScope = coverageGridScope(dataScope);
  const {
    blockersState: rawBlockersState,
    loading: blockersLoading,
  } = useCoverageBlockers(dataScope === 'synthetic_distributional');
  const { blockersState: moeEpBlockersState } = useCoverageBlockers(
    dataScope === 'synthetic_distributional',
    coverageBlockersMoeEpJsonUrl,
  );
  // Fold MoE EP off/on into the grid as labeled rows: relabel MoE cells +
  // coverage jobs with a display backend and merge the two blocker manifests.
  const moeModels = useMemo(() => moeModelsFromCells(rawSweepState?.cells), [rawSweepState]);
  const sweepState = useMemo(
    () => (rawSweepState ? { ...rawSweepState, cells: transformSweepCellsForEp(rawSweepState.cells, moeModels) } : rawSweepState),
    [rawSweepState, moeModels],
  );
  const blockersState = useMemo(
    () => mergeEpBlockers(rawBlockersState, moeEpBlockersState, moeModels),
    [rawBlockersState, moeEpBlockersState, moeModels],
  );
  const compactCoverageJobs = dataScope === 'synthetic_distributional' ? blockersState?.jobs ?? [] : [];
  const usingCompactCoverage = dataScope === 'synthetic_distributional' && compactCoverageJobs.length > 0;

  const coveragePlan = useMemo(() => {
    const scopedSweepCells = sweepState?.cells.filter((cell) => stateCellScope(cell) === gridScope) ?? [];
    const singleProfiles = gridScope === 'trace_replay'
      ? ARCHIVE_SINGLE_PROFILES
      : gridScope === 'synthetic_distributional'
        ? sweepProfilesForMode(scopedSweepCells, 'single')
        : uniqueStrings([...CURRENT_SINGLE_PROFILES, ...FIXED_SINGLE_PROFILES, ...MSE_SINGLE_PROFILES]);
    const multiProfiles = gridScope === 'trace_replay'
      ? ARCHIVE_MULTI_PROFILES
      : gridScope === 'synthetic_distributional'
        ? sweepProfilesForMode(scopedSweepCells, 'multi')
        : uniqueStrings([...CURRENT_MULTI_PROFILES, ...FIXED_MULTI_PROFILES, ...MSE_MULTI_PROFILES]);
    const singleConcs = gridScope === 'trace_replay'
      ? ARCHIVE_SINGLE_CONCS
      : gridScope === 'synthetic_distributional'
        ? sweepConcurrenciesForMode(scopedSweepCells, 'single')
        : uniqueNumbers([...CURRENT_SINGLE_CONCS, ...FIXED_SINGLE_CONCS, ...MSE_SINGLE_CONCS]);
    const multiConcs = gridScope === 'trace_replay'
      ? ARCHIVE_MULTI_CONCS
      : gridScope === 'synthetic_distributional'
        ? sweepConcurrenciesForMode(scopedSweepCells, 'multi')
        : uniqueNumbers([...CURRENT_MULTI_CONCS, ...FIXED_MULTI_CONCS, ...MSE_MULTI_CONCS]);
    return {
      singleProfiles,
      multiProfiles,
      singleConcs,
      multiConcs,
      expectedCellsPerModel: singleProfiles.length * singleConcs.length + multiProfiles.length * multiConcs.length,
    };
  }, [gridScope, sweepState]);

  const { groups, hardwareList } = useMemo(() => {
    const { singleProfiles, multiProfiles, singleConcs, multiConcs, expectedCellsPerModel } = coveragePlan;
    const scopedSweepCells = sweepState?.cells.filter((cell) => stateCellScope(cell) === gridScope) ?? [];
    const baseHwLabels = sweepState
      ? Object.values(sweepState.hosts).map((h) => h.hardware_label)
      : ['A100-40GB', '3090', '2080Ti', 'H100'];
    const dataHw = new Set(
      usingCompactCoverage
        ? compactCoverageJobs.map((job) => job.hardware)
        : allData.map((r) => r.hardware),
    );
    const expectedHw: string[] = [];
    if (!canonicalCoverage) {
      expectedHw.push(...Array.from(dataHw).sort());
    } else if (dataScope === 'synthetic_distributional') {
      const scopedHw = new Set<string>([...scopedSweepCells.map((cell) => cell.hw_label), ...dataHw]);
      expectedHw.push(...Array.from(scopedHw).sort());
    } else {
      for (const base of baseHwLabels) {
        for (const tp of TP_OPTIONS) expectedHw.push(hwLabel(base, tp));
      }
      for (const hw of dataHw) {
        if (!hw.endsWith('x8') && !expectedHw.includes(hw)) expectedHw.push(hw);
      }
    }

    const expectedModels = new Set<string>();
    if (canonicalCoverage && sweepState) {
      if (dataScope === 'synthetic_distributional') {
        for (const cell of scopedSweepCells) expectedModels.add(cell.model);
      } else {
        for (const m of Object.keys(sweepState.models)) expectedModels.add(m);
      }
    }
    for (const r of allData) expectedModels.add(r.modelShort);
    for (const job of compactCoverageJobs) expectedModels.add(job.model);
    const modelList = Array.from(expectedModels).sort(compareModels);

    const vramByBase = new Map<string, number>();
    if (sweepState) {
      for (const h of Object.values(sweepState.hosts)) vramByBase.set(h.hardware_label, h.vram_gb_per_gpu);
    }
    const vramFor = (hw: string): number | undefined => {
      const m = hw.match(/^(.+?)(?:x(\d+))?$/);
      return m ? vramByBase.get(m[1]) : undefined;
    };
    const tpOf = (hw: string): number => {
      const m = hw.match(/x(\d+)$/);
      return m ? parseInt(m[1], 10) : 1;
    };
    const weightsFor = (model: string): number | undefined =>
      sweepState?.models[model]?.weights_gb;
    const ratio = sweepState?.feasibility_ratio ?? 0.85;
    const profileInfeasible = new Map<string, string>();
    const profileInfeasibleKind = new Map<string, InfeasibleKind>();
    if (canonicalCoverage) {
      for (const item of sweepState?.profile_infeasible ?? []) {
        if ((normalizeDataScope(item.data_scope ?? null) ?? 'archived') !== gridScope) continue;
        for (const key of profileInfeasibleKeys(item.hw_label, item.model, item.backend, item.profile)) {
          profileInfeasible.set(key, item.reason);
          profileInfeasibleKind.set(key, item.kind ?? 'hw_permanent');
        }
      }
    }
    const profileInfeasibleReasonFor = (
      hw: string,
      model: string,
      backend: string,
      profile: string,
    ): string | undefined => {
      for (const key of profileInfeasibleKeys(hw, model, backend, profile)) {
        const reason = profileInfeasible.get(key);
        if (reason) return reason;
      }
      return undefined;
    };
    const profileInfeasibleKindFor = (
      hw: string,
      model: string,
      backend: string,
      profile: string,
    ): InfeasibleKind | undefined => {
      for (const key of profileInfeasibleKeys(hw, model, backend, profile)) {
        if (profileInfeasible.has(key)) return profileInfeasibleKind.get(key) ?? 'hw_permanent';
      }
      return undefined;
    };

    const sweepCellsByMb = new Map<string, SweepCell[]>();
    if (dataScope === 'synthetic_distributional') {
      for (const cell of scopedSweepCells) {
        const key = `${cell.hw_label}|${cell.model}|${cell.backend}`;
        const cells = sweepCellsByMb.get(key) ?? [];
        cells.push(cell);
        sweepCellsByMb.set(key, cells);
      }
    }
    const sweepCellsFor = (hw: string, model: string, backend: string): SweepCell[] =>
      sweepCellsByMb.get(`${hw}|${model}|${backend}`) ?? [];
    const sweepConcsForProfile = (
      hw: string,
      model: string,
      backend: string,
      profile: string,
      doneOnly: boolean,
    ): number[] => {
      const concs = new Set<number>();
      for (const cell of sweepCellsFor(hw, model, backend)) {
        if (doneOnly && cell.status !== 'done') continue;
        if (!(cell.profiles ?? []).includes(profile)) continue;
        for (const concurrency of cell.concurrencies ?? []) concs.add(concurrency);
      }
      return uniqueNumbers(Array.from(concs));
    };
    const hasDoneSweepCells = (hw: string, model: string, backend: string): boolean =>
      sweepCellsFor(hw, model, backend).some((cell) => cell.status === 'done');
    const buildStatusProfiles = (
      hw: string,
      model: string,
      backend: string,
      status: StatusModel['status'],
      reason?: string,
      kind?: InfeasibleKind,
    ): ProfileRow[] => {
      const specs = new Map<string, { profile: string; isMultiTurn: boolean; expected: Set<number> }>();
      const addSpec = (profile: string, isMultiTurn: boolean, concurrencies: number[]) => {
        const spec = specs.get(profile) ?? { profile, isMultiTurn, expected: new Set<number>() };
        spec.isMultiTurn = spec.isMultiTurn || isMultiTurn;
        for (const concurrency of concurrencies) spec.expected.add(concurrency);
        specs.set(profile, spec);
      };

      if (dataScope === 'synthetic_distributional') {
        for (const cell of sweepCellsFor(hw, model, backend)) {
          const isMultiTurn = cell.mode === 'multi';
          for (const profile of cell.profiles ?? []) {
            addSpec(profile, isMultiTurn, cell.concurrencies ?? []);
          }
        }
      } else {
        for (const profile of singleProfiles) addSpec(profile, false, singleConcs);
        for (const profile of multiProfiles) addSpec(profile, true, multiConcs);
      }

      const rows: ProfileRow[] = [];
      const modelLevelNa = status === 'oom' || status === 'skipped' || status === 'infeasible';
      // A VRAM-infeasible model or a known_oom cell is a structural N/A that
      // carries an infeasibility kind, so its cells color by hw_permanent (blue)
      // vs sw_fixable (yellow). 'skipped' has no kind and stays a generic N/A.
      const modelLevelInfeasible = status === 'infeasible' || status === 'oom';
      const modelLevelFailed = status === 'failed';
      const todoReason = reason ?? 'expected by sweep grid; no completed run exists yet';
      for (const spec of specs.values()) {
        const expected = uniqueNumbers(Array.from(spec.expected));
        const profileReason = profileInfeasibleReasonFor(hw, model, backend, spec.profile);
        const infeasibleReason = profileReason ?? (modelLevelInfeasible ? reason : undefined);
        const infeasibleKind = profileReason
          ? profileInfeasibleKindFor(hw, model, backend, spec.profile)
          : (modelLevelInfeasible ? (kind ?? 'hw_permanent') : undefined);
        const blocked = new Map<number, string>();
        const failed = new Map<number, string>();
        if (modelLevelNa && !infeasibleReason) {
          const blockedReason = reason ?? labelForStatus(status);
          for (const concurrency of expected) blocked.set(concurrency, blockedReason);
        }
        if (modelLevelFailed && !infeasibleReason) {
          const failedReason = reason ?? labelForStatus(status);
          for (const concurrency of expected) {
            failed.set(
              concurrency,
              failedPointReasons.get(pointKey(hw, model, backend, spec.profile, concurrency)) ?? failedReason,
            );
          }
        }
        rows.push({
          profile: spec.profile,
          isMultiTurn: spec.isMultiTurn,
          expected,
          present: new Set<number>(),
          blocked,
          failed,
          detail: detailMapFor(hw, model, backend, spec.profile, expected),
          infeasibleReason,
          infeasibleKind,
          todoReason: status === 'untested' || status === 'pending' ? todoReason : undefined,
        });
      }
      return rows;
    };

    const expectedCountFor = (hw: string, model: string, backend: string): number => {
      // For scoped sweeps, derive expected count from the actual sweep-state cells,
      // not the full profile×concurrency cross-product.
      if (dataScope === 'synthetic_distributional') {
        let total = 0;
        for (const cell of sweepCellsFor(hw, model, backend)) {
          for (const profile of cell.profiles ?? []) {
            if (!profileInfeasibleReasonFor(hw, model, backend, profile)) {
              total += (cell.concurrencies ?? []).length;
            }
          }
        }
        return total;
      }
      let total = 0;
      for (const profile of singleProfiles) {
        if (!profileInfeasibleReasonFor(hw, model, backend, profile)) total += singleConcs.length;
      }
      for (const profile of multiProfiles) {
        if (!profileInfeasibleReasonFor(hw, model, backend, profile)) total += multiConcs.length;
      }
      return total;
    };

    const exhaustedJobIds = new Set(blockersState?.reset_exhausted ?? []);
    const blockerByJobId = new Map<string, CoverageBlocker>();
    const blockedPointReasons = new Map<string, string>();
    const failedPointReasons = new Map<string, string>();
    for (const blocker of blockersState?.blockers ?? []) {
      blockerByJobId.set(blocker.job_id, blocker);
      if (!shouldRenderBlockedPoints(blocker, exhaustedJobIds)) continue;
      const reason = blocker.coverage_explanation
        ?? blocker.reason
        ?? failureReason(blocker.failure, blocker.reason)
        ?? `coverage requeue exhausted after ${blocker.attempt ?? 'unknown'} attempts`;
      // Per-cell granularity (RFC §4.5): each missing point can carry its own
      // disposition, so a job that serves at low concurrency but is quality-
      // rejected at high concurrency splits across tones instead of inheriting
      // one job-level disposition. Falls back to the job disposition.
      const jobDisposition = shouldCountFailureAsMissing(blocker.failure, blocker.reason, blocker.coverage_disposition)
        ? 'failed'
        : 'na';
      for (const point of blocker.missing_points ?? []) {
        const key = pointKeyFromSummary(point);
        const cellDisposition = point.disposition ?? jobDisposition;
        const cellReason = point.label ?? reason;
        if (cellDisposition === 'failed') {
          failedPointReasons.set(key, cellReason);
        } else if (cellDisposition !== 'todo') {
          blockedPointReasons.set(key, cellReason);  // na
        }
        // cellDisposition === 'todo' -> leave unblocked; renders as fillable work
      }
    }

    // Per-cell failure detail keyed by point. Built from EVERY blocker's
    // missing_points (not gated by shouldRenderBlockedPoints) so a cell can be
    // colored by its own failure_class even when the coarse job disposition
    // would have demoted it to TODO/N/A (e.g. oom_kv_cache marked 'todo').
    const cellDetailByKey = new Map<string, CellDetail>();
    for (const blocker of blockersState?.blockers ?? []) {
      const f = blocker.failure;
      for (const point of blocker.missing_points ?? []) {
        const key = pointKeyFromSummary(point);
        const failClass = point.failure_class
          ?? blocker.coverage_failure_class
          ?? f?.failure_class
          ?? undefined;
        cellDetailByKey.set(key, {
          failClass: failClass ?? undefined,
          disposition: point.disposition ?? blocker.coverage_disposition ?? null,
          label: point.label ?? blocker.coverage_label ?? f?.label ?? undefined,
          reason: f?.reason ?? blocker.reason ?? undefined,
          explanation: blocker.coverage_explanation ?? undefined,
          evidence: f?.evidence ?? blocker.coverage_evidence ?? null,
          attempt: f?.attempt ?? blocker.attempt ?? null,
          maxAttempts: f?.max_attempts ?? null,
          remoteLog: f?.remote_log ?? null,
        });
      }
    }
    const detailFor = (
      hw: string,
      model: string,
      backend: string,
      profile: string,
      concurrency: number,
    ): CellDetail | undefined => cellDetailByKey.get(pointKey(hw, model, backend, profile, concurrency));

    const detailMapFor = (
      hw: string,
      model: string,
      backend: string,
      profile: string,
      expected: number[],
    ): Map<number, CellDetail> => {
      const map = new Map<number, CellDetail>();
      for (const concurrency of expected) {
        const d = detailFor(hw, model, backend, profile, concurrency);
        if (d) map.set(concurrency, d);
      }
      return map;
    };

    const compactJobById = new Map<string, CoverageBlocker>();
    for (const job of compactCoverageJobs) compactJobById.set(job.job_id, job);

    const bucket = new Map<string, Set<number>>();
    const mbHasData = new Map<string, Set<string>>();  // hw -> Set<"model|backend">
    const engineVersionByMb = new Map<string, string>();  // "hw|model|backend" -> version
    const profilesByMb = new Map<string, Set<string>>();  // "hw|model|backend" -> profiles with data
    if (usingCompactCoverage) {
      for (const job of compactCoverageJobs) {
        const mbKey = `${job.hardware}|${job.model}|${job.backend}`;
        if (job.present > 0) {
          if (!mbHasData.has(job.hardware)) mbHasData.set(job.hardware, new Set());
          mbHasData.get(job.hardware)!.add(`${job.model}|${job.backend}`);
        }
        for (const point of job.present_points ?? []) {
          const k = `${point.hardware}|${point.model}|${point.backend}|${point.profile}`;
          if (!bucket.has(k)) bucket.set(k, new Set());
          bucket.get(k)!.add(point.concurrency);
          if (!profilesByMb.has(mbKey)) profilesByMb.set(mbKey, new Set());
          profilesByMb.get(mbKey)!.add(point.profile);
        }
      }
    } else {
      for (const r of allData) {
        const backend = r.config.backend;
        const k = `${r.hardware}|${r.modelShort}|${backend}|${r.config.profile}`;
        if (!bucket.has(k)) bucket.set(k, new Set());
        bucket.get(k)!.add(r.config.concurrency);
        if (!mbHasData.has(r.hardware)) mbHasData.set(r.hardware, new Set());
        mbHasData.get(r.hardware)!.add(`${r.modelShort}|${backend}`);
        const mbKey = `${r.hardware}|${r.modelShort}|${backend}`;
        if (!profilesByMb.has(mbKey)) profilesByMb.set(mbKey, new Set());
        profilesByMb.get(mbKey)!.add(r.config.profile);
        if (r.engineVersion && !engineVersionByMb.has(mbKey)) {
          engineVersionByMb.set(mbKey, r.engineVersion);
        }
      }
    }

    const aggStatus = sweepState
      ? aggregateCells(scopedSweepCells)
      : new Map<string, SweepCell>();

    const hwGroups: HwGroup[] = [];
    for (const hw of expectedHw) {
      const models: ModelEntry[] = [];
      const summary = {
        complete: 0, partial: 0,
        running: 0, pending: 0, failed: 0, skipped: 0,
        oom: 0, infeasible: 0, untested: 0,
        totalHave: 0, totalNeed: 0, failedCells: 0,
        runtimeFailures: 0, hwCells: 0, blockedCells: 0, pendingCells: 0,
      };
      for (const model of modelList) {
        // Always include ACTIVE_BACKENDS (current sweep target) plus any
        // other known backend that actually has data for this (hw, model).
        const backendSet = new Set<string>();
        if (canonicalCoverage) {
          if (dataScope === 'synthetic_distributional') {
            for (const cell of scopedSweepCells) {
              if (cell.hw_label === hw && cell.model === model) backendSet.add(cell.backend);
            }
            for (const item of mbHasData.get(hw) ?? []) {
              const [dataModel, dataBackend] = item.split('|');
              if (dataModel === model && dataBackend) backendSet.add(dataBackend);
            }
          } else {
            for (const b of ACTIVE_BACKENDS) backendSet.add(b);
            for (const b of KNOWN_BACKENDS) {
              if (mbHasData.get(hw)?.has(`${model}|${b}`)) backendSet.add(b);
            }
          }
        } else {
          for (const item of mbHasData.get(hw) ?? []) {
            const [dataModel, dataBackend] = item.split('|');
            if (dataModel === model && dataBackend) backendSet.add(dataBackend);
          }
        }
        const backendsForCell = Array.from(backendSet).sort();
        for (const backend of backendsForCell) {
          const mbKey = `${hw}|${model}|${backend}`;
          const hasData = (mbHasData.get(hw)?.has(`${model}|${backend}`) ?? false)
            || (!usingCompactCoverage && dataScope === 'synthetic_distributional' && hasDoneSweepCells(hw, model, backend));
          const cell = aggStatus.get(mbKey);
            const cellJobId = cell ? jobIdForCell(cell) : null;
            const compactJob = cellJobId ? compactJobById.get(cellJobId) : undefined;
            const blocker = cellJobId ? blockerByJobId.get(cellJobId) : undefined;
            const stateReason = blocker?.coverage_explanation ?? compactJob?.coverage_explanation ?? blocker?.reason ?? compactJob?.reason ?? cell?.reason;
            const expectedForModel = canonicalCoverage
              ? expectedCountFor(hw, model, backend)
              : expectedCellsPerModel;

          if (hasData) {
            const profiles: ProfileRow[] = [];
            let totalHave = 0;
            let totalNeed = 0;
            if (!canonicalCoverage) {
              const mbKey = `${hw}|${model}|${backend}`;
              const observedProfiles = Array.from(profilesByMb.get(mbKey) ?? []).sort();
              for (const profile of observedProfiles) {
                const present = bucket.get(`${mbKey}|${profile}`) ?? new Set<number>();
                const observedConcs = Array.from(present).sort((a, b) => a - b);
                totalHave += observedConcs.length;
                totalNeed += observedConcs.length;
                profiles.push({ profile, isMultiTurn: isMultiTurnProfile(profile), expected: observedConcs, present });
              }
            } else {
              const isScoped = dataScope === 'synthetic_distributional';
              const addProfile = (profile: string, isMultiTurn: boolean) => {
                const observed = bucket.get(`${mbKey}|${profile}`);
                const present = new Set<number>(observed ? Array.from(observed) : []);
                const expected = isScoped
                  ? sweepConcsForProfile(hw, model, backend, profile, false)
                  : isMultiTurn ? multiConcs : singleConcs;
                const blocked = new Map<number, string>();
                const failed = new Map<number, string>();
                for (const concurrency of expected) {
                  const reason = blockedPointReasons.get(pointKey(hw, model, backend, profile, concurrency));
                  if (reason) blocked.set(concurrency, reason);
                  const failedReason = failedPointReasons.get(pointKey(hw, model, backend, profile, concurrency));
                  if (failedReason) failed.set(concurrency, failedReason);
                }
                if (isScoped) {
                  for (const concurrency of sweepConcsForProfile(hw, model, backend, profile, true)) {
                    present.add(concurrency);
                  }
                }
                const infeasibleReason = profileInfeasibleReasonFor(hw, model, backend, profile);
                const infeasibleKind = profileInfeasibleKindFor(hw, model, backend, profile);
                if (isScoped && expected.length === 0 && present.size === 0 && !infeasibleReason) return;
                if (!infeasibleReason) {
                  const have = [...present].filter((c) => expected.includes(c) && !blocked.has(c)).length;
                  const failedMissing = expected.filter((c) => failed.has(c) && !blocked.has(c) && !present.has(c)).length;
                  totalHave += have;
                  totalNeed += expected.filter((c) => !blocked.has(c)).length;
                  summary.failedCells += failedMissing;
                }
                const detail = detailMapFor(hw, model, backend, profile, expected);
                profiles.push({ profile, isMultiTurn, expected, present, blocked, failed, detail, infeasibleReason, infeasibleKind });
              };
              for (const profile of singleProfiles) addProfile(profile, false);
              for (const profile of multiProfiles) addProfile(profile, true);
            }
            const engineVersion = engineVersionByMb.get(mbKey);
            models.push({ kind: 'data', hardware: hw, model, backend, engineVersion, profiles, totalHave, totalNeed });
            summary.totalHave += totalHave;
            summary.totalNeed += totalNeed;
            if (totalNeed === 0) summary.skipped += 1;
            else if (totalHave === totalNeed) summary.complete += 1;
            // A config with ANY successful cell is PARTIAL (has data but
            // incomplete), even when some profiles failed -- e.g. osworld runs
            // for every concurrency while chat fails for all of them. Only a
            // config with zero successful cells is counted (and colored) failed.
            else if (totalHave > 0) summary.partial += 1;
            else if (profiles.some((profile) => (profile.failed?.size ?? 0) > 0)) summary.failed += 1;
            else summary.partial += 1;
            continue;
          }

          if (cell) {
            const failure = blocker?.failure ?? compactJob?.failure ?? classifySweepFailure(cell.failure_metadata);
            const statusReason = stateReason ? String(stateReason) : failureReason(failure);
            const attempt = failure?.attempt ?? cell.attempt;
            const maxAttempts = failure?.max_attempts ?? null;
            if (cell.status === 'known_oom') {
              const profiles = buildStatusProfiles(hw, model, backend, 'oom', statusReason, cell.kind);
              models.push({ kind: 'status', hardware: hw, model, backend, status: 'oom', reason: statusReason, attempt: attempt ?? undefined, maxAttempts, failure, totalNeed: 0, profiles });
              summary.oom += 1;
              continue;
            }
            const infReason = infeasibilityReason(vramFor(hw), weightsFor(model), tpOf(hw), ratio);
            if (infReason) {
              const profiles = buildStatusProfiles(hw, model, backend, 'infeasible', infReason);
              models.push({ kind: 'status', hardware: hw, model, backend, status: 'infeasible', reason: infReason, totalNeed: 0, profiles });
              summary.infeasible += 1;
              continue;
            }
            const baseProfiles = buildStatusProfiles(hw, model, backend, 'untested', statusReason);
            const profileBlockedReason = summarizeReasons(baseProfiles.map((profile) => profile.infeasibleReason));
            if (baseProfiles.length > 0 && baseProfiles.every((profile) => Boolean(profile.infeasibleReason))) {
              models.push({ kind: 'status', hardware: hw, model, backend, status: 'infeasible', reason: profileBlockedReason, attempt: attempt ?? undefined, maxAttempts, failure, totalNeed: 0, profiles: baseProfiles });
              summary.infeasible += 1;
              continue;
            }
            if (cell.status === 'running') {
              const profiles = buildStatusProfiles(hw, model, backend, 'running', statusReason);
              models.push({ kind: 'status', hardware: hw, model, backend, status: 'running', reason: statusReason, attempt: cell.attempt, updatedAt: cell.updated_at, totalNeed: expectedForModel, profiles });
              summary.running += 1;
              summary.totalNeed += expectedForModel;
              continue;
            }
            if (cell.status === 'skipped') {
              const disposition = blocker?.coverage_disposition ?? compactJob?.coverage_disposition;
              if (disposition === 'todo') {
                // Attempted but produced nothing and no OOM was captured: not
                // proven infeasible, so surface as outstanding TODO work.
                const profiles = buildStatusProfiles(hw, model, backend, 'untested', statusReason);
                models.push({ kind: 'status', hardware: hw, model, backend, status: 'untested', reason: statusReason, attempt: attempt ?? undefined, maxAttempts, failure, totalNeed: expectedForModel, profiles });
                summary.untested += 1;
                summary.totalNeed += expectedForModel;
                continue;
              }
              if (shouldCountFailureAsMissing(failure, statusReason, disposition)) {
                const profiles = buildStatusProfiles(hw, model, backend, 'failed', statusReason);
                const failureReasons = Array.from(new Set(
                  profiles.flatMap((profile) => Array.from(profile.failed?.values() ?? [])),
                ));
                const reasonSummary = summarizeReasons(failureReasons, statusReason);
                const failedReason = reasonSummary && expectedForModel > 0
                  ? `failed ${expectedForModel}/${expectedForModel} expected cells${failureReasons.length > 1 ? ` across ${failureReasons.length} failure groups` : ''}; ${reasonSummary}`
                  : reasonSummary;
                models.push({ kind: 'status', hardware: hw, model, backend, status: 'failed', reason: failedReason, attempt: attempt ?? undefined, maxAttempts, failure, totalNeed: expectedForModel, profiles });
                summary.failed += 1;
                summary.totalNeed += expectedForModel;
                summary.failedCells += expectedForModel;
                continue;
              }
              const profiles = buildStatusProfiles(hw, model, backend, 'skipped', statusReason);
              models.push({ kind: 'status', hardware: hw, model, backend, status: 'skipped', reason: statusReason, attempt: attempt ?? undefined, maxAttempts, failure, totalNeed: 0, profiles });
              summary.skipped += 1;
              continue;
            }
            if (cell.status === 'pending' || cell.status === 'done') {
              models.push({ kind: 'status', hardware: hw, model, backend, status: 'untested', reason: statusReason, attempt: attempt ?? undefined, maxAttempts, failure, totalNeed: expectedForModel, profiles: baseProfiles });
              summary.untested += 1;
              summary.totalNeed += expectedForModel;
              continue;
            }
          }

          const infReason = infeasibilityReason(vramFor(hw), weightsFor(model), tpOf(hw), ratio);
          if (infReason) {
            const profiles = buildStatusProfiles(hw, model, backend, 'infeasible', infReason);
            models.push({ kind: 'status', hardware: hw, model, backend, status: 'infeasible', reason: infReason, totalNeed: 0, profiles });
            summary.infeasible += 1;
          } else {
            const profiles = buildStatusProfiles(hw, model, backend, 'untested');
            models.push({ kind: 'status', hardware: hw, model, backend, status: 'untested', totalNeed: expectedForModel, profiles });
            summary.untested += 1;
            summary.totalNeed += expectedForModel;
          }
        }
      }
      // Tone-based cell counts, computed the same way the cells render, so the
      // header chips agree with the grid.
      for (const m of models) {
        for (const p of m.profiles ?? []) {
          for (const c of p.expected) {
            const { visual } = profileCellTone(p, c);
            if (visual === 'red') summary.runtimeFailures += 1;
            else if (visual === 'hw') summary.hwCells += 1;
            else if (visual === 'yellow') summary.blockedCells += 1;
            else if (visual === 'missing') summary.pendingCells += 1;
          }
        }
      }
      hwGroups.push({ hardware: hw, models, summary });
    }

    return { groups: hwGroups, hardwareList: expectedHw };
  }, [allData, blockersState, canonicalCoverage, compactCoverageJobs, coveragePlan, dataScope, gridScope, sweepState, usingCompactCoverage]);

  const [expandedHw, setExpandedHw] = useState<Set<string>>(new Set());
  const [expandedModel, setExpandedModel] = useState<Set<string>>(new Set());
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);

  const toggleHw = (hw: string) => {
    setExpandedHw((prev) => {
      const next = new Set(prev);
      if (next.has(hw)) next.delete(hw); else next.add(hw);
      return next;
    });
  };
  const toggleModel = (key: string) => {
    setExpandedModel((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
    const expandAll = () => {
      setExpandedHw(new Set(groups.map((g) => g.hardware)));
      const keys = new Set<string>();
      for (const g of groups) {
        for (const m of g.models) {
          if (m.kind === 'data' || (m.profiles?.length ?? 0) > 0) {
            keys.add(`${g.hardware}|${m.model}|${m.backend}`);
          }
        }
      }
      setExpandedModel(keys);
    };
  const collapseAll = () => {
    setExpandedHw(new Set());
    setExpandedModel(new Set());
  };

  const allConcs = useMemo(
    () => {
      if (!canonicalCoverage) {
        const observed = new Set<number>();
        for (const r of allData) observed.add(r.config.concurrency);
        return Array.from(observed).sort((a, b) => a - b);
      }
      return Array.from(new Set([...coveragePlan.singleConcs, ...coveragePlan.multiConcs])).sort((a, b) => a - b);
    },
    [allData, canonicalCoverage, coveragePlan],
  );

  if (loading || (dataScope === 'synthetic_distributional' && blockersLoading && !blockersState)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-[#a9afba]">
          {dataScope === 'synthetic_distributional' ? 'Loading compact coverage summary...' : 'Loading coverage data...'}
        </div>
      </div>
    );
  }

  const grand = groups.reduce(
    (acc, g) => {
      acc.complete += g.summary.complete;
      acc.partial += g.summary.partial;
      acc.running += g.summary.running;
      acc.pending += g.summary.pending;
      acc.failed += g.summary.failed;
      acc.skipped += g.summary.skipped;
      acc.oom += g.summary.oom;
      acc.infeasible += g.summary.infeasible;
      acc.untested += g.summary.untested;
      acc.totalHave += g.summary.totalHave;
      acc.totalNeed += g.summary.totalNeed;
      acc.failedCells += g.summary.failedCells;
      acc.runtimeFailures += g.summary.runtimeFailures;
      acc.hwCells += g.summary.hwCells;
      acc.blockedCells += g.summary.blockedCells;
      acc.pendingCells += g.summary.pendingCells;
      return acc;
    },
    { complete: 0, partial: 0, running: 0, pending: 0, failed: 0, skipped: 0, oom: 0, infeasible: 0, untested: 0, totalHave: 0, totalNeed: 0, failedCells: 0, runtimeFailures: 0, hwCells: 0, blockedCells: 0, pendingCells: 0 },
  );
  const optionalPresentCount = dataScope === 'synthetic_distributional'
    ? blockersState?.optional_present_points_count ?? 0
    : 0;
  const displayedHave = dataScope === 'synthetic_distributional'
    ? blockersState?.observed_present_points ?? grand.totalHave
    : grand.totalHave;
  const requiredTotal = dataScope === 'synthetic_distributional'
    ? blockersState?.coverage_required_points ?? grand.totalNeed
    : grand.totalNeed;
  const failedCells = dataScope === 'synthetic_distributional'
    ? blockersState?.coverage_failed_points ?? grand.failedCells
    : grand.failedCells;
  const naAttemptedCells = dataScope === 'synthetic_distributional'
    ? blockersState?.coverage_na_points ?? 0
    : 0;
  const pct = requiredTotal > 0
    ? ((displayedHave / requiredTotal) * 100).toFixed(1)
    : '0.0';
  const cellSummary = !canonicalCoverage
    ? `${grand.totalHave} cells filled`
    : `${displayedHave}/${requiredTotal} fillable filled${optionalPresentCount > 0 ? ` · ${optionalPresentCount} optional` : ''}${naAttemptedCells > 0 ? ` · ${naAttemptedCells} N/A attempted` : ''}${failedCells > 0 ? ` · ${failedCells} failed` : ''}`;
  const primarySummary = !canonicalCoverage ? `${grand.totalHave} cells filled` : `${pct}%`;
  const scopeSummary = dataScope === 'synthetic_distributional'
    ? 'APC-aware synthetic profiles on the active sweep-state grid'
    : dataScope === 'archived'
      ? 'retired canonical, fixed-grid, and MSE runs kept as inventory'
      : 'real trace replay profiles containing full single-turn, short/medium/long multi-turn, and stress workloads';
  const coverageLabel = `${DATA_SCOPE_META[dataScope].shortLabel} coverage`;
  // Provenance (RFC §4.7): surface the artifact's generated_at + a staleness
  // warning so a stale coverage blob can never be silently rendered as truth.
  const coverageGeneratedAt = dataScope === 'synthetic_distributional'
    ? blockersState?.generated_at ?? null
    : null;
  const coverageGenMs = coverageGeneratedAt ? Date.parse(coverageGeneratedAt) : NaN;
  const coverageAgeMin = Number.isFinite(coverageGenMs)
    ? Math.max(0, Math.floor((Date.now() - coverageGenMs) / 60000))
    : null;
  const coverageStale = coverageAgeMin !== null && coverageAgeMin >= COVERAGE_STALE_MINUTES;

  return (
    <div className="space-y-4">
      <div className="glass-shell rounded-lg p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#a9afba]">
              <span className="font-medium uppercase tracking-wide text-[#2dd4bf]">
                {coverageLabel}
              </span>
              <span>{hardwareList.length} hardware targets</span>
              {coverageGeneratedAt && (
                <span
                  className={coverageStale
                    ? 'rounded border border-[#f0883e] bg-[#3a2a12] px-1.5 py-0.5 font-medium text-[#f0883e]'
                    : 'text-[#676c76]'}
                  title={`coverage artifact generated_at ${coverageGeneratedAt}`}
                >
                  {coverageStale
                    ? `⚠ coverage data ${coverageAgeMin}m stale — orchestrator may be stopped`
                    : `coverage fresh · ${coverageAgeMin}m old`}
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-3xl font-semibold text-[#f3f4f6]">{primarySummary}</span>
              {canonicalCoverage && (
                <span className="font-mono text-sm text-[#a9afba]">{cellSummary}</span>
              )}
              <span className="text-xs text-[#a9afba]">{scopeSummary}</span>
            </div>
            <CoverageProgress value={Number(pct)} />
          </div>

          <div className="flex items-center justify-end gap-2">
            <button onClick={expandAll} className="rounded-md border border-[#ffffff1f] bg-white/[0.08] px-3 py-1.5 text-[11px] font-medium text-[#a9afba] transition-colors hover:border-[#2dd4bf] hover:text-[#2dd4bf]">Expand</button>
            <button onClick={collapseAll} className="rounded-md border border-[#ffffff1f] bg-white/[0.08] px-3 py-1.5 text-[11px] font-medium text-[#a9afba] transition-colors hover:border-[#f97583] hover:text-[#f97583]">Collapse</button>
          </div>
        </div>
      </div>

      <CoverageLegend dataScope={dataScope} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="glass-shell min-w-0 overflow-x-auto rounded-lg">
          <table className="min-w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-[#0b0d10]">
              <tr className="border-b border-[#ffffff14] text-[#a9afba]">
                <th className="px-3 py-1.5 text-left font-medium" colSpan={3}></th>
                <th className="px-1.5 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-[#a9afba]" colSpan={allConcs.length}>
                  Concurrency
                </th>
                <th className="px-3 py-1.5 text-right font-medium"></th>
              </tr>
              <tr className="border-b border-[#ffffff14] text-[#a9afba]">
                <th className="w-[116px] px-3 py-2 text-left font-medium">Family</th>
                <th className="w-[220px] px-3 py-2 text-left font-medium">Model</th>
                <th className="px-3 py-2 text-left font-medium">Profile / status</th>
                {allConcs.map((c) => (
                  <th key={c} className="px-1.5 py-2 text-center font-mono font-normal">{c}</th>
                ))}
                <th className="px-3 py-2 text-right font-medium">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const hwOpen = expandedHw.has(g.hardware);
                return (
                  <GroupRows
                    key={g.hardware}
                    group={g}
                    hwOpen={hwOpen}
                    expandedModel={expandedModel}
                    onToggleHw={() => toggleHw(g.hardware)}
                    onToggleModel={toggleModel}
                    allConcs={allConcs}
                    expectedCellsPerModel={coveragePlan.expectedCellsPerModel}
                    onSelectCell={setSelectedCell}
                    selectedCell={selectedCell}
                  />
                );
              })}
            </tbody>
          </table>
        </div>

        <aside className="self-start lg:sticky lg:top-4">
          <CoverageDetailCard cell={selectedCell} onClear={() => setSelectedCell(null)} />
        </aside>
      </div>

    </div>
  );
}

// --- Row renderers ---

interface GroupRowsProps {
  group: HwGroup;
  hwOpen: boolean;
  expandedModel: Set<string>;
  onToggleHw: () => void;
  onToggleModel: (key: string) => void;
  allConcs: number[];
  expectedCellsPerModel: number;
  onSelectCell: (cell: SelectedCell) => void;
  selectedCell: SelectedCell | null;
}

function GroupRows({ group, hwOpen, expandedModel, onToggleHw, onToggleModel, allConcs, expectedCellsPerModel, onSelectCell, selectedCell }: GroupRowsProps) {
  const g = group;
  const pct = g.summary.totalNeed > 0
    ? Math.round((g.summary.totalHave / g.summary.totalNeed) * 100)
    : 0;
  // Chips recomputed in the new terms (failureTone over the points) so the
  // numbers match the cell colors: red = runtime failures, yellow = blocked.
  const chips = ([
    { count: g.summary.complete, label: 'complete', tone: 'good' },
    { count: g.summary.runtimeFailures, label: 'runtime failures', tone: 'danger', title: 'ran but failed (crash / low success / OOM)' },
    { count: g.summary.hwCells, label: 'hardware N/A', tone: 'hardware', title: "hardware genuinely can't (arch / compute capability, e.g. sm < 80)" },
    { count: g.summary.blockedCells, label: 'fixable', tone: 'warn', title: "couldn't run but fixable (model not staged / needs rebuild or upgrade)" },
    { count: g.summary.pendingCells, label: 'pending', tone: 'muted', title: 'expected by the sweep grid; no run yet' },
  ] satisfies Array<{ count: number; label: string; tone: StatusTone; title?: string }>).filter(({ count }) => count > 0);

  return (
    <>
      <tr
        className="cursor-pointer border-b-2 border-t-2 border-[#ffffff1f] bg-[#0b0d10] hover:bg-white/[0.04]"
        onClick={onToggleHw}
      >
        <td colSpan={3} className="px-3 py-2">
          <span className="mr-2 inline-block w-4 text-[#a9afba]">{hwOpen ? '▼' : '▶'}</span>
          <span className="font-mono text-sm font-semibold text-[#a9afba]">{g.hardware}</span>
          <span className="ml-3 inline-flex flex-wrap items-center gap-1.5 text-[#a9afba]">
            {chips.map(({ count, label, tone, title }) => (
              <GroupChip key={label} count={count} label={label} tone={tone} title={title} />
            ))}
          </span>
        </td>
        <td colSpan={allConcs.length} className="px-3 py-2 text-right text-[#a9afba]">
          {g.summary.totalNeed > 0 && (
            <span className={pct === 100 ? 'text-[#3fb950]' : pct === 0 ? 'text-[#a9afba]' : 'text-[#ff9800]'}>
              {g.summary.totalHave}/{g.summary.totalNeed} filled
            </span>
          )}
          {g.summary.runtimeFailures > 0 && (
            <span className="ml-2 text-[#f85149]">
              {g.summary.runtimeFailures} failed
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-right font-mono">
          <span className={pct === 100 ? 'text-[#3fb950]' : pct === 0 ? 'text-[#a9afba]' : 'text-[#ff9800]'}>
            {pct}%
          </span>
        </td>
      </tr>
      {hwOpen && g.models.map((m, index) => {
        const mKey = `${g.hardware}|${m.model}|${m.backend}`;
        const showFamily = index === 0 || modelFamily(g.models[index - 1].model) !== modelFamily(m.model);
        return (
          <ModelRows
            key={mKey}
            hwName={g.hardware}
            model={m}
            showFamily={showFamily}
            open={expandedModel.has(mKey)}
            onToggle={() => onToggleModel(mKey)}
            allConcs={allConcs}
            expectedCellsPerModel={expectedCellsPerModel}
            onSelectCell={onSelectCell}
            selectedCell={selectedCell}
          />
        );
      })}
    </>
  );
}

interface ModelRowsProps {
  hwName: string;
  model: ModelEntry;
  showFamily: boolean;
  open: boolean;
  onToggle: () => void;
  allConcs: number[];
  expectedCellsPerModel: number;
  onSelectCell: (cell: SelectedCell) => void;
  selectedCell: SelectedCell | null;
}

function ModelRows({ hwName, model, showFamily, open, onToggle, allConcs, expectedCellsPerModel, onSelectCell, selectedCell }: ModelRowsProps) {
  const family = modelFamily(model.model);
  // Render one aggregated concurrency column for a model row. Clicking a
  // failing (red/yellow) column selects its representative cell for the card.
  const renderAggCell = (agg: Map<number, ConcAgg>, c: number) => {
    const s = agg.get(c);
    if (!s) return <Cell state="faint" />;
    const rep = s.rep;
    const onClick = rep
      ? () => onSelectCell(buildSelectedCell(hwName, model.model, model.backend, rep.p, rep.c, rep.visual))
      : undefined;
    const title = rep ? rep.p.detail?.get(rep.c)?.label ?? rep.p.failed?.get(rep.c) ?? rep.p.blocked?.get(rep.c) : undefined;
    return <PartialCell present={s.present} expected={s.runnable} failed={s.red} blocked={s.yellow} hw={s.hw} title={title} onClick={onClick} />;
  };

  if (model.kind === 'status') {
    const totalNeed = model.totalNeed ?? expectedCellsPerModel;
    const profiles = model.profiles ?? [];
    const canExpand = profiles.length > 0;
    const requeueMatch = model.reason?.match(/coverage requeue limit reached ([^;]+)/);
    const requeueLabel = model.status === 'failed' && requeueMatch ? `coverage requeue ${requeueMatch[1]}` : null;
    const attemptLabel = model.attempt !== undefined && model.attempt > 0
      ? model.maxAttempts != null
        ? `${model.status === 'failed' ? 'run attempt ' : ''}${model.attempt}/${model.maxAttempts}`
        : `${model.status === 'failed' ? 'run attempt ' : ''}${model.attempt}`
      : null;
    const concStats = aggregateConcs(profiles);
    // Drive the whole row (badge / word / number) by the actual cell tones so it
    // matches the grid: a model-not-staged row reads yellow N/A even though the
    // coarse job disposition is "failed".
    let aggRed = 0;
    let aggYellow = 0;
    let aggHw = 0;
    for (const s of concStats.values()) { aggRed += s.red; aggYellow += s.yellow; aggHw += s.hw; }
    // Precedence: red (ran but failed) > yellow (fixable) > hw (hardware can't).
    // A purely-hardware row (all blue) reads blue; any fixable cell flags yellow.
    const rowTone: CellTone | undefined = aggRed > 0 ? 'red' : aggYellow > 0 ? 'yellow' : aggHw > 0 ? 'hw' : undefined;
    const bg = rowTone === 'red' ? 'bg-[#f85149]/5' : rowTone === 'yellow' ? 'bg-[#ffb74d]/5' : rowTone === 'hw' ? 'bg-[#64b5f6]/5' : bgForStatus(model.status);
    const txt = rowTone === 'red' ? 'text-[#f85149]' : rowTone === 'yellow' ? 'text-[#ffb74d]' : rowTone === 'hw' ? 'text-[#64b5f6]' : colorForStatus(model.status);
    const label = rowTone === 'red' ? 'ran but failed' : rowTone === 'yellow' ? "couldn't run" : rowTone === 'hw' ? "hardware can't" : labelForStatus(model.status);
    return (
      <>
        <tr
          className={`border-b border-[#ffffff14] ${bg} ${canExpand ? 'cursor-pointer hover:bg-white/[0.04]' : ''}`}
          onClick={canExpand ? onToggle : undefined}
        >
          <td className="whitespace-nowrap px-3 py-1.5">
            <FamilyGroupCell family={family} showLabel={showFamily} />
          </td>
          <td className="whitespace-nowrap px-3 py-1.5 text-[#a9afba]">
            <span className={`mr-2 inline-block w-3 ${canExpand ? 'text-[#a9afba]' : 'text-[#ffffff1f]'}`}>
              {canExpand ? (open ? '▼' : '▶') : '·'}
            </span>
            {model.model}
            <BackendBadge backend={model.backend} />
          </td>
          <td className="px-3 py-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <StatusBadge kind={model.status} tone={rowTone} />
              <span className={`font-medium ${txt}`}>{label}</span>
              {profiles.length > 0 && <span className="text-[10px] uppercase tracking-wide text-[#a9afba]">· {profiles.length} profiles</span>}
              {requeueLabel && <span className="text-[#f85149]">· {requeueLabel}</span>}
              {attemptLabel && <span className="text-[#a9afba]">· {attemptLabel}</span>}
              {model.reason && <span className="min-w-[220px] flex-1 whitespace-normal break-words text-[#a9afba]" title={model.reason}>— {model.reason}</span>}
            </div>
          </td>
          {allConcs.map((c) => (
            <td key={c} className="px-1 py-1.5 text-center">{renderAggCell(concStats, c)}</td>
          ))}
          <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono">
            {aggRed > 0 ? (
              <span className="text-[#f85149]" title={model.reason}>0/{totalNeed} failed</span>
            ) : aggYellow > 0 ? (
              <span className="text-[#ffb74d]" title={model.reason}>N/A</span>
            ) : aggHw > 0 ? (
              <span className="text-[#64b5f6]" title={model.reason}>N/A</span>
            ) : model.status === 'untested' || model.status === 'pending' || model.status === 'running' ? (
              <span className="text-[#a9afba]">0/{totalNeed}</span>
            ) : (
              <span className="text-[#a9afba]">—</span>
            )}
          </td>
        </tr>
        {canExpand && open && (
          <ProfileDetailRows
            hwName={hwName}
            modelName={model.model}
            backend={model.backend}
            profiles={profiles}
            allConcs={allConcs}
            onSelectCell={onSelectCell}
            selectedCell={selectedCell}
          />
        )}
      </>
    );
  }

  // model.kind === 'data'
  const rowPct = model.totalNeed > 0 ? Math.round((model.totalHave / model.totalNeed) * 100) : 0;
  // Per-concurrency fill fraction across all profiles. A conc is "full" only
  // when every profile that expects it actually has a run at that conc.
  const concStats = aggregateConcs(model.profiles);

  return (
    <>
      <tr
        className="cursor-pointer border-b border-[#ffffff14] hover:bg-white/[0.04]"
        onClick={onToggle}
      >
        <td className="whitespace-nowrap px-3 py-1.5">
          <FamilyGroupCell family={family} showLabel={showFamily} />
        </td>
        <td className="whitespace-nowrap px-3 py-1.5 text-[#a9afba]">
          <span className="mr-2 inline-block w-3 text-[#a9afba]">{open ? '▼' : '▶'}</span>
          {model.model}
          <BackendBadge backend={model.backend} version={model.engineVersion} />
        </td>
        <td className="whitespace-nowrap px-3 py-1.5 text-[#a9afba]">
          <span className="text-[10px] uppercase tracking-wide">{model.profiles.length} profiles</span>
        </td>
        {allConcs.map((c) => (
          <td key={c} className="px-1 py-1.5 text-center">{renderAggCell(concStats, c)}</td>
        ))}
        <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono">
          {model.totalNeed === 0 ? (
            <span className="text-[#ffb74d]">N/A</span>
          ) : (
            <span
              className={
                rowPct === 100 ? 'text-[#3fb950]' :
                rowPct === 0 ? 'text-[#a9afba]' :
                'text-[#ff9800]'
              }
            >
              {model.totalHave}/{model.totalNeed}
            </span>
          )}
        </td>
      </tr>
      {open && (
        <ProfileDetailRows
          hwName={hwName}
          modelName={model.model}
          backend={model.backend}
          profiles={model.profiles}
          allConcs={allConcs}
          onSelectCell={onSelectCell}
          selectedCell={selectedCell}
        />
      )}
      </>
    );
  }

function ProfileDetailRows({
  hwName,
  modelName,
  backend,
  profiles,
  allConcs,
  onSelectCell,
  selectedCell,
}: {
  hwName: string;
  modelName: string;
  backend: string;
  profiles: ProfileRow[];
  allConcs: number[];
  onSelectCell: (cell: SelectedCell) => void;
  selectedCell: SelectedCell | null;
}) {
  return (
    <>
      {profiles.map((p) => {
        // Recompute badges from failureTone over the cells so the counts match
        // the colored squares exactly (red = ran but failed, yellow = blocked).
        let redCount = 0;
        let yellowCount = 0;
        let hwCount = 0;
        let todoCount = 0;
        let firstRed: CellDetail | undefined;
        let firstYellow: CellDetail | undefined;
        for (const c of p.expected) {
          const { visual, detail } = profileCellTone(p, c);
          if (visual === 'red') { redCount += 1; firstRed = firstRed ?? detail; }
          else if (visual === 'yellow') { yellowCount += 1; firstYellow = firstYellow ?? detail; }
          else if (visual === 'hw') { hwCount += 1; }
          else if (visual === 'missing') todoCount += 1;
        }
        const have = [...p.present].filter((c) => p.expected.includes(c)).length;
        const need = p.infeasibleReason ? 0 : p.expected.length - yellowCount - hwCount;
        const profPct = need > 0 ? Math.round((have / need) * 100) : 0;
        const profUntested = redCount === 0 && yellowCount === 0 && hwCount === 0 && have === 0 && todoCount > 0;
        // Blue "hardware can't" vs yellow "fixable" for the N/A rendering.
        const isHwInfeasible = p.infeasibleKind === 'hw_permanent' || hwCount > 0;
        const todoReason = p.todoReason ?? 'expected by sweep grid; no completed run exists yet';
        const redReason = firstRed?.label ?? firstRed?.reason ?? (p.failed ? Array.from(p.failed.values())[0] : undefined);
        const yellowReason = firstYellow?.label ?? p.infeasibleReason ?? firstYellow?.reason ?? (p.blocked ? Array.from(p.blocked.values())[0] : undefined);
        const displayName = profileDisplayName(p.profile);
        return (
          <tr key={`${hwName}|${modelName}|${backend}|${p.profile}`} className="border-b border-[#ffffff14] bg-[#0b0d10]/50">
            <td className="px-3 py-1.5">
              <span className="inline-block min-w-[82px]" aria-hidden="true" />
            </td>
            <td className="whitespace-nowrap px-3 py-1.5 pl-8 text-[#a9afba]">
              {/* empty — profile rows sit under the model row, matching the predictor table grouping */}
            </td>
            <td className="px-3 py-1.5 text-[#a9afba]">
              <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1">
                <span className="text-[#a9afba]" title={p.profile}>{displayName}</span>
                {displayName !== p.profile && <span className="text-[10px] text-[#676c76]">{p.profile}</span>}
                {p.isMultiTurn && <span className="rounded bg-[#8b5cf6]/20 px-1 text-[10px] text-[#8b5cf6]">mt</span>}
                {redCount > 0 && <span className="rounded border border-[#f85149]/40 bg-[#f85149]/10 px-1 text-[10px] text-[#f85149] uppercase" title={redReason}>{redCount} failed</span>}
                {hwCount > 0 && <span className="rounded border border-[#64b5f6]/40 bg-[#64b5f6]/10 px-1 text-[10px] text-[#64b5f6] uppercase" title={yellowReason}>{hwCount} hardware N/A</span>}
                {yellowCount > 0 && <span className="rounded border border-[#ffb74d]/40 bg-[#ff9800]/10 px-1 text-[10px] text-[#ffb74d] uppercase" title={yellowReason}>{yellowCount} blocked</span>}
                {profUntested && <span className="rounded border border-[#ff9800]/40 bg-[#ff9800]/10 px-1 text-[10px] text-[#ff9800] uppercase" title={todoReason}>TODO</span>}
                {redReason && <span className="min-w-[220px] flex-1 whitespace-normal break-words text-[10px] text-[#a9afba]" title={redReason}>— {redReason}</span>}
                {!redReason && yellowReason && <span className="min-w-[220px] flex-1 whitespace-normal break-words text-[10px] text-[#a9afba]" title={yellowReason}>— {yellowReason}</span>}
                {profUntested && !redReason && !yellowReason && <span className="min-w-[220px] flex-1 whitespace-normal break-words text-[10px] text-[#a9afba]" title={todoReason}>— {todoReason}</span>}
              </div>
            </td>
            {allConcs.map((c) => {
              const { visual, detail } = profileCellTone(p, c);
              const selectable = visual === 'red' || visual === 'yellow' || visual === 'hw' || visual === 'present';
              const onClick = selectable
                ? () => onSelectCell(buildSelectedCell(hwName, modelName, backend, p, c, visual))
                : undefined;
              const active = selectedCell != null
                && selectedCell.hardware === hwName
                && selectedCell.model === modelName
                && selectedCell.backend === backend
                && selectedCell.profile === p.profile
                && selectedCell.concurrency === c;
              const title = detail?.label ?? p.failed?.get(c) ?? p.blocked?.get(c) ?? p.infeasibleReason;
              return <td key={c} className="px-1 py-1.5 text-center"><Cell state={visual} title={title} onClick={onClick} active={active} /></td>;
            })}
            <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono">
              {need === 0 ? (
                <span className={isHwInfeasible ? 'text-[#64b5f6]' : 'text-[#ffb74d]'} title={yellowReason}>N/A</span>
              ) : (
                <span
                  className={
                    profPct === 100 ? 'text-[#3fb950]' :
                    redCount > 0 ? 'text-[#f85149]' :
                    profPct === 0 ? 'text-[#a9afba]' :
                    'text-[#ff9800]'
                  }
                >
                  {have}/{need}{redCount > 0 ? ' failed' : ''}
                </span>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}

// --- UI helpers ---

type StatusTone = 'good' | 'warn' | 'danger' | 'active' | 'todo' | 'muted' | 'hardware';

const TONE_CLASS: Record<StatusTone, string> = {
  good: 'border-[#3fb950]/35 bg-[#3fb950]/10 text-[#3fb950]',
  warn: 'border-[#ffb74d]/35 bg-[#ff9800]/10 text-[#ffb74d]',
  danger: 'border-[#f85149]/35 bg-[#f85149]/10 text-[#f85149]',
  active: 'border-[#58a6ff]/35 bg-[#58a6ff]/10 text-[#58a6ff]',
  todo: 'border-[#ff9800]/35 bg-[#ff9800]/10 text-[#ff9800]',
  muted: 'border-[#ffffff1f] bg-white/[0.04] text-[#a9afba]',
  hardware: 'border-[#64b5f6]/35 bg-[#64b5f6]/10 text-[#64b5f6]',
};

function CoverageProgress({ value }: { value: number }) {
  return (
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#0b0d10]">
      <div
        className="h-full rounded-full bg-[#2dd4bf]"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function GroupChip({
  count,
  label,
  tone,
  title,
}: {
  count: number;
  label: string;
  tone: StatusTone;
  title?: string;
}) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${TONE_CLASS[tone]}`}
      title={title}
    >
      {count} {label}
    </span>
  );
}

function CoverageLegend({ dataScope }: { dataScope: DataScope }) {
  const canonicalCoverage = usesCanonicalCoverage(dataScope);
  const scopeNote = dataScope === 'synthetic_distributional'
    ? 'Synthetic coverage tracks APC-aware synthetic-suffixed profiles on the active sweep-state grid. coding-singleturn is intentionally excluded.'
    : dataScope === 'archived'
      ? 'Archived coverage is inventory-style: it shows retired canonical, fixed-grid, and MSE runs that exist and does not count missing cells.'
      : 'Trace replay coverage is inventory-style: it shows real replay runs that exist and does not count missing legacy cells.';

  return (
    <div className="glass-shell rounded-md px-4 py-3 text-xs text-[#a9afba]">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-medium text-[#a9afba]">Coverage legend</span>
        <span>cells are colored by failure class</span>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,1fr)]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="flex items-center gap-1.5"><Cell state="present" />present</span>
          {canonicalCoverage && (
            <span className="flex items-center gap-1.5"><Cell state="missing" />expected, not run</span>
          )}
          {canonicalCoverage && (
            <span className="flex items-center gap-1.5"><Cell state="red" />ran but failed (crash / low success / OOM)</span>
          )}
          {canonicalCoverage && (
            <span className="flex items-center gap-1.5"><Cell state="hw" />N/A — hardware can't (arch / sm &lt; 80)</span>
          )}
          {canonicalCoverage && (
            <span className="flex items-center gap-1.5"><Cell state="yellow" />couldn't run — fixable (model not staged / needs rebuild or upgrade)</span>
          )}
            <span className="flex items-center gap-1.5">
              <Cell state="faint" />
              {canonicalCoverage ? 'not expected in this row' : 'not observed'}
            </span>
          </div>
        <div className="space-y-1 leading-relaxed">
          <p>{scopeNote}{canonicalCoverage ? ' Red cells ran but failed operationally (engine crash, low success rate, OOM / KV-cache, timeout, driver / CUDA fault). Blue cells are a permanent hardware limit — the GPU physically can’t (unsupported architecture / compute capability, e.g. MXFP4 needs sm80+). Yellow cells could not run but are fixable (model not staged, or the stack needs a rebuild / upgrade / bigger max_len). Click any red, blue, or yellow cell for the full error.' : ''}</p>
        </div>
      </div>
      {dataScope === 'synthetic_distributional' && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-white/10 pt-3">
          <span className="font-medium text-[#a9afba]">Parallelism</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded border border-[#ffffff1f] bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold lowercase text-[#8b949e]">tp</span>
            tensor-parallel
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded border border-[#2dd4bf]/45 bg-[#2dd4bf]/15 px-1.5 py-0.5 text-[10px] font-semibold lowercase text-[#2dd4bf]">tp+ep</span>
            + expert-parallel
          </span>
          <span className="text-[#676c76]">
            planned, not yet run:
            <span className="mx-1 font-mono text-[#8b949e]">ep</span>(expert without tp),
            <span className="mx-1 font-mono text-[#8b949e]">pp</span>(pipeline),
            <span className="mx-1 font-mono text-[#8b949e]">ep+pp</span>
          </span>
        </div>
      )}
    </div>
  );
}

function Cell({ state, title, onClick, active }: { state: CellVisual; title?: string; onClick?: () => void; active?: boolean }) {
  const cls =
    state === 'present' ? 'bg-[#3fb950] border-[#3fb950]' :
    state === 'red' ? 'bg-[#f85149]/30 border-[#f85149]' :
    state === 'yellow' ? 'bg-[#ff9800]/30 border-[#ffb74d]' :
    state === 'hw' ? 'bg-[#64b5f6]/30 border-[#64b5f6]' :
    state === 'missing' ? 'bg-transparent border-[#ffffff1f]' :
    'bg-white/[0.04] border-transparent';
  const interactive = onClick ? ' cursor-pointer hover:ring-1 hover:ring-white/50' : '';
  const ring = active ? ' ring-2 ring-white/70' : '';
  return <span onClick={onClick} className={`inline-block h-3 w-3 rounded-sm border ${cls}${interactive}${ring}`} title={title} />;
}

function BackendBadge({ backend, version }: { backend: string; version?: string }) {
  // MoE rows carry a parallelism marker appended to the backend
  // ("sglang · tp+ep"). Render the engine and the parallelism strategy as two
  // separate badges.
  const parMatch = backend.match(/^(.*) · (tp\+ep|tp)$/);
  const base = parMatch ? parMatch[1] : backend;
  const par = parMatch ? parMatch[2] : null;
  const cls =
    base === 'vllm'   ? 'bg-[#3fb950]/15 text-[#3fb950] border-[#3fb950]/40' :
    base === 'sglang' ? 'bg-[#ffb74d]/15 text-[#ffb74d] border-[#ffb74d]/40' :
                        'bg-white/[0.08] text-[#a9afba] border-[#ffffff1f]';
  // Highlight tp+ep (expert-parallel on); plain tp stays muted.
  const parCls = par === 'tp+ep'
    ? 'bg-[#2dd4bf]/15 text-[#2dd4bf] border-[#2dd4bf]/45'
    : 'bg-white/[0.06] text-[#8b949e] border-[#ffffff1f]';
  return (
    <>
      <span className={`ml-2 rounded border px-1.5 py-0.5 text-[10px] font-medium lowercase tracking-wide ${cls}`}>
        {base}{version ? ` ${version}` : ''}
      </span>
      {par && (
        <span className={`ml-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold lowercase tracking-wide ${parCls}`}>
          {par}
        </span>
      )}
    </>
  );
}

function familyStyle(family: ModelFamily): { chip: string; mark: string } {
  const styles: Record<ModelFamily, { chip: string; mark: string }> = {
    Llama: {
      chip: 'text-[#9ecbff]',
      mark: 'bg-[#58a6ff]',
    },
    Qwen: {
      chip: 'text-[#7ee787]',
      mark: 'bg-[#3fb950]',
    },
    'GPT-OSS': {
      chip: 'text-[#d2a8ff]',
      mark: 'bg-[#d2a8ff]',
    },
    Mixtral: {
      chip: 'text-[#ffb74d]',
      mark: 'bg-[#ffb74d]',
    },
    Gemma: {
      chip: 'text-[#00bcd4]',
      mark: 'bg-[#00bcd4]',
    },
    Granite: {
      chip: 'text-[#f97583]',
      mark: 'bg-[#f97583]',
    },
    Other: {
      chip: 'text-[#a9afba]',
      mark: 'bg-[#a9afba]',
    },
  };
  return styles[family];
}

function FamilyGroupCell({ family, showLabel }: { family: ModelFamily; showLabel: boolean }) {
  const style = familyStyle(family);
  if (!showLabel) {
    return <span className="inline-block min-w-[82px]" aria-hidden="true" />;
  }
  return (
    <span className={`inline-flex min-w-[82px] items-center gap-1.5 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.chip}`}>
      <span className={`h-2 w-2 rounded-sm ${style.mark}`} />
      {family}
    </span>
  );
}

// Aggregate cell for model-row summaries. `expected` = runnable cells at this
// concurrency (present + red + missing); `failed` = red cells; `blocked` =
// yellow cells (couldn't run). Priority: all-blocked -> yellow, no-run-but-
// failed -> red, otherwise green fill proportional to present/runnable.
function PartialCell({
  present,
  expected,
  failed = 0,
  blocked = 0,
  hw = 0,
  title,
  onClick,
}: {
  present: number;
  expected: number;
  failed?: number;
  blocked?: number;
  hw?: number;
  title?: string;
  onClick?: () => void;
}) {
  const click = onClick ? ' cursor-pointer hover:ring-1 hover:ring-white/50' : '';
  if (expected === 0 && blocked > 0) return <span onClick={onClick} className={`inline-block h-3 w-3 rounded-sm border border-[#ffb74d] bg-[#ff9800]/30${click}`} title={title ?? `${blocked} blocked`} />;
  if (expected === 0 && hw > 0) return <span onClick={onClick} className={`inline-block h-3 w-3 rounded-sm border border-[#64b5f6] bg-[#64b5f6]/30${click}`} title={title ?? `${hw} hardware N/A`} />;
  if (expected === 0) return <span className="inline-block h-3 w-3 rounded-sm border border-transparent bg-white/[0.04]" />;
  if (present === 0 && failed > 0) return <span onClick={onClick} className={`inline-block h-3 w-3 rounded-sm border border-[#f85149] bg-[#f85149]/30${click}`} title={title ?? `${failed}/${expected} failed`} />;
  if (present === 0 && blocked > 0) return <span onClick={onClick} className={`inline-block h-3 w-3 rounded-sm border border-[#ffb74d] bg-[#ff9800]/30${click}`} title={title ?? `${blocked} blocked`} />;
  if (present === 0 && hw > 0) return <span onClick={onClick} className={`inline-block h-3 w-3 rounded-sm border border-[#64b5f6] bg-[#64b5f6]/30${click}`} title={title ?? `${hw} hardware N/A`} />;
  if (present === 0) return <span className="inline-block h-3 w-3 rounded-sm border border-[#ffffff1f] bg-transparent" />;
  if (present >= expected) return <span onClick={onClick} className={`inline-block h-3 w-3 rounded-sm border border-[#3fb950] bg-[#3fb950]${click}`} title={title ?? `${present}/${expected}`} />;
  const fillPct = Math.round((present / expected) * 100);
  return (
    <span
      onClick={onClick}
      className={`relative inline-block h-3 w-3 overflow-hidden rounded-sm border border-[#3fb950]/60 bg-transparent${click}`}
      title={title ?? `${present}/${expected}`}
    >
      <span
        className="absolute inset-x-0 bottom-0 bg-[#3fb950]"
        style={{ height: `${fillPct}%` }}
      />
    </span>
  );
}

type BadgeKind = StatusModel['status'];

function StatusBadge({ kind, tone }: { kind: BadgeKind; tone?: CellTone }) {
    const map: Record<BadgeKind, [string, string]> = {
      oom:        ['bg-[#f85149]/15 text-[#f85149] border-[#f85149]/40', 'OOM'],
      infeasible: ['bg-[#ffb74d]/15 text-[#ffb74d] border-[#ffb74d]/40', 'N/A'],
      running:    ['bg-[#58a6ff]/15 text-[#58a6ff] border-[#58a6ff]/40', 'RUN'],
      failed:     ['bg-[#f85149]/15 text-[#f85149] border-[#f85149]/40', 'FAIL'],
      pending:    ['bg-[#ff9800]/10 text-[#ff9800] border-[#ff9800]/40', 'TODO'],
      skipped:  ['bg-[#ffb74d]/15 text-[#ffb74d] border-[#ffb74d]/40', 'N/A'],
      untested:   ['bg-[#ff9800]/10 text-[#ff9800] border-[#ff9800]/40', 'TODO'],
    };
  // Tone override keeps the badge consistent with the cells: a model-not-staged
  // job (coarse status "failed") reads N/A yellow, not FAIL red; a hardware limit
  // reads N/A blue.
  const [cls, label] = tone === 'red'
    ? ['bg-[#f85149]/15 text-[#f85149] border-[#f85149]/40', 'FAIL']
    : tone === 'yellow'
      ? ['bg-[#ffb74d]/15 text-[#ffb74d] border-[#ffb74d]/40', 'N/A']
      : tone === 'hw'
        ? ['bg-[#64b5f6]/15 text-[#64b5f6] border-[#64b5f6]/40', 'N/A']
        : map[kind];
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

function bgForStatus(s: StatusModel['status']): string {
  switch (s) {
    case 'oom':        return 'bg-[#f85149]/5';
    case 'infeasible': return 'bg-[#ffb74d]/5';
    case 'running':    return 'bg-[#58a6ff]/5';
    case 'failed':     return 'bg-[#f85149]/5';
    case 'skipped':  return 'bg-[#ffb74d]/5';
    case 'pending':    return 'bg-[#ff9800]/5';
    default:           return '';
  }
}

function colorForStatus(s: StatusModel['status']): string {
  switch (s) {
    case 'oom':        return 'text-[#f85149]';
    case 'infeasible': return 'text-[#ffb74d]';
    case 'running':    return 'text-[#58a6ff]';
    case 'failed':     return 'text-[#f85149]';
    case 'skipped':  return 'text-[#ffb74d]';
    case 'pending':    return 'text-[#ff9800]';
    default:           return 'text-[#a9afba]';
  }
}

function labelForStatus(s: StatusModel['status']): string {
  switch (s) {
    case 'oom':        return 'ran but failed — OOM / capacity';
    case 'infeasible': return 'not runnable on this target';
    case 'running':    return 'running now';
    case 'failed':     return 'failed after retry';
    case 'skipped':  return 'not applicable / skipped';
    case 'pending':    return 'expected, not run yet';
    default:           return 'expected, not run yet';
  }
}

// --- Side detail card --------------------------------------------------------

const CARD_TONE: Record<SelectedCell['tone'], { strip: string; word: string; text: string }> = {
  red:    { strip: 'bg-[#f85149]', word: 'Runtime failure', text: 'text-[#f85149]' },
  yellow: { strip: 'bg-[#ffb74d]', word: "Couldn't run",     text: 'text-[#ffb74d]' },
  hw:     { strip: 'bg-[#64b5f6]', word: "Hardware — can't", text: 'text-[#64b5f6]' },
  green:  { strip: 'bg-[#3fb950]', word: 'Complete',          text: 'text-[#3fb950]' },
  gray:   { strip: 'bg-[#6b7280]', word: 'Not run yet',       text: 'text-[#a9afba]' },
};

function formatPct(value?: number | null): string | null {
  if (value == null || Number.isNaN(value)) return null;
  return `${Math.round(value * 100)}%`;
}

function CoverageDetailCard({ cell, onClear }: { cell: SelectedCell | null; onClear: () => void }) {
  if (!cell) {
    return (
      <div className="glass-shell rounded-lg border border-[#ffffff14] p-4 text-xs text-[#a9afba]">
        <div className="font-medium text-[#a9afba]">Cell detail</div>
        <p className="mt-2 leading-relaxed text-[#676c76]">Select a failing cell to see why.</p>
      </div>
    );
  }
  const tone = CARD_TONE[cell.tone];
  const ev = cell.evidence;
  const gpuMem = formatPct(ev?.gpu_mem_util ?? null);
  const outputs = ev && (ev.outputs_present != null || ev.outputs_expected != null)
    ? `${ev.outputs_present ?? '?'} / ${ev.outputs_expected ?? '?'}`
    : null;
  const attempts = cell.attempt != null
    ? cell.maxAttempts != null ? `${cell.attempt} / ${cell.maxAttempts}` : `${cell.attempt}`
    : null;
  const successRate = formatPct(ev?.success_rate ?? null);
  const hasEvidence = Boolean(gpuMem || outputs || attempts || successRate);
  return (
    <div className="glass-shell overflow-hidden rounded-lg border border-[#ffffff14]">
      <div className={`h-1 w-full ${tone.strip}`} />
      <div className="space-y-3 p-4 text-xs">
        <div className="flex items-start justify-between gap-2">
          <span className={`text-sm font-semibold ${tone.text}`}>{tone.word}</span>
          <button
            onClick={onClear}
            className="rounded border border-[#ffffff1f] px-1.5 py-0.5 text-[10px] text-[#a9afba] transition-colors hover:border-[#f97583] hover:text-[#f97583]"
          >
            clear
          </button>
        </div>

        <div className="font-mono text-[11px] leading-relaxed text-[#a9afba]">
          {cell.hardware} · {cell.model} · {cell.backend} · {profileDisplayName(cell.profile)} · C={cell.concurrency}
        </div>

        {cell.infeasibleKind && (
          <div>
            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${cell.infeasibleKind === 'hw_permanent' ? 'border-[#64b5f6]/40 bg-[#64b5f6]/10 text-[#64b5f6]' : 'border-[#ffb74d]/40 bg-[#ff9800]/10 text-[#ffb74d]'}`}>
              {cell.infeasibleKind === 'hw_permanent' ? 'Hardware — unsupported (arch / compute capability)' : 'Fixable — env / version (rebuild / upgrade / bump limit)'}
            </span>
          </div>
        )}

        {cell.failureClass && (
          <div>
            <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${cell.tone === 'red' ? 'border-[#f85149]/40 bg-[#f85149]/10 text-[#f85149]' : cell.tone === 'hw' ? 'border-[#64b5f6]/40 bg-[#64b5f6]/10 text-[#64b5f6]' : 'border-[#ffb74d]/40 bg-[#ff9800]/10 text-[#ffb74d]'}`}>
              {cell.failureClass}
            </span>
          </div>
        )}

        {(cell.label || cell.reason) && (
          <div className="space-y-1 leading-relaxed text-[#c9d1d9]">
            {cell.label && <p className="font-medium">{cell.label}</p>}
            {cell.reason && cell.reason !== cell.label && <p className="text-[#a9afba]">{cell.reason}</p>}
          </div>
        )}

        {cell.explanation && cell.explanation !== cell.reason && cell.explanation !== cell.label && (
          <p className="whitespace-pre-wrap break-words leading-relaxed text-[#8b949e]">{cell.explanation}</p>
        )}

        {cell.tone === 'green' && !cell.label && !cell.reason && (
          <p className="leading-relaxed text-[#a9afba]">This cell ran and produced complete results.</p>
        )}

        {hasEvidence && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-[#ffffff14] pt-2 text-[10px] text-[#a9afba]">
            {gpuMem && (<><span className="text-[#676c76]">gpu_mem_util</span><span className="text-right font-mono">{gpuMem}</span></>)}
            {successRate && (<><span className="text-[#676c76]">success_rate</span><span className="text-right font-mono">{successRate}</span></>)}
            {outputs && (<><span className="text-[#676c76]">outputs</span><span className="text-right font-mono">{outputs}</span></>)}
            {attempts && (<><span className="text-[#676c76]">attempts</span><span className="text-right font-mono">{attempts}</span></>)}
          </div>
        )}

        {cell.remoteLog && (
          <div className="border-t border-[#ffffff14] pt-2">
            <div className="text-[10px] text-[#676c76]">remote_log</div>
            <div className="break-all font-mono text-[10px] text-[#8b949e]">{cell.remoteLog}</div>
          </div>
        )}
      </div>
    </div>
  );
}
