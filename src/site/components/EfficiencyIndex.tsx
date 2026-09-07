import { useMemo, useState } from 'react';
import {
  DOMAINS,
  GPU_USD_PER_HOUR,
  INDEX_VERSION,
  LOAD_WEIGHTS,
  type Domain,
  type HardwareFamily,
} from '../efficiency/score';
import { EFFICIENCY_SNAPSHOT } from '../efficiency/snapshot';
import { SiteNav } from './SiteNav';

type View = 'efficiency' | 'cost';
type EngineFilter = 'all' | 'vllm' | 'sglang';

const DOMAIN_LABEL: Record<Domain, string> = {
  chat: 'Chat',
  coding: 'Coding',
  terminal: 'Terminal',
  computerUse: 'Computer-use',
};

const FAMILIES: HardwareFamily[] = ['H100', 'A100', '3090', '2080 Ti'];

function engineLabel(engine: string): string {
  if (engine === 'vllm') return 'vLLM';
  if (engine === 'sglang') return 'SGLang';
  return engine;
}

function hardwareLabel(family: HardwareFamily, gpus: number): string {
  return gpus === 1 ? family : `${gpus}×${family}`;
}

function formatUsd(n: number | null): string {
  if (n == null) return '—';
  if (n < 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(1)}`;
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

export function EfficiencyIndex() {
  const snap = EFFICIENCY_SNAPSHOT;
  const [view, setView] = useState<View>('efficiency');
  const [family, setFamily] = useState<HardwareFamily | 'all'>('all');
  const [engine, setEngine] = useState<EngineFilter>('all');
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    const filtered = snap.rows.filter((r) => {
      if (family !== 'all' && r.hardwareFamily !== family) return false;
      if (engine !== 'all' && r.engine !== engine) return false;
      if (view === 'cost' && r.cost == null) return false;
      return true;
    });
    const scored = [...filtered].sort((a, b) => {
      const av = view === 'cost' ? (a.cost ?? -1) : a.efficiency;
      const bv = view === 'cost' ? (b.cost ?? -1) : b.efficiency;
      return bv - av || a.id.localeCompare(b.id);
    });
    return scored;
  }, [snap.rows, family, engine, view]);

  return (
    <>
      <SiteNav page="efficiency" />
      <header className="shell shell-wide pb-10 pt-14 sm:pb-12 sm:pt-16">
        <p className="eyebrow">QuettaBench · Index v{INDEX_VERSION}</p>
        <h1 className="mt-3 max-w-[22ch] text-[clamp(1.85rem,3.6vw,2.65rem)] leading-[1.2]">
          {view === 'efficiency' ? 'Efficiency Index' : 'Cost Index'}
        </h1>
        <p className="mt-5 max-w-[42rem] text-[1.05rem] leading-relaxed">
          A 1–100 score for how a model × hardware × engine serves agentic
          workloads. Chat, coding, terminal and computer-use, equally weighted.
          Every row is a measured QuettaBench run.
        </p>
        <p className="mt-4 max-w-[42rem] text-[14px] leading-relaxed text-[var(--ink-3)]">
          Snapshot {snap.sourceModified} · {snap.n} configurations · loads 1 / 40 /
          160
        </p>
      </header>

      <section className="shell shell-wide pb-20">
        <div className="flex flex-col gap-4 border-t border-[var(--line)] pt-5">
          <div className="flex flex-wrap items-center gap-2">
            {(['efficiency', 'cost'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`idx-chip ${view === v ? 'idx-chip-on' : ''}`}
              >
                {v === 'efficiency' ? 'Efficiency' : 'Cost'}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow mr-1">Hardware</span>
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
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow mr-1">Engine</span>
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

        <p className="mt-6 text-[12px] text-[var(--ink-3)]">
          {rows.length} of {snap.n}
          {view === 'cost' ? ' · higher cost score is cheaper' : ''}
        </p>

        {rows.length === 0 ? (
          <p className="mt-8 text-[15px] text-[var(--ink-2)]">
            No configurations match these filters.
          </p>
        ) : (
          <ol className="idx-table mt-4">
            <li className="idx-head" aria-hidden>
              <span>#</span>
              <span>Configuration</span>
              <span>{view === 'cost' ? 'Cost' : 'Index'}</span>
              {DOMAINS.map((d) => (
                <span key={d} className="idx-hide-sm">
                  {DOMAIN_LABEL[d]}
                </span>
              ))}
            </li>
            {rows.map((r, i) => {
              const expanded = open === r.id;
              return (
                <li key={r.id} className="idx-row-wrap">
                  <button
                    type="button"
                    className="idx-row"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : r.id)}
                  >
                    <span className="mono-nums text-[var(--ink-3)]">{i + 1}</span>
                    <span className="min-w-0 text-left">
                      <span className="block truncate text-[14px] text-[var(--ink)]">{r.model}</span>
                      <span className="mt-0.5 block truncate text-[12px] text-[var(--ink-3)]">
                        {hardwareLabel(r.hardwareFamily, r.gpus)} · {engineLabel(r.engine)} · {r.quant}
                      </span>
                    </span>
                    <ScoreCell value={view === 'cost' ? r.cost : r.efficiency} />
                    {DOMAINS.map((d) => (
                      <span key={d} className="idx-hide-sm">
                        <ScoreCell value={r.domains[d]} />
                      </span>
                    ))}
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
                            <dt>$ / M output tok</dt>
                            <dd className="mono-nums">{formatUsd(r.raw.usdPerMTok)}</dd>
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
                        <div className="mt-4 grid gap-2 sm:hidden">
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

        <section className="mt-16 max-w-[42rem] border-t border-[var(--line)] pt-10">
          <h2 className="text-[1.35rem] leading-tight">How the score is built</h2>
          <p className="mt-4">
            Each configuration is a model, a hardware width, and an engine. The
            five canonical QuettaBench synthetic profiles are folded into four
            subdomains. A configuration needs at least three subdomains to appear.
          </p>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-[15px]">
            <li>Chat — chat-singleturn-synth, chat-multiturn-synth</li>
            <li>Coding — swebench-multiturn-synth</li>
            <li>Terminal — terminalbench-multiturn-synth</li>
            <li>Computer-use — osworld-multiturn-synth</li>
          </ul>
          <p className="mt-4">
            At each load (concurrency 1, 40, 160 — weights{' '}
            {LOAD_WEIGHTS[1] * 100}/{LOAD_WEIGHTS[40] * 100}/{LOAD_WEIGHTS[160] * 100}
            ) a cell is the geometric mean of 1/TPOT, 1/TTFT and output tok/s.
            If the exact concurrency is missing, the nearest value in a fixed
            band is used (1–5, 20–80, 120–256). Domain raw values are a
            geometric mean across those loads and profiles.
          </p>
          <p className="mt-4">
            Domain score = 1 + 99 × (ln raw − ln min) / (ln max − ln min).
            Min and max are taken over this snapshot, so the slowest published
            config is 1 and the fastest is 100. Efficiency Index is the
            unweighted mean of the domain scores that exist. The scale rebases
            when the corpus does.
          </p>
          <p className="mt-4">
            Cost Index uses the same scaling on tokens per dollar at concurrency
            40, from assumed $/GPU-hour × width. Higher is cheaper. These rates
            are a dated assumption table, not a quote.
          </p>
          <table className="idx-rates mt-5">
            <thead>
              <tr>
                <th>GPU</th>
                <th>$ / GPU-hr</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(GPU_USD_PER_HOUR) as HardwareFamily[]).map((k) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td className="mono-nums">{GPU_USD_PER_HOUR[k].usd.toFixed(2)}</td>
                  <td>{GPU_USD_PER_HOUR[k].source}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4">Every row on this board is a measured run.</p>
        </section>
      </section>
    </>
  );
}
