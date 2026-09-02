import { TURN_TRACE } from '../siteData';

/**
 * The hero's instrument panel: one real multi-turn trace.
 *
 * Bars are context size per turn (it grows ~18× across six turns); the teal
 * line is prefix-cache hit rate over the same turns. Together they are the
 * whole argument for the site — context explodes, but most of it stops being
 * paid for, so latency grows far slower than tokens do.
 */
const W = 760;
const H = 300;
const PAD = { t: 26, r: 52, b: 58, l: 52 };
const IW = W - PAD.l - PAD.r;
const IH = H - PAD.t - PAD.b;

const MAX_CTX = 33000;

export function TurnTraceChart() {
  const n = TURN_TRACE.length;
  const slot = IW / n;
  const barW = Math.min(46, slot * 0.44);

  const x = (i: number) => PAD.l + slot * i + slot / 2;
  const yCtx = (v: number) => PAD.t + IH - (v / MAX_CTX) * IH;
  const yHit = (v: number) => PAD.t + IH - v * IH;

  const hitPath = TURN_TRACE.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${yHit(d.cacheHit)}`).join(' ');

  return (
    <figure className="glass min-w-0 overflow-hidden rounded-[24px]">
      {/* Panel chrome, borrowed from the dashboard so this reads as the product */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/10 px-5 py-3.5 sm:px-6">
        <div className="min-w-0">
          <div className="eyebrow">Multi-turn trace · measured</div>
          <div className="mt-1 truncate text-[13.5px] font-medium text-[#e6e8ec]">
            Llama-3.3-70B · 4×H100 · vLLM · swebench-multiturn · concurrency 20
          </div>
        </div>
        <div className="ml-auto flex items-center gap-4 text-[11px] text-[#a9afba]">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-[2px] bg-[#a78bfa]/70" />
            context tokens
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[#2dd4bf]" />
            cache hit rate
          </span>
        </div>
      </header>

      {/* Below ~620px the axis labels and per-turn figures would scale down to
          unreadable, so the plot keeps its width and scrolls instead. */}
      <div className="scrollbar-thin overflow-x-auto px-2 pb-1 pt-2 sm:px-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full min-w-[620px]"
          role="img"
          aria-label="Across an 88-turn SWE-bench trajectory the context grows from 1,310 to 32,101 tokens while the cache hit rate climbs to 97 percent, so measured time-to-first-token stays in the 170 to 435 millisecond range."
        >
          <defs>
            <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.08" />
            </linearGradient>
            <linearGradient id="hitGlow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* horizontal gridlines + left axis (context) */}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const y = PAD.t + IH - f * IH;
            return (
              <g key={f}>
                <line x1={PAD.l} y1={y} x2={PAD.l + IW} y2={y} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
                <text x={PAD.l - 10} y={y + 3.5} textAnchor="end" className="mono" fontSize="10" fill="#676c76">
                  {f === 0 ? '0' : `${Math.round((MAX_CTX * f) / 1000)}k`}
                </text>
                <text x={PAD.l + IW + 10} y={y + 3.5} className="mono" fontSize="10" fill="#676c76">
                  {Math.round(f * 100)}%
                </text>
              </g>
            );
          })}

          {/* context bars */}
          {TURN_TRACE.map((d, i) => {
            const y = yCtx(d.context);
            return (
              <rect
                key={d.turn}
                x={x(i) - barW / 2}
                y={y}
                width={barW}
                height={PAD.t + IH - y}
                rx="4"
                fill="url(#barFill)"
                stroke="rgba(167,139,250,0.35)"
                strokeWidth="1"
              />
            );
          })}

          {/* cache-hit area + line */}
          <path d={`${hitPath} L${x(n - 1)},${PAD.t + IH} L${x(0)},${PAD.t + IH} Z`} fill="url(#hitGlow)" />
          <path d={hitPath} fill="none" stroke="#2dd4bf" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
          {TURN_TRACE.map((d, i) => (
            <circle key={d.turn} cx={x(i)} cy={yHit(d.cacheHit)} r="4" fill="#07080a" stroke="#2dd4bf" strokeWidth="2" />
          ))}

          {/* Bar value labels are drawn LAST, with a dark halo, because the
              cache-hit line crosses the bar tops around turns 1-2 and would
              otherwise cut straight through the numbers. */}
          {TURN_TRACE.map((d, i) => (
            <text
              key={d.turn}
              x={x(i)}
              y={yCtx(d.context) - 9}
              textAnchor="middle"
              className="mono"
              fontSize="10.5"
              fill="#c9b8ff"
              stroke="#07080a"
              strokeWidth="3.5"
              strokeLinejoin="round"
              paintOrder="stroke"
            >
              {d.context.toLocaleString()}
            </text>
          ))}

          {/* baseline */}
          <line x1={PAD.l} y1={PAD.t + IH} x2={PAD.l + IW} y2={PAD.t + IH} stroke="rgba(255,255,255,0.16)" strokeWidth="1" />

          {/* per-turn footer: turn index + measured TTFT */}
          {TURN_TRACE.map((d, i) => (
            <g key={d.turn}>
              <text x={x(i)} y={PAD.t + IH + 20} textAnchor="middle" className="mono" fontSize="10.5" fill="#a9afba">
                turn {d.turn}
              </text>
              <text x={x(i)} y={PAD.t + IH + 38} textAnchor="middle" className="mono" fontSize="11.5" fill="#f3f4f6">
                {d.ttft.toFixed(0)}
                <tspan fontSize="9" fill="#676c76"> ms</tspan>
              </text>
            </g>
          ))}
        </svg>
      </div>

      <figcaption className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/10 bg-white/[0.025] px-5 py-3 text-[12px] text-[#a9afba] sm:px-6">
        <span className="text-[#f3f4f6]">25× the context, 1.3× the latency.</span>
        <span>
          Six turns sampled from an 88-turn SWE-bench trajectory; by the end, 97% of the 32k-token
          context is already resident. Bottom row is measured TTFT.
        </span>
      </figcaption>
    </figure>
  );
}
