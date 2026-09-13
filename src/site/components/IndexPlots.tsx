import type { ReactNode } from 'react';
import type { EngineIndexRow, HardwareIndexRow, ModelIndexRow } from '../efficiency/indexes';

function formatUsd(n: number | null, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 100) return `$${n.toFixed(0)}`;
  if (n >= 10) return `$${n.toFixed(1)}`;
  return `$${n.toFixed(digits)}`;
}

function formatMult(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toFixed(2)}×`;
}

function engineLabel(engine: string): string {
  if (engine === 'vllm') return 'vLLM';
  if (engine === 'sglang') return 'SGLang';
  return engine;
}

function PlotFrame({
  eyebrow,
  title,
  note,
  children,
}: {
  eyebrow: string;
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <figure className="idx-plot">
      <header className="idx-plot-head">
        <p className="eyebrow">{eyebrow}</p>
        <p className="idx-plot-title">{title}</p>
      </header>
      <div className="idx-plot-body scrollbar-thin overflow-x-auto">
        {children}
      </div>
      <figcaption className="idx-plot-note">{note}</figcaption>
    </figure>
  );
}

export function HardwareCostPlot({
  rows,
  selected,
  onSelect,
}: {
  rows: HardwareIndexRow[];
  selected: HardwareIndexRow['family'] | null;
  onSelect: (family: HardwareIndexRow['family']) => void;
}) {
  const max = Math.max(1.15, ...rows.map((row) => row.vsH100 ?? 0)) * 1.04;
  const baseline = (1 / max) * 100;
  const comparisonRows = [...rows].sort(
    (a, b) => Number(b.family === 'H100') - Number(a.family === 'H100'),
  );

  return (
    <PlotFrame
      eyebrow="Separate matched panel · not the absolute rank"
      title="Exact-match value relative to H100"
      note="Exact model, engine, quantization, GPU-width, workload and load only. Claims require at least three matched models."
    >
      <div className="idx-plot-bars" role="group" aria-label="Hardware value relative to H100">
        {comparisonRows.map((r) => {
          const supported = r.vsH100 != null;
          const width = supported ? Math.max(2, ((r.vsH100 ?? 0) / max) * 100) : 0;
          return (
            <button
              key={r.family}
              type="button"
              className="idx-plot-bar-row"
              data-supported={supported ? 'true' : 'false'}
              aria-pressed={selected === r.family}
              aria-label={`${r.family}: ${
                supported
                  ? `${formatMult(r.vsH100)} H100 value across ${r.nMatchedModels} exact-matched models`
                  : `relative comparison withheld with ${r.nMatchedModels} matched models`
              }`}
              onClick={() => onSelect(r.family)}
            >
              <span className="idx-plot-bar-label">
                <strong>{r.family}</strong>
                <span className="mono-nums">
                  {supported ? formatMult(r.vsH100) : 'Withheld'}
                </span>
              </span>
              <span className="idx-plot-bar-track" aria-hidden>
                <span
                  className="idx-plot-baseline"
                  style={{ left: `${baseline}%` }}
                />
                {supported && (
                  <span
                    className="idx-plot-bar-fill"
                    style={{ width: `${width}%` }}
                  />
                )}
              </span>
              <span className="idx-plot-bar-meta">
                {r.family === 'H100'
                  ? `${r.nMatchedModels} reference models`
                  : supported
                    ? `${r.nMatchedModels} matched models`
                  : `${r.nMatchedModels} matched · 3 required`}
              </span>
            </button>
          );
        })}
        <div className="idx-plot-axis" aria-hidden>
          <span>0</span>
          <span style={{ left: `${baseline}%` }}>H100 · 1×</span>
          <span>{max.toFixed(1)}×</span>
        </div>
      </div>
    </PlotFrame>
  );
}

export function EngineCostPlot({ rows }: { rows: EngineIndexRow[] }) {
  const maxTok = Math.max(...rows.map((r) => r.tokPerDollar));
  const matchedPairs = rows[0]?.nMatchedPairs ?? 0;

  return (
    <PlotFrame
      eyebrow={`Controlled engine check · ${matchedPairs} shared pairs`}
      title="Engine sensitivity at fixed TCO"
      note="Balanced across model × hardware-family pairs measured on both engines. A separate sensitivity check, not the Hardware ranking."
    >
      <div className="idx-plot-bars idx-engine-bars" role="group" aria-label="Output value by serving engine">
        {rows.map((r) => {
          const width = Math.max(2, (r.tokPerDollar / maxTok) * 100);
          return (
            <div className="idx-plot-bar-row" key={r.engine}>
              <span className="idx-plot-bar-label">
                <strong>{engineLabel(r.engine)}</strong>
                <span className="mono-nums">{formatUsd(r.usdPerMTok)}/M</span>
              </span>
              <span className="idx-plot-bar-track" aria-hidden>
                <span
                  className="idx-plot-bar-fill"
                  style={{ width: `${width}%` }}
                />
              </span>
            </div>
          );
        })}
      </div>
    </PlotFrame>
  );
}

export function ModelEfficiencyPlot({
  rows,
  onSelect,
}: {
  rows: ModelIndexRow[];
  onSelect: (model: string) => void;
}) {
  const formatRatio = (value: number) => value >= 0.1
    ? value.toFixed(2)
    : value.toFixed(3);

  return (
    <PlotFrame
      eyebrow={`Experimental comparison · ${rows.length} models`}
      title="Intelligence per approximate decode GFLOP"
      note="Higher ratio first. Select a model row to open its measured hardware × engine configurations."
    >
      <ol
        className="idx-model-list idx-plot-svg-model"
        aria-label="Experimental model efficiency ranking"
      >
        <li className="idx-model-list-head" aria-hidden>
          <span>#</span>
          <span>Model</span>
          <span>AA score</span>
          <span>Parameters</span>
          <span>I / GFLOP</span>
        </li>
        {rows.map((r, i) => {
          const parameterLabel = `${r.activeParamsB}B active, ${r.totalParamsB}B total`;
          return (
            <li key={r.model} className="idx-model-item">
              <button
                type="button"
                className="idx-model-row"
                aria-label={`${r.model}, rank ${i + 1}. AA Intelligence Index ${r.intelligence}${r.estimated ? ', estimated' : ''}. ${parameterLabel}. ${formatRatio(r.intelPerGflop)} intelligence per approximate decode GFLOP. Open configurations.`}
                onClick={() => onSelect(r.model)}
              >
                <span className="idx-model-rank mono-nums">{i + 1}</span>
                <span className="idx-model-name">
                  <strong>{r.model}</strong>
                  <small>{r.nConfigs} measured config{r.nConfigs === 1 ? '' : 's'}</small>
                </span>
                <span className="idx-model-evidence">
                  <span className="idx-model-aa">
                    <span className="mono-nums">
                      {r.intelligence}{r.estimated ? '*' : ''}
                    </span>
                    <small>AA Index</small>
                  </span>
                  <span className="idx-model-params">
                    <span className="mono-nums">{r.activeParamsB}B active</span>
                    <small className="mono-nums">{r.totalParamsB}B total</small>
                  </span>
                </span>
                <span className="idx-model-ratio">
                  <strong className="mono-nums">{formatRatio(r.intelPerGflop)}</strong>
                  <small>I / GFLOP</small>
                </span>
                <span className="idx-model-track" aria-hidden>
                  <span style={{ width: `${Math.max(1.5, r.score)}%` }} />
                </span>
                <span className="idx-model-arrow" aria-hidden>→</span>
              </button>
            </li>
          );
        })}
      </ol>
    </PlotFrame>
  );
}

export { formatUsd, formatMult, engineLabel };
