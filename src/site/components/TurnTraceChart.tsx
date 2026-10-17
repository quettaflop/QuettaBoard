import { TURN_TRACE } from '../siteData';

// Restores the current production figure (99d2cb4) into editable source.
const W = 760, H = 300;
const PAD = { t: 26, r: 52, b: 58, l: 52 };
const IW = W - PAD.l - PAD.r, IH = H - PAD.t - PAD.b;
const MAX_CTX = 48000, GREEN = '#2f9e6e';

export function TurnTraceChart() {
  const n = TURN_TRACE.length, first = TURN_TRACE[0], last = TURN_TRACE[n - 1];
  const slot = IW / n, barW = Math.min(46, slot * 0.44);
  const x = (i: number) => PAD.l + slot * i + slot / 2;
  const yCtx = (v: number) => PAD.t + IH - (v / MAX_CTX) * IH;
  const yHit = (v: number) => PAD.t + IH - v * IH;
  const hitPath = TURN_TRACE.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${yHit(d.cacheHit)}`).join(' ');

  return <figure className="qb-trace min-w-0 overflow-hidden">
    <header className="qb-trace-head">
      <div className="min-w-0">
        <div className="eyebrow">Multi-turn trace · measured</div>
        <div className="qb-trace-sub mono">DeepSeek-V4.1-Flash · 2×B200 · vLLM 0.31.0 · swebench-multiturn · concurrency 16</div>
      </div>
      <div className="qb-trace-legend mono">
        <span><i className="sw" style={{ background: GREEN }} />context tokens</span>
        <span><i className="sw sw-dot" />cache hit rate</span>
      </div>
    </header>
    <div className="scrollbar-thin overflow-x-auto px-2 pb-1 pt-2 sm:px-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[620px]" role="img"
        aria-label={`Across a ${last.turn + 1}-turn SWE-bench session the context grows from ${first.context.toLocaleString()} to ${last.context.toLocaleString()} tokens while the cache hit rate reaches ${Math.round(last.cacheHit * 100)} percent, so measured time-to-first-token ends where it started, near ${Math.round(last.ttft)} milliseconds.`}>
        {[0, 0.25, 0.5, 0.75, 1].map(f => {
          const y = PAD.t + IH - f * IH;
          return <g key={f}>
            <line x1={PAD.l} y1={y} x2={PAD.l + IW} y2={y} stroke="var(--grid)" strokeWidth="1" />
            <text x={PAD.l - 10} y={y + 3.5} textAnchor="end" className="mono" fontSize="10" fill="var(--ink-3)">{f === 0 ? '0' : `${Math.round(MAX_CTX * f / 1000)}k`}</text>
            <text x={PAD.l + IW + 10} y={y + 3.5} className="mono" fontSize="10" fill="var(--ink-3)">{Math.round(f * 100)}%</text>
          </g>;
        })}
        {TURN_TRACE.map((d, i) => <rect key={d.turn} x={x(i) - barW / 2} y={yCtx(d.context)} width={barW} height={PAD.t + IH - yCtx(d.context)} rx="3" fill={GREEN} fillOpacity="0.22" stroke={GREEN} strokeOpacity="0.75" strokeWidth="1.2" />)}
        <path d={hitPath} fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        {TURN_TRACE.map((d, i) => <circle key={d.turn} cx={x(i)} cy={yHit(d.cacheHit)} r="4.5" fill="var(--raise)" stroke="var(--accent)" strokeWidth="2" />)}
        {TURN_TRACE.map((d, i) => {
          const label = d.context.toLocaleString(), width = label.length * 6.6 + 14;
          const baseY = Math.min(yCtx(d.context) - 24, PAD.t + IH - 24);
          const y = Math.abs(baseY + 8.5 - yHit(d.cacheHit)) < 16 ? yCtx(d.context) + 6 : baseY;
          return <g key={d.turn}>
            <rect x={x(i) - width / 2} y={y} width={width} height="17" rx="8.5" fill="var(--raise)" stroke={GREEN} strokeOpacity="0.6" />
            <rect x={x(i) - width / 2} y={y} width={width} height="17" rx="8.5" fill={GREEN} fillOpacity="0.12" />
            <text x={x(i)} y={y + 12} textAnchor="middle" className="mono" fontSize="10.5" fontWeight="600" fill="var(--ink)">{label}</text>
          </g>;
        })}
        <line x1={PAD.l} y1={PAD.t + IH} x2={PAD.l + IW} y2={PAD.t + IH} stroke="var(--line-2)" strokeWidth="1" />
        {TURN_TRACE.map((d, i) => <g key={d.turn}>
          <text x={x(i)} y={PAD.t + IH + 20} textAnchor="middle" className="mono" fontSize="10.5" fill="var(--ink-3)">turn {d.turn}</text>
          <text x={x(i)} y={PAD.t + IH + 38} textAnchor="middle" className="mono" fontSize="11.5" fontWeight="600" fill="var(--ink)">{d.ttft.toFixed(0)}<tspan fontSize="9" fontWeight="400" fill="var(--ink-3)"> ms</tspan></text>
        </g>)}
      </svg>
    </div>
    <figcaption className="qb-trace-cap">
      <span className="text-[var(--ink)]">{Math.round(last.context / first.context)}× the context, {(last.ttft / first.ttft).toFixed(1)}× the latency.</span>{' '}
      Six turns, evenly spaced, from a {last.turn + 1}-turn SWE-bench session; by the end, {Math.round(last.cacheHit * 100)}% of the {Math.round(last.context / 1000)}k-token context is already resident. Bottom row is measured TTFT.
    </figcaption>
  </figure>;
}
