import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DOMAINS,
  INDEX_VERSION,
  LOAD_WEIGHTS,
  MIN_SUCCESS,
  type Domain,
  type HardwareFamily,
  type IndexRow,
} from '../efficiency/score';
import {
  HARDWARE_REFERENCE,
  MIN_MATCHED_MODELS,
  buildEngineIndex,
  buildHardwareIndex,
  configTcoUsdPerMTok,
  modelNames,
  type EngineIndexRow,
  type HardwareIndexRow,
} from '../efficiency/indexes';
import { ENGINE_REFERENCE, ENGINE_VERSIONS_NOTE, engineLabel } from '../efficiency/engines';
import { OPENROUTER_LLAMA31_8B, selfHostedToApiRatio } from '../efficiency/market';
import { EFFICIENCY_SNAPSHOT } from '../efficiency/snapshot';
import {
  AVG_USD_PER_KWH,
  HARDWARE_PURCHASE,
  TCO_HORIZON_YEARS,
  TCO_PUE,
  TCO_UTILIZATION,
  amortSchedule,
  gpuTco,
} from '../efficiency/tco';
import { formatMult, formatUsd } from '../efficiency/format';
import { SiteNav } from './SiteNav';

type Board = 'hardware' | 'engines' | 'configs';
type EngineFilter = 'all' | 'vllm' | 'sglang';

const DOMAIN_LABEL: Record<Domain, string> = {
  chat: 'Chat',
  coding: 'Coding',
  terminal: 'Terminal',
  computerUse: 'Computer-use',
};

const FAMILIES: HardwareFamily[] = ['H100', 'A100', '3090', '2080 Ti'];
const PAGE_SIZE = 10;
const ENGINE_REFERENCE_LABEL = engineLabel(ENGINE_REFERENCE, true);

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
          Efficiency Index
        </h1>
        <p className="mt-5 max-w-[44rem] text-[1.05rem] leading-relaxed">
          Two indices from one measured corpus. The Hardware Index asks how many
          output tokens a dollar of owned GPU buys over three years, compared
          with H100 on identical configurations. The Engine Index asks the same
          of vLLM and SGLang on identical hardware. Select a model under Configs
          to see every measured hardware × engine configuration.
        </p>
        <p className="mt-3 text-[13px] text-[var(--ink-3)]">
          Snapshot {snap.sourceModified} · {snap.n} configs · loads 1 / 40 / 160
        </p>
      </header>

      <section className="shell shell-wide pb-20">
        <div className="idx-tabs" role="tablist" aria-label="Index board">
          {([
            ['hardware', 'Hardware'],
            ['engines', 'Engines'],
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
          <div id="idx-panel-hardware" role="tabpanel" aria-labelledby="idx-tab-hardware">
            <HardwareBoard rows={hardware} llamaTco={llamaTco} />
          </div>
        )}
        {board === 'engines' && (
          <div id="idx-panel-engines" role="tabpanel" aria-labelledby="idx-tab-engines">
            <EngineBoard rows={engines} />
          </div>
        )}
        {board === 'configs' && (
          <div id="idx-panel-configs" role="tabpanel" aria-labelledby="idx-tab-configs">
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

        <Methodology />
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Ranked boards                                                        */
/* ------------------------------------------------------------------ */

interface BoardRow {
  key: string;
  name: string;
  sub?: string;
  isRef: boolean;
  rank: number | null;
  score: number | null;
  ratio: number | null;
  typicalUsd: number | null;
  typicalRefUsd: number | null;
  nMatchedModels: number;
  nModelsBetter: number;
  nMatchedConfigs: number;
  nMatchedCells: number;
  detail: ReactNode;
}

function evidenceText(r: BoardRow): string {
  if (r.isRef) return `${r.nMatchedModels} models · ${r.nMatchedConfigs} configs`;
  if (r.rank == null) return `${r.nMatchedModels} of ${MIN_MATCHED_MODELS} matched models required`;
  return `${r.nMatchedModels} matched models · better on ${r.nModelsBetter} · ${r.nMatchedConfigs} configs`;
}

function RankedBoard({
  id,
  eyebrow,
  title,
  lede,
  nameHeader,
  refLabel,
  refHeader = refLabel,
  rows,
  open,
  setOpen,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lede: string;
  nameHeader: string;
  refLabel: string;
  /** Short form for column headers, e.g. "vLLM" when refLabel is "vLLM 0.19". */
  refHeader?: string;
  rows: BoardRow[];
  open: string | null;
  setOpen: (key: string | null) => void;
}) {
  const firstUnranked = rows.findIndex((r) => r.rank == null);

  return (
    <section className="idx-leaderboard" aria-labelledby={`${id}-title`}>
      <header className="idx-section-head">
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={`${id}-title`}>{title}</h2>
        <p>{lede}</p>
      </header>

      <ol className="idx-table idx-board">
        <li className="idx-rank idx-rank-head" aria-hidden>
          <span className="idx-rank-n"></span>
          <span className="idx-rank-name">{nameHeader}</span>
          <span className="idx-rank-usd">Value vs {refHeader}</span>
          <span className="idx-rank-output">Typical $ / M</span>
          <span className="idx-rank-match">Matched evidence</span>
        </li>
        {rows.map((r, i) => {
          const expanded = open === r.key;
          const matchState = r.isRef ? 'baseline' : r.rank == null ? 'withheld' : 'supported';
          const ariaValue = r.isRef
            ? `reference, 1.00×`
            : r.rank == null
              ? `not yet ranked, ${r.nMatchedModels} of ${MIN_MATCHED_MODELS} matched models`
              : `${formatMult(r.ratio)} the value of ${refLabel} on identical configurations`;
          return (
            <li key={r.key} className="idx-row-wrap">
              {i === firstUnranked && (
                <div className="idx-divider" role="presentation">
                  <span>Not yet ranked</span>
                  <small>Fewer than {MIN_MATCHED_MODELS} models matched against {refLabel}</small>
                </div>
              )}
              <button
                type="button"
                className="idx-rank"
                data-rank={r.rank ?? ''}
                data-ratio={r.ratio ?? ''}
                aria-expanded={expanded}
                aria-label={`${r.name}${r.rank != null ? `, rank ${r.rank}` : ''}: ${ariaValue}. ${
                  r.typicalUsd != null
                    ? `Typical ${formatUsd(r.typicalUsd)} per million output tokens on the matched cells${
                        r.isRef ? '' : ` against ${formatUsd(r.typicalRefUsd)} for ${refLabel}`
                      }.`
                    : ''
                } ${expanded ? 'Hide' : 'Show'} details`}
                onClick={() => setOpen(expanded ? null : r.key)}
              >
                <span className="idx-rank-n mono-nums">{r.rank ?? '–'}</span>
                <span className="idx-rank-name">
                  <span className="idx-rank-title">
                    <span>{r.name}</span>
                    {r.rank === 1 && <span className="idx-leader-label">Best value</span>}
                  </span>
                  {r.sub && <small className="idx-rank-sub mono-nums">{r.sub}</small>}
                </span>
                <span className="idx-rank-usd">
                  {r.rank != null ? (
                    <>
                      <span className="mono-nums">{formatMult(r.ratio)}</span>
                      <small>{r.isRef ? 'reference' : `vs ${refLabel}`}</small>
                    </>
                  ) : (
                    <>
                      <span className="mono-nums">—</span>
                      <small>not ranked</small>
                    </>
                  )}
                </span>
                <span className="idx-rank-output">
                  <span className="idx-rank-yield">
                    <span className="mono-nums">{formatUsd(r.typicalUsd)}</span>
                    <small>
                      {r.typicalUsd == null
                        ? 'no ranked figure'
                        : r.isRef
                          ? '/ M · all its configs'
                          : `vs ${formatUsd(r.typicalRefUsd)} ${refLabel}`}
                    </small>
                  </span>
                  <RankBar value={r.score ?? 0} />
                </span>
                <span className="idx-rank-match" data-state={matchState}>
                  <span>{r.isRef ? 'Reference' : r.rank == null ? 'Not yet ranked' : 'Matched'}</span>
                  <small>{evidenceText(r)}</small>
                </span>
                <RowChev />
              </button>
              <div className="expand" data-open={expanded ? 'true' : 'false'}>
                <div>
                  <div className="expand-inner idx-detail">{r.detail}</div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function MatchedBasis({
  r,
  refLabel,
  fullPanel,
}: {
  r: BoardRow;
  refLabel: string;
  fullPanel: ReactNode;
}) {
  return (
    <div className="idx-detail-basis">
      <div data-state={r.isRef ? 'baseline' : r.rank == null ? 'withheld' : 'supported'}>
        <span>Matched panel</span>
        <strong>
          {r.isRef
            ? `${refLabel} reference`
            : r.rank == null
              ? 'Not yet ranked'
              : `${formatMult(r.ratio)} ${refLabel} value`}
        </strong>
        <small>
          {r.isRef
            ? `${r.nMatchedModels} models · ${r.nMatchedConfigs} configs · ${r.nMatchedCells} workload cells define the reference.`
            : r.rank == null
              ? `${r.nMatchedModels} of ${MIN_MATCHED_MODELS} models matched against ${refLabel}; the ratio is not published until three are.`
              : `${r.nMatchedModels} models · ${r.nMatchedConfigs} configs · ${r.nMatchedCells} workload cells. Better value than ${refLabel} on ${r.nModelsBetter} of ${r.nMatchedModels} models.`}
        </small>
      </div>
      <div>
        <span>Measured mean, everything it ran</span>
        {fullPanel}
      </div>
    </div>
  );
}

function HardwareBoard({
  rows,
  llamaTco,
}: {
  rows: HardwareIndexRow[];
  llamaTco: MarketCheck | null;
}) {
  const [open, setOpen] = useState<string | null>(null);

  const boardRows: BoardRow[] = rows.map((r) => {
    const t = gpuTco(r.family);
    const spec = HARDWARE_PURCHASE[r.family];
    const row: BoardRow = {
      key: r.family,
      name: r.family,
      isRef: r.family === HARDWARE_REFERENCE,
      rank: r.rank,
      score: r.score,
      ratio: r.vsH100,
      typicalUsd: r.typicalUsdPerMTok,
      typicalRefUsd: r.typicalRefUsdPerMTok,
      nMatchedModels: r.nMatchedModels,
      nModelsBetter: r.nModelsBetter,
      nMatchedConfigs: r.nMatchedConfigs,
      nMatchedCells: r.nMatchedCells,
      detail: null,
    };
    row.detail = (
      <>
        <MatchedBasis
          r={row}
          refLabel={HARDWARE_REFERENCE}
          fullPanel={
            <>
              <strong className="mono-nums">{formatUsd(r.usdPerMTok)} / M</strong>
              <small>
                {r.nModels} models · {r.nConfigs} configs · {r.minGpus}–{r.maxGpus} GPUs.
                Depends on which models were measured; not comparable across rows.
              </small>
            </>
          }
        />
        <p className="idx-detail-tco-label">3-year GPU ownership basis</p>
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
      </>
    );
    return row;
  });

  return (
    <div className="idx-hardware-layout">
      <RankedBoard
        id="idx-hardware"
        eyebrow="Hardware Index · matched against H100"
        title="Value per owned-GPU dollar, on identical configurations"
        lede="Each GPU is compared with H100 only where the same model, engine, quantization and GPU count were measured on both. Higher is better. Open a row for the ownership cost basis."
        nameHeader="GPU"
        refLabel={HARDWARE_REFERENCE}
        rows={boardRows}
        open={open}
        setOpen={setOpen}
      />
      <OpenRouterCheck llamaTco={llamaTco} />
    </div>
  );
}

function EngineBoard({ rows }: { rows: EngineIndexRow[] }) {
  const [open, setOpen] = useState<string | null>(null);

  const boardRows: BoardRow[] = rows.map((r) => {
    const row: BoardRow = {
      key: r.engine,
      name: engineLabel(r.engine),
      sub: engineLabel(r.engine, true).slice(engineLabel(r.engine).length).trim() || undefined,
      isRef: r.engine === ENGINE_REFERENCE,
      rank: r.rank,
      score: r.score,
      ratio: r.vsRef,
      typicalUsd: r.typicalUsdPerMTok,
      typicalRefUsd: r.typicalRefUsdPerMTok,
      nMatchedModels: r.nMatchedModels,
      nModelsBetter: r.nModelsBetter,
      nMatchedConfigs: r.nMatchedConfigs,
      nMatchedCells: r.nMatchedCells,
      detail: null,
    };
    row.detail = (
      <MatchedBasis
        r={row}
        refLabel={ENGINE_REFERENCE_LABEL}
        fullPanel={
          <>
            <strong className="mono-nums">{formatUsd(r.usdPerMTok)} / M</strong>
            <small>
              {r.nFamilies} GPU families · {r.nModels} models · {r.nConfigs} configs.
              Depends on which hardware and models were measured; not comparable across rows.
            </small>
          </>
        }
      />
    );
    return row;
  });

  return (
    <div className="idx-hardware-layout">
      <RankedBoard
        id="idx-engines"
        eyebrow={`Engine Index · matched against ${ENGINE_REFERENCE_LABEL}`}
        title="Value per dollar by serving engine, on identical hardware"
        lede="Each engine is compared with vLLM only where the same model, GPU configuration and quantization were measured on both, with the same ownership cost. Higher is better."
        nameHeader="Engine"
        refLabel={ENGINE_REFERENCE_LABEL}
        refHeader={engineLabel(ENGINE_REFERENCE)}
        rows={boardRows}
        open={open}
        setOpen={setOpen}
      />
      <aside className="idx-check">
        <header>
          <p className="eyebrow">What is being compared</p>
          <h3>Engine builds in this snapshot</h3>
          <p>Same GPUs, same models, same TCO per GPU-hour</p>
        </header>
        <p className="idx-check-note">{ENGINE_VERSIONS_NOTE}</p>
        <p className="idx-check-note">
          The index compares these builds as measured, not the projects in
          general. Runs completing fewer than {Math.round(MIN_SUCCESS * 100)}% of
          requests are excluded before scoring, so a build that failed a
          workload is absent from that cell rather than penalised for it.
        </p>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Side panels                                                          */
/* ------------------------------------------------------------------ */

function OpenRouterCheck({ llamaTco }: { llamaTco: MarketCheck | null }) {
  if (llamaTco == null) return null;
  const market = OPENROUTER_LLAMA31_8B.usdPerMTokOut;
  const ratio = selfHostedToApiRatio(llamaTco.min, market);
  return (
    <aside className="idx-check">
      <header>
        <p className="eyebrow">External market signal</p>
        <h3>{OPENROUTER_LLAMA31_8B.model} on OpenRouter</h3>
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
          <dt>Self-hosted ÷ API</dt>
          <dd className="mono-nums">{ratio == null ? '—' : `${ratio.toFixed(1)}×`}</dd>
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
        The floor is one node of one to four GPUs serving up to 160 concurrent
        requests, costed at full utilisation. API providers pool demand across
        many customers and batch far more aggressively, so the ratio bounds the
        comparison; it is not a margin and not a price.
      </p>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Configs                                                              */
/* ------------------------------------------------------------------ */

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
            ['vllm', engineLabel('vllm')],
            ['sglang', engineLabel('sglang')],
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
                      {r.hardwareFamily} · {engineLabel(r.engine, true)}
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

/* ------------------------------------------------------------------ */
/* Methodology                                                          */
/* ------------------------------------------------------------------ */

function Methodology() {
  return (
    <details className="idx-method mt-16 border-t border-[var(--line)] pt-8">
      <summary>How the indices are built</summary>
      <p>
        Both indices are ratios of ownership cost per output token between two
        groups on identical measured configurations. Hardware compares GPU
        families against H100; Engines compares serving engines against vLLM.
        The reduction order is workload/load cell → config → model → group,
        and only cells present on both sides of a comparison count.
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
            years. e = {AVG_USD_PER_KWH.toFixed(4)} $/kWh, the mean of
            DumpsterCluster Table 4 industrial rates (China 0.0556, US 0.12,
            Brazil 0.125) rather than any one country. Utilization ={' '}
            {(TCO_UTILIZATION * 100).toFixed(0)}%; PUE = {TCO_PUE.toFixed(1)}.
            Host, networking, cooling and other system costs are excluded.
          </p>
        </div>
        <div>
          <h3>4. $ / M tok per cell</h3>
          <p className="idx-formula">
            $ / M<sub>cell</sub> = (r · n<sub>GPU</sub> · 10<sup>6</sup>) / (tok/s<sub>cell</sub> · 3600)
          </p>
          <p>
            Frozen for each model × hardware × engine × profile × target-load
            cell. Everything above the cell is a reduction of these numbers.
          </p>
        </div>
        <div>
          <h3>5. Hardware Index</h3>
          <p className="idx-formula">
            v<sub>F</sub> = geo<sub>models</sub> geo<sub>configs</sub> wgeo<sub>cells</sub>( $<sub>H100,cell</sub> / $<sub>F,cell</sub> )
          </p>
          <p>
            A config on family F is compared with the H100 config of the same
            model, engine, quantization and GPU count, cell by cell, and only
            on cells both have. Cells use the {LOAD_WEIGHTS[1]}/{LOAD_WEIGHTS[40]}/
            {LOAD_WEIGHTS[160]} load weights; configs and models are equal-weight
            geometric means. Fewer than {MIN_MATCHED_MODELS} matched models: listed,
            not ranked, ratio not published. Score = 100 · v<sub>F</sub> / best v.
          </p>
        </div>
        <div>
          <h3>6. Engine Index</h3>
          <p className="idx-formula">
            v<sub>E</sub> = geo<sub>models</sub> geo<sub>configs</sub> wgeo<sub>cells</sub>( $<sub>vLLM,cell</sub> / $<sub>E,cell</sub> )
          </p>
          <p>
            Identical construction with vLLM as reference, matching on model,
            hardware configuration and quantization. Because both sides share
            the GPU-hour cost, this is a pure throughput comparison of the
            engine builds recorded in the snapshot.
          </p>
        </div>
        <div>
          <h3>7. Typical $ / M</h3>
          <p>
            The load-weighted geometric mean $/M over exactly the matched
            cells, reported for both sides; their ratio is the index value.
            The arithmetic mean over everything a group was run on appears
            only inside its row, because it depends on which models were
            measured and is not comparable across rows.
          </p>
        </div>
        <div>
          <h3>8. OpenRouter market check</h3>
          <p>
            Matching {OPENROUTER_LLAMA31_8B.model} configurations report range
            and median beside dated output-only API list pricing. API pooling
            and provider margin make this a bound on the comparison, not a
            TCO validation and not a price.
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
