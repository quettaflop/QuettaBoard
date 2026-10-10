import { ArrowRight } from './icons';

const STEPS = [
  { href: '#measure', n: '01', verb: 'Benchmark', name: 'QuettaBench' },
  { href: '#predict', n: '02', verb: 'Predict', name: 'QuettaSim' },
  { href: '#run', n: '03', verb: 'Serve', name: 'QuettaServe' },
] as const;

export function ToolStack() {
  return (
    <nav className="tool-stack" aria-label="Products">
      {STEPS.map((s) => (
        <a key={s.href} href={s.href} className="tool-stack-cell">
          <span className="mono tool-number">{s.n}</span>
          <span className="tool-label"><span>{s.verb}</span><small>{s.name}</small></span>
          <ArrowRight size={20} />
        </a>
      ))}
    </nav>
  );
}
