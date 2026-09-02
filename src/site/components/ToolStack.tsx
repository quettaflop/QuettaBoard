import { ArrowDown } from './icons';

const STEPS = [
  { href: '#measure', n: '01', verb: 'Benchmark', name: 'QuettaBench' },
  { href: '#predict', n: '02', verb: 'Predict', name: 'QuettaSim' },
  { href: '#run', n: '03', verb: 'Serve', name: 'QuettaServe' },
] as const;

/**
 * Hero instrument: the three products as a downward stack. Each cell is
 * a hash link to its chapter — the page is the map.
 */
export function ToolStack() {
  return (
    <nav className="tool-stack glass" aria-label="Products">
      {STEPS.map((s, i) => (
        <div key={s.href} className="contents">
          {i > 0 && (
            <div className="tool-stack-arrow" aria-hidden="true">
              <ArrowDown size={14} />
            </div>
          )}
          <a href={s.href} className="tool-stack-cell">
            <span className="mono text-[11px] text-[var(--accent)]">{s.n}</span>
            <span className="min-w-0">
              <span className="block text-[15px] leading-tight text-[var(--ink)]">{s.verb}</span>
              <span className="mt-0.5 block text-[12px] leading-tight text-[var(--ink-3)]">{s.name}</span>
            </span>
          </a>
        </div>
      ))}
    </nav>
  );
}
