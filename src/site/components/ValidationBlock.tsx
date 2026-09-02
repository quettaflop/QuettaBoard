import { VALIDATION } from '../siteData';

/**
 * The simulator's error, with the scope it was measured on stated next to it.
 * The bar is filled by the error, so shorter is better — labelled, because a
 * filled track otherwise reads as a score.
 */
export function ValidationBlock() {
  return (
    <div className="border-t border-[var(--line)] bg-[var(--well)] px-6 py-7 sm:px-8">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h4 className="text-[13px] font-normal text-[var(--ink)]">Prediction error</h4>
        <span className="mono text-[10px] tracking-[0.14em] text-[var(--ink-3)]">
          MEDIAN ERROR · {VALIDATION.hardware}
        </span>
      </div>

      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        {VALIDATION.metrics.map((m) => (
          <div key={m.name}>
            <div className="flex items-baseline gap-2">
              <span className="mono text-[11px] tracking-[0.14em] text-[var(--ink-2)]">{m.name}</span>
              <span className="mono-nums ml-auto text-[22px] font-medium leading-none text-[var(--ink)]">
                {m.mdape}
                <span className="ml-0.5 text-[13px] text-[var(--ink-3)]">%</span>
              </span>
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-[var(--line)]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(m.mdape, 100)}%`,
                  background: 'var(--accent)',
                }}
              />
            </div>
            <div className="mono mt-1.5 flex justify-between text-[9px] tracking-[0.1em] text-[var(--ink-3)]">
              <span>0% · SHORTER IS BETTER</span>
              <span>100%</span>
            </div>
            <p className="mt-2 text-[11.5px] text-[var(--ink-2)]">{m.blurb}</p>
          </div>
        ))}
      </div>

      <p className="mt-6 border-t border-[var(--line)] pt-4 text-[11.5px] leading-relaxed text-[var(--ink-2)]">
        {VALIDATION.note}
      </p>
    </div>
  );
}
