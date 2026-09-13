import type { ReactNode } from 'react';
import type { ModelIndexRow } from '../efficiency/indexes';

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
                aria-label={`${r.model}, rank ${i + 1}. AA Intelligence Index ${r.intelligence}. ${parameterLabel}. ${formatRatio(r.intelPerGflop)} intelligence per approximate decode GFLOP. Open configurations.`}
                onClick={() => onSelect(r.model)}
              >
                <span className="idx-model-rank mono-nums">{i + 1}</span>
                <span className="idx-model-name">
                  <strong>{r.model}</strong>
                  <small>{r.nConfigs} measured config{r.nConfigs === 1 ? '' : 's'}</small>
                </span>
                <span className="idx-model-evidence">
                  <span className="idx-model-aa">
                    <span className="mono-nums">{r.intelligence}</span>
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

export { formatUsd, formatMult };
