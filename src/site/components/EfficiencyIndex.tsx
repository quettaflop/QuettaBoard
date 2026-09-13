import { useEffect, useMemo, useState } from 'react';
import {
  DOMAINS,
  INDEX_VERSION,
  LOAD_WEIGHTS,
  type Domain,
  type HardwareFamily,
  type IndexRow,
} from '../efficiency/score';
import {
  buildEngineIndex,
  buildHardwareIndex,
  buildModelIndex,
  configTcoUsdPerMTok,
  modelNames,
} from '../efficiency/indexes';
import { AA_INDEX_VERSION, AA_RETRIEVED, FLOPS_PER_PARAM } from '../efficiency/models';
import { EFFICIENCY_SNAPSHOT } from '../efficiency/snapshot';
import {
  AVG_USD_PER_KWH,
  HARDWARE_PURCHASE,
  OPENROUTER_LLAMA31_8B,
  TCO_HORIZON_YEARS,
  TCO_PUE,
  TCO_UTILIZATION,
  TOM_SAWYER_ELECTRICITY_SOURCE,
  amortSchedule,
  gpuTco,
  impliedGrossMargin,
} from '../efficiency/tco';
import {
  EngineCostPlot,
  HardwareCostPlot,
  ModelEfficiencyPlot,
  engineLabel,
  formatMult,
  formatUsd,
} from './IndexPlots';
import { SiteNav } from './SiteNav';

type Board = 'hardware' | 'configs';
type EngineFilter = 'all' | 'vllm' | 'sglang';

const DOMAIN_LABEL: Record<Domain, string> = {
  chat: 'Chat',
  coding: 'Coding',
  terminal: 'Terminal',
  computerUse: 'Computer-use',
};

const FAMILIES: HardwareFamily[] = ['H100', 'A100', '3090', '2080 Ti'];
const PAGE_SIZE = 10;

interface MarketCheck {
  min: number;
  median: number;
  max: number;
  n: number;
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function ScoreCell({ value }: { value: number | null }) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="text-[var(--ink-3)]">—</span>;
  }
  return (
    <span className="idx-score">
      <span className="idx-score-n mono-nums">{value.toFixed(1)}</span>
      <span className="idx-score-track" aria-hidden>
        <span className="idx-score-fill" style={{ width: `${value}%` }} />
      </span>
    </span>
  );
}

function RankBar({ value }: { value: number }) {
  return (
    <span className="idx-rank-bar" aria-hidden>
      <span className="idx-rank-fill" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </span>
  );
}

function formatTokenYield(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return value.toFixed(0);
}

function RowChev() {
  return <span className="idx-chev" aria-hidden />;
}

export function EfficiencyIndex() {
  const snap = EFFICIENCY_SNAPSHOT;
  const [board, setBoard] = useState<Board>('hardware');
  const [model, setModel] = useState<string>(() => {
    const names = modelNames(snap.rows);
    return names.includes('Llama-3.1-8B') ? 'Llama-3.1-8B' : (names[0] ?? '');
  });
  const [family, setFamily] = useState<HardwareFamily | 'all'>('all');
  const [engine, setEngine] = useState<EngineFilter>('all');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);

  const hardware = useMemo(() => buildHardwareIndex(snap.rows), [snap.rows]);
  const engines = useMemo(() => buildEngineIndex(snap.rows), [snap.rows]);
  const modelIndex = useMemo(() => buildModelIndex(snap.rows), [snap.rows]);
  const models = useMemo(() => modelNames(snap.rows), [snap.rows]);

  useEffect(() => {
    setPage(0);
    setOpen(null);
  }, [board, model, family, engine]);

  const modelRows = useMemo(() => {
    const filtered = snap.rows.filter((r) => {
      if (r.model !== model) return false;
      if (family !== 'all' && r.hardwareFamily !== family) return false;
      if (engine !== 'all' && r.engine !== engine) return false;
      return true;
    });
    return [...filtered].sort(
      (a, b) =>
        a.raw.tcoUsdPerMTok - b.raw.tcoUsdPerMTok ||
        b.efficiency - a.efficiency ||
        a.id.localeCompare(b.id),
    );
  }, [snap.rows, model, family, engine]);

  const pageCount = Math.max(1, Math.ceil(modelRows.length / PAGE_SIZE));
  const pageIndex = Math.min(page, pageCount - 1);
  const pageRows = modelRows.slice(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE);
  const from = modelRows.length === 0 ? 0 : pageIndex * PAGE_SIZE + 1;
  const to = Math.min(modelRows.length, pageIndex * PAGE_SIZE + PAGE_SIZE);

  const llamaTco = useMemo(() => {
    const xs = snap.rows
      .filter((r) => r.model === OPENROUTER_LLAMA31_8B.model)
      .map((r) => configTcoUsdPerMTok(r))
      .filter((n): n is number => n != null);
    if (xs.length === 0) return null;
    return {
      min: Math.min(...xs),
      median: median(xs),
      max: Math.max(...xs),
      n: xs.length,
    };
  }, [snap.rows]);

  return (
    <>
      <SiteNav page="efficiency" />
      <header className="idx-page-head shell shell-wide pb-8 pt-12 sm:pb-10 sm:pt-14">
        <p className="eyebrow">QuettaBench · Index v{INDEX_VERSION}</p>
        <h1 className="mt-3 max-w-[22ch] text-[clamp(1.85rem,3.6vw,2.65rem)] leading-[1.2]">
          Hardware Cost Index
        </h1>
        <p className="mt-5 max-w-[40rem] text-[1.05rem] leading-relaxed">
          For a fixed workload mix, how many output tokens does each hardware
          dollar buy over three years? Compare hardware first, then select a
          model to inspect its measured hardware × engine configurations.
        </p>
        <p className="mt-3 text-[13px] text-[var(--ink-3)]">
          Snapshot {snap.sourceModified} · {snap.n} configs · loads 1 / 40 / 160
        </p>
      </header>

      <section className="shell shell-wide pb-20">
        <div className="idx-tabs" role="tablist" aria-label="Index board">
          {([
            ['hardware', 'Hardware'],
            ['configs', 'Configs'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`idx-tab-${id}`}
              aria-controls={`idx-panel-${id}`}
              aria-selected={board === id}
              onClick={() => setBoard(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {board === 'hardware' && (
          <div
            id="idx-panel-hardware"
            role="tabpanel"
            aria-labelledby="idx-tab-hardware"
          >
            <HardwareBoard rows={hardware} engines={engines} llamaTco={llamaTco} />
          </div>
        )}
        {board === 'configs' && (
          <div
            id="idx-panel-configs"
            role="tabpanel"
            aria-labelledby="idx-tab-configs"
          >
            <ConfigBoard
              models={models}
              model={model}
              setModel={setModel}
              family={family}
              setFamily={setFamily}
              engine={engine}
              setEngine={setEngine}
              rows={modelRows}
              pageRows={pageRows}
              pageIndex={pageIndex}
              pageCount={pageCount}
              from={from}
              to={to}
              setPage={setPage}
              open={open}
              setOpen={setOpen}
              llamaTco={llamaTco}
            />
          </div>
        )}

        <ExperimentalModel
          rows={modelIndex}
          onSelect={(nextModel) => {
            setModel(nextModel);
            setBoard('configs');
          }}
        />
        <Methodology />
      </section>
    </>
  );
}

function ExperimentalModel({
  rows,
  onSelect,
}: {
  rows: ReturnType<typeof buildModelIndex>;
  onSelect: (model: string) => void;
}) {
  return (
    <details className="idx-experimental">
      <summary>
        <span className="idx-experimental-summary-copy">
          <span className="eyebrow">Experimental · secondary analysis</span>
          <span className="idx-experimental-summary-title">Model efficiency</span>
          <span className="idx-experimental-summary-note">
            Intelligence per approximate decode FLOP. Structurally favors
            smaller and fewer-active models; never used in Hardware scoring.
          </span>
        </span>
        <span className="idx-experimental-summary-action" aria-hidden>
          <span className="idx-experimental-action-label" />
          <span className="idx-experimental-chevron" />
        </span>
      </summary>
      <div className="idx-experimental-body">
        <div className="idx-experimental-guardrail">
          <p className="eyebrow">Interpretation · not a scoring input</p>
          <p>
            <strong>Smaller or fewer-active models structurally win this ratio.</strong>
            {' '}It measures intelligence against approximate decode work, not
            serving quality or cost. It never affects Hardware or engine
            scoring; Artificial Analysis already provides intelligence per dollar.
          </p>
          <p className="idx-experimental-basis mono-nums">
            I / ({FLOPS_PER_PARAM} × active parameters) · AA Index v{AA_INDEX_VERSION}
            {' '}· retrieved {AA_RETRIEVED}
          </p>
        </div>
        <div className="idx-plots idx-experimental-plots">
          <ModelEfficiencyPlot rows={rows} onSelect={onSelect} />
        </div>
        <p className="idx-experimental-footnote">
          * AA estimate. Active parameters are used for MoE models. Select any
          model row to open its measured hardware × engine configurations.
        </p>
      </div>
    </details>
  );
}

function OpenRouterCheck({
  llamaTco,
}: {
  llamaTco: MarketCheck | null;
}) {
  if (llamaTco == null) return null;
  const market = OPENROUTER_LLAMA31_8B.usdPerMTokOut;
  const margin = impliedGrossMargin(llamaTco.min, market);
  return (
    <aside className="idx-check">
      <header>
        <p className="eyebrow">External market signal</p>
        <h3>
          Llama-3.1-8B on OpenRouter
        </h3>
        <p>Listed output price · {OPENROUTER_LLAMA31_8B.asOf}</p>
      </header>
      <dl className="idx-check-grid">
        <div>
          <dt>Self-hosted floor</dt>
          <dd className="mono-nums">{formatUsd(llamaTco.min)}/M</dd>
        </div>
        <div>
          <dt>API list price</dt>
          <dd className="mono-nums">
            <a href={OPENROUTER_LLAMA31_8B.href}>{formatUsd(market)}/M</a>
          </dd>
        </div>
        <div>
          <dt>Margin at list</dt>
          <dd className="mono-nums">
            {margin == null ? '—' : `${(margin * 100).toFixed(0)}%`}
          </dd>
        </div>
      </dl>
      <p className="idx-check-range">
        <span>Self-hosted sample</span>
        <strong className="mono-nums">
          {formatUsd(llamaTco.min)}–{formatUsd(llamaTco.max)}/M
        </strong>
        <span className="mono-nums">
          median {formatUsd(llamaTco.median)}/M · {llamaTco.n} configs
        </span>
      </p>
      <p className="idx-check-note">
        A dated market sanity check only. API pooling and provider margin make
        this non-comparable to self-hosted TCO and not a sale price.
      </p>
    </aside>
  );
}

function HardwareBoard({
  rows,
  engines,
  llamaTco,
}: {
  rows: ReturnType<typeof buildHardwareIndex>;
  engines: ReturnType<typeof buildEngineIndex>;
  llamaTco: MarketCheck | null;
}) {
  const [open, setOpen] = useState<HardwareFamily | null>(null);

  return (
    <>
      <div className="idx-hardware-layout">
        <section className="idx-leaderboard" aria-labelledby="idx-leaderboard-title">
          <header className="idx-section-head">
            <p className="eyebrow">Absolute ranking · full balanced panel</p>
            <h2 id="idx-leaderboard-title">Output tokens bought per dollar</h2>
            <p>
              Lower $/M and higher token yield are better. Open a row for panel
              coverage and ownership cost basis.
            </p>
          </header>

          <ol className="idx-table idx-board">
            <li className="idx-rank idx-rank-head" aria-hidden>
              <span className="idx-rank-n"></span>
              <span className="idx-rank-name">GPU</span>
              <span className="idx-rank-usd">3-year $ / M</span>
              <span className="idx-rank-output">Token yield</span>
              <span className="idx-rank-match">Matched evidence</span>
            </li>
            {rows.map((r, i) => {
              const t = gpuTco(r.family);
              const spec = HARDWARE_PURCHASE[r.family];
              const expanded = open === r.family;
              const matchState = r.family === 'H100'
                ? 'baseline'
                : r.vsH100 == null
                  ? 'withheld'
                  : 'supported';
              return (
                <li key={r.family} className="idx-row-wrap">
                  <button
                    type="button"
                    className="idx-rank"
                    aria-expanded={expanded}
                    aria-label={`${r.family}, rank ${i + 1}, ${formatTokenYield(r.tokPerDollar)} output tokens per dollar, ${formatUsd(r.usdPerMTok)} per million output tokens. ${
                      r.family === 'H100'
                        ? `H100 reference across ${r.nMatchedModels} models.`
                        : r.vsH100 == null
                          ? `Relative comparison withheld with ${r.nMatchedModels} matched models.`
                          : `${formatMult(r.vsH100)} H100 value across ${r.nMatchedModels} exact-matched models.`
                    } ${expanded ? 'Hide' : 'Show'} assumptions`}
                    onClick={() => setOpen(expanded ? null : r.family)}
                  >
                    <span className="idx-rank-n mono-nums">{i + 1}</span>
                    <span className="idx-rank-name">
                      <span className="idx-rank-title">
                        <span>{r.family}</span>
                        {i === 0 && <span className="idx-leader-label">Lowest cost</span>}
                      </span>
                    </span>
                    <span className="idx-rank-usd">
                      <span className="mono-nums">{formatUsd(r.usdPerMTok)}</span>
                      <small>/ M output</small>
                    </span>
                    <span className="idx-rank-output">
                      <span className="idx-rank-yield">
                        <span className="mono-nums">{formatTokenYield(r.tokPerDollar)}</span>
                        <small>tokens / $</small>
                      </span>
                      <RankBar value={r.score} />
                    </span>
                    <span className="idx-rank-match" data-state={matchState}>
                      <span>
                        {r.family === 'H100'
                          ? 'Reference'
                          : r.vsH100 == null
                            ? 'Withheld'
                            : 'Supported'}
                      </span>
                      <small>
                        {r.family === 'H100'
                          ? `${r.nMatchedModels} measured models`
                          : r.vsH100 == null
                            ? `${r.nMatchedModels} of 3 required`
                            : `${r.nMatchedModels} matched models`}
                      </small>
                    </span>
                    <RowChev />
                  </button>
                  <div className="expand" data-open={expanded ? 'true' : 'false'}>
                    <div>
                      <div className="expand-inner idx-detail">
                        <div className="idx-detail-basis">
                          <div>
                            <span>Full-panel coverage</span>
                            <strong>
                              {r.nModels} models · {r.nConfigs} configs
                            </strong>
                            <small>{r.minGpus}–{r.maxGpus} GPUs observed</small>
                          </div>
                          <div data-state={matchState}>
                            <span>Separate matched panel</span>
                            <strong>
                              {r.family === 'H100'
                                ? 'H100 reference'
                                : r.vsH100 == null
                                  ? 'Relative claim withheld'
                                  : `${formatMult(r.vsH100)} H100 value`}
                            </strong>
                            <small>
                              {r.family === 'H100'
                                ? `${r.nMatchedModels} measured models define the reference.`
                                : r.vsH100 == null
                                  ? `${r.nMatchedModels} exact-matched models; 3 required to publish.`
                                  : `${r.nMatchedModels} exact-matched models. Exact model, engine, quantization, GPU-width, workload and load.`}
                            </small>
                          </div>
                        </div>
                        <p className="idx-detail-tco-label">
                          3-year GPU ownership basis
                        </p>
                        <dl>
                          <div>
                            <dt>Purchase</dt>
                            <dd className="mono-nums">{formatUsd(t.purchaseUsd, 0)}</dd>
                          </div>
                          <div>
                            <dt>Residual @ 3y</dt>
                            <dd className="mono-nums">{formatUsd(t.residualUsd, 0)}</dd>
                          </div>
                          <div>
                            <dt>Amort / year</dt>
                            <dd className="mono-nums">{formatUsd(t.amortUsdPerYear, 0)}</dd>
                          </div>
                          <div>
                            <dt>Electricity / year</dt>
                            <dd className="mono-nums">{formatUsd(t.electricUsdPerYear, 0)}</dd>
                          </div>
                          <div>
                            <dt>3-year GPU TCO</dt>
                            <dd className="mono-nums">{formatUsd(t.tcoUsd, 0)}</dd>
                          </div>
                          <div>
                            <dt>TCO / GPU-hr</dt>
                            <dd className="mono-nums">{formatUsd(t.usdPerHour, 3)}</dd>
                          </div>
                          <div>
                            <dt>Board power</dt>
                            <dd className="mono-nums">{t.tdpW} W</dd>
                          </div>
                        </dl>
                        <p className="idx-detail-source">
                          Purchase basis ·{' '}
                          <a href={spec.href} className="underline-offset-2 hover:underline">
                            {spec.source}
                          </a>
                        </p>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <div className="idx-evidence-match">
          <HardwareCostPlot
            rows={rows}
            selected={open}
            onSelect={(family) => setOpen(open === family ? null : family)}
          />
        </div>
        <OpenRouterCheck llamaTco={llamaTco} />
        <div className="idx-evidence-engine">
          <EngineCostPlot rows={engines} />
        </div>
      </div>
    </>
  );
}

function ConfigBoard({
  models,
  model,
  setModel,
  family,
  setFamily,
  engine,
  setEngine,
  rows,
  pageRows,
  pageIndex,
  pageCount,
  from,
  to,
  setPage,
  open,
  setOpen,
  llamaTco,
}: {
  models: string[];
  model: string;
  setModel: (m: string) => void;
  family: HardwareFamily | 'all';
  setFamily: (f: HardwareFamily | 'all') => void;
  engine: EngineFilter;
  setEngine: (e: EngineFilter) => void;
  rows: IndexRow[];
  pageRows: IndexRow[];
  pageIndex: number;
  pageCount: number;
  from: number;
  to: number;
  setPage: (n: number | ((p: number) => number)) => void;
  open: string | null;
  setOpen: (id: string | null) => void;
  llamaTco: MarketCheck | null;
}) {
  return (
    <>
      <div className="idx-toolbar mt-6">
        <label className="idx-select-wrap">
          <span className="sr-only">Model</span>
          <select
            className="idx-select"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <div className="idx-toolbar-chips" data-label="GPU">
          <button
            type="button"
            onClick={() => setFamily('all')}
            className={`idx-chip ${family === 'all' ? 'idx-chip-on' : ''}`}
          >
            All
          </button>
          {FAMILIES.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFamily(f)}
              className={`idx-chip ${family === f ? 'idx-chip-on' : ''}`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="idx-toolbar-chips" data-label="Engine">
          {([
            ['all', 'All'],
            ['vllm', 'vLLM'],
            ['sglang', 'SGLang'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setEngine(id)}
              className={`idx-chip ${engine === id ? 'idx-chip-on' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-5 text-[12px] text-[var(--ink-3)]">
        {rows.length === 0 ? '0 configs' : `${from}–${to} of ${rows.length}`}
        {model === OPENROUTER_LLAMA31_8B.model && llamaTco != null && (
          <>
            {' '}
            · median TCO {formatUsd(llamaTco.median)}/M vs{' '}
            <a href={OPENROUTER_LLAMA31_8B.href} className="underline-offset-2 hover:underline">
              OpenRouter {formatUsd(OPENROUTER_LLAMA31_8B.usdPerMTokOut)}/M
            </a>
          </>
        )}
      </p>

      {rows.length === 0 ? (
        <p className="mt-8 text-[15px] text-[var(--ink-2)]">
          No configurations match these filters.
        </p>
      ) : (
        <ol className="idx-table">
          <li className="idx-head idx-head-cfg" aria-hidden>
            <span>#</span>
            <span>Configuration</span>
            <span>$ / M tok</span>
            <span>tok/s</span>
            <span className="idx-config-gpus">GPUs</span>
          </li>
          {pageRows.map((r, i) => {
            const rank = pageIndex * PAGE_SIZE + i + 1;
            const expanded = open === r.id;
            const tco = configTcoUsdPerMTok(r);
            return (
              <li key={r.id} className="idx-row-wrap">
                <button
                  type="button"
                  className="idx-row idx-row-cfg"
                  data-tco={tco ?? undefined}
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : r.id)}
                >
                  <span className="mono-nums text-[var(--ink-3)]">{rank}</span>
                  <span className="min-w-0 text-left">
                    <span className="block truncate text-[14px] text-[var(--ink)]">
                      {r.hardwareFamily} · {engineLabel(r.engine)}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-[var(--ink-3)]">
                      {r.quant} · {r.gpus} GPU{r.gpus === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span className="mono-nums text-[14px]">{formatUsd(tco)}</span>
                  <span className="mono-nums text-[14px]">
                    {r.raw.tokPerSec == null ? '—' : r.raw.tokPerSec.toFixed(1)}
                  </span>
                  <span className="idx-config-gpus mono-nums text-[14px]">{r.gpus}</span>
                  <RowChev />
                </button>
                <div className="expand" data-open={expanded ? 'true' : 'false'}>
                  <div>
                    <div className="expand-inner idx-detail">
                      <dl>
                        <div>
                          <dt>Median TPOT</dt>
                          <dd className="mono-nums">
                            {r.raw.tpotMs != null ? `${r.raw.tpotMs.toFixed(1)} ms` : '—'}
                          </dd>
                        </div>
                        <div>
                          <dt>Median TTFT</dt>
                          <dd className="mono-nums">
                            {r.raw.ttftMs != null ? `${r.raw.ttftMs.toFixed(1)} ms` : '—'}
                          </dd>
                        </div>
                        <div>
                          <dt>Output</dt>
                          <dd className="mono-nums">
                            {r.raw.tokPerSec != null ? `${r.raw.tokPerSec.toFixed(1)} tok/s` : '—'}
                          </dd>
                        </div>
                        <div>
                          <dt>TCO $ / M tok</dt>
                          <dd className="mono-nums">{formatUsd(tco)}</dd>
                        </div>
                        <div>
                          <dt>Runs</dt>
                          <dd className="mono-nums">{r.raw.runCount}</dd>
                        </div>
                        <div>
                          <dt>Loads used</dt>
                          <dd className="mono-nums">{r.raw.loadsUsed.join(' / ')}</dd>
                        </div>
                      </dl>
                      <div className="idx-detail-scores">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-[12px] text-[var(--ink-3)]">Composite speed</span>
                          <ScoreCell value={r.efficiency} />
                        </div>
                        {DOMAINS.map((d) => (
                          <div key={d} className="flex items-center justify-between gap-4">
                            <span className="text-[12px] text-[var(--ink-3)]">{DOMAIN_LABEL[d]}</span>
                            <ScoreCell value={r.domains[d]} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {rows.length > PAGE_SIZE && (
        <nav className="idx-pager" aria-label="Index pages">
          <button
            type="button"
            className="idx-chip"
            disabled={pageIndex === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Prev
          </button>
          {Array.from({ length: pageCount }, (_, i) => (
            <button
              key={i}
              type="button"
              className={`idx-chip ${i === pageIndex ? 'idx-chip-on' : ''}`}
              aria-current={i === pageIndex ? 'page' : undefined}
              onClick={() => {
                setPage(i);
                setOpen(null);
              }}
            >
              {i + 1}
            </button>
          ))}
          <button
            type="button"
            className="idx-chip"
            disabled={pageIndex === pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            Next
          </button>
        </nav>
      )}
    </>
  );
}

function Methodology() {
  return (
    <details className="idx-method mt-16 border-t border-[var(--line)] pt-8">
      <summary>How the boards are built</summary>
      <p>
        Hardware is the product: secondary-market purchase minus residual,
        plus three years of electricity, divided by measured output. The
        reduction order is workload/load → config → engine within model →
        equal-weight models → hardware family. Config speed remains diagnostic.
      </p>

      <div className="idx-method-grid">
        <div>
          <h3>1. Cell (speed)</h3>
          <p className="idx-formula">
            cell<sub>c</sub> = (1/TPOT · 1/TTFT · tok/s)<sup>1/3</sup>
          </p>
          <p>
            c ∈ {'{'}1, 40, 160{'}'} with weights {LOAD_WEIGHTS[1]}/{LOAD_WEIGHTS[40]}/
            {LOAD_WEIGHTS[160]}. If c is missing, use the nearest run in
            [1, 5], [20, 80], or [120, 256]. Used on config rows only.
          </p>
        </div>
        <div>
          <h3>2. Domain → speed</h3>
          <p className="idx-formula">
            s<sub>D</sub> = 1 + 99 · ln(raw<sub>D</sub> / min<sub>D</sub>) / ln(max<sub>D</sub> / min<sub>D</sub>)
          </p>
          <p>
            Chat = ShareGPT. Coding = SWE-bench. Terminal = TerminalBench.
            Computer-use = OSWorld. Config speed is the mean of present
            s<sub>D</sub>.
          </p>
        </div>
        <div>
          <h3>3. GPU-hour TCO</h3>
          <p className="idx-formula">
            r = (P − R) / (3 · 8760) + (TDP/1000) · e
          </p>
          <p>
            P is the secondary purchase. R is the residual after three
            years. e = {AVG_USD_PER_KWH.toFixed(4)} $/kWh — mean of
            DumpsterCluster Table 4 (China 0.0556, US 0.12, Brazil 0.125),
            not a country. Utilization = {(TCO_UTILIZATION * 100).toFixed(0)}%;
            PUE = {TCO_PUE.toFixed(1)}. Host, networking, cooling and other
            system costs are excluded. The meeting&apos;s “Tom Sawyer” source
            {TOM_SAWYER_ELECTRICITY_SOURCE == null
              ? ' could not be identified and contributes no value.'
              : '.'}
          </p>
        </div>
        <div>
          <h3>4. $ / M tok</h3>
          <p className="idx-formula">
            $ / M<sub>cell</sub> = (r · n<sub>GPU</sub> · 10<sup>6</sup>) / (tok/s<sub>cell</sub> · 3600)
          </p>
          <p>
            This is frozen for each model × hardware × engine × profile ×
            target-load cell. Loads use 25/50/25 weights; the two Chat
            profiles are averaged inside Chat; the four domains are equal.
          </p>
        </div>
        <div>
          <h3>5. Hardware Index</h3>
          <p className="idx-formula">
            $̄<sub>M</sub> = mean<sub>engine</sub>(mean configs) · $̄ = mean<sub>M</sub> $̄<sub>M</sub>
          </p>
          <p>
            Extra configurations do not give a model or engine extra weight.
            “vs H100” uses only exact model, engine, quantization, GPU-width,
            workload and load matches. Fewer than three matched models
            suppresses the relative claim; coverage and observed widths show.
          </p>
        </div>
        <div>
          <h3>6. Engines (same TCO)</h3>
          <p className="idx-formula">
            $̄<sub>F</sub> = mean models on F · $̄ = mean<sub>F</sub> $̄<sub>F</sub>
          </p>
          <p>
            vLLM and SGLang use only model × hardware-family pairs observed
            on both engines, then equal-weight models and families. This is
            subordinate to Hardware, not another composite index.
          </p>
        </div>
        <div>
          <h3>7. OpenRouter market check</h3>
          <p>
            Matching Llama-3.1-8B configurations report range and median
            beside dated output-only API pricing. API pooling and provider
            margin make this a sanity check, not a TCO validation or sale price.
          </p>
        </div>
        <div>
          <h3>8. Experimental models</h3>
          <p className="idx-formula">
            I / GFLOP = I / ({FLOPS_PER_PARAM} · N<sub>active</sub>)
          </p>
          <p>
            AA Intelligence Index v{AA_INDEX_VERSION}, retrieved {AA_RETRIEVED}.
            Smaller/fewer-active models structurally win; AA already covers
            intelligence per dollar. This view never affects hardware scoring.
          </p>
        </div>
      </div>

      <h3 className="mt-10">Assumed P and R</h3>
      <table className="idx-rates">
        <thead>
          <tr>
            <th>GPU</th>
            <th>P</th>
            <th>R @ 3y</th>
            <th>TDP</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {(Object.keys(HARDWARE_PURCHASE) as HardwareFamily[]).map((k) => {
            const spec = HARDWARE_PURCHASE[k];
            return (
              <tr key={k}>
                <td>{k}</td>
                <td className="mono-nums">{formatUsd(spec.usd, 0)}</td>
                <td className="mono-nums">{formatUsd(spec.usd * spec.residualFrac, 0)}</td>
                <td className="mono-nums">{spec.tdpW} W</td>
                <td>
                  <a href={spec.href} className="underline-offset-2 hover:underline">
                    {spec.source}
                  </a>
                  <br />
                  <span>{spec.asOf} · {spec.condition} · {spec.basis}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3 className="mt-10">Amortisation schedule</h3>
      <p>
        Straight-line over {TCO_HORIZON_YEARS} years to the residual.
        Electricity is paid every year at TDP · e · 8760.
      </p>
      <table className="idx-rates mt-3">
        <thead>
          <tr>
            <th>GPU</th>
            <th>Y1 book →</th>
            <th>Y2 book →</th>
            <th>Y3 book</th>
          </tr>
        </thead>
        <tbody>
          {(Object.keys(HARDWARE_PURCHASE) as HardwareFamily[]).map((k) => {
            const s = amortSchedule(k);
            return (
              <tr key={k}>
                <td>{k}</td>
                {s.map((y) => (
                  <td key={y.year} className="mono-nums">
                    {formatUsd(y.bookStart, 0)} → {formatUsd(y.bookEnd, 0)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}
