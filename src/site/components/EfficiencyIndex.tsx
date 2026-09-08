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

        <section className="idx-method mt-16 border-t border-[var(--line)] pt-10">
          <h2>How the score is built</h2>
          <p>
            A row is (model, hardware, engine). At least three domains are
            required. Every row is a measured run. Min / max are over this
            snapshot; a new fastest run rebases the 1–100 scale.
          </p>

          <div className="idx-method-grid">
            <div>
              <h3>1. Cell</h3>
              <p className="idx-formula">
                cell<sub>c</sub> = (1/TPOT · 1/TTFT · tok/s)<sup>1/3</sup>
              </p>
              <p>
                c ∈ {'{'}1, 40, 160{'}'} with weights {LOAD_WEIGHTS[1]}/{LOAD_WEIGHTS[40]}/
                {LOAD_WEIGHTS[160]}. If c is missing, use the nearest run in
                [1, 5], [20, 80], or [120, 256].
              </p>
            </div>
            <div>
              <h3>2. Domain raw</h3>
              <p className="idx-formula">
                raw<sub>D</sub> = exp( Σ<sub>c</sub> w<sub>c</sub> ln cell<sub>c</sub> / Σ<sub>c</sub> w<sub>c</sub> )
              </p>
              <p>
                Chat = ShareGPT (single-turn and multi-turn, then geo-mean).
                Coding = SWE-bench. Terminal = TerminalBench. Computer-use =
                OSWorld.
              </p>
            </div>
            <div>
              <h3>3. Domain score</h3>
              <p className="idx-formula">
                s<sub>D</sub> = 1 + 99 · ln(raw<sub>D</sub> / min<sub>D</sub>) / ln(max<sub>D</sub> / min<sub>D</sub>)
              </p>
              <p>Slowest published config in D is 1; fastest is 100.</p>
            </div>
            <div>
              <h3>4. Efficiency Index</h3>
              <p className="idx-formula">
                E = mean {'{'} s<sub>D</sub> : D present {'}'}
              </p>
              <p>Equal weight. Missing domains are omitted, not zeroed.</p>
            </div>
            <div>
              <h3>5. Cost Index</h3>
              <p className="idx-formula">
                tok/$ = (tok/s<sub>40</sub> · 3600) / (r · n<sub>GPU</sub>)
              </p>
              <p className="idx-formula">
                C = 1 + 99 · ln((tok/$) / min) / ln(max / min)
              </p>
              <p>
                r is the assumed $/GPU-hr below, not a quote. Higher C is
                cheaper.
              </p>
            </div>
            <div>
              <h3>Assumed r</h3>
              <table className="idx-rates">
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
            </div>
          </div>
        </section>
      </section>
    </>
  );
}
