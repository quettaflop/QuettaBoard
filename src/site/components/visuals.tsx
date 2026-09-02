/* ----------------------------------------------------------------------------
   Product visuals. One bespoke SVG per module — no stock illustration and no
   raster assets, so each stays crisp and each says something specific about
   the thing it sits next to. All geometry is deterministic (no Math.random),
   so the page renders identically every load.
   -------------------------------------------------------------------------- */

const VB = { w: 560, h: 360 };

function Frame({ children, accent }: { children: React.ReactNode; accent: string }) {
  return (
    <div className="glass min-w-0 overflow-hidden rounded-[8px]">
      <div
        className="h-[3px] w-full"
        style={{ background: `linear-gradient(90deg, ${accent}00, ${accent}aa 45%, ${accent}00)` }}
      />
      {/* Same reasoning as the hero trace: keep the drawing legible on a phone
          and let it scroll rather than shrinking its labels away. */}
      <div className="scrollbar-thin overflow-x-auto">
        <svg viewBox={`0 0 ${VB.w} ${VB.h}`} className="h-auto w-full min-w-[480px]" aria-hidden="true">
          {children}
        </svg>
      </div>
    </div>
  );
}

const GRID_STROKE = 'var(--grid)';

function Grid({ x0 = 46, y0 = 28, x1 = 520, y1 = 300, rows = 4, cols = 6 }) {
  const lines = [];
  for (let i = 0; i <= rows; i++) {
    const y = y0 + ((y1 - y0) / rows) * i;
    lines.push(<line key={`h${i}`} x1={x0} y1={y} x2={x1} y2={y} stroke={GRID_STROKE} strokeWidth="1" />);
  }
  for (let i = 0; i <= cols; i++) {
    const x = x0 + ((x1 - x0) / cols) * i;
    lines.push(<line key={`v${i}`} x1={x} y1={y0} x2={x} y2={y1} stroke={GRID_STROKE} strokeWidth="1" />);
  }
  return <g>{lines}</g>;
}

/* ---------------------------------------------------- QuettaBench: latency fan
   Latency against concurrency for four profiles. The point of the picture is
   that the curves separate — the workload, not just the hardware, sets the
   knee. */
export function BenchVisual() {
  // x1 leaves ~76px of gutter on the right: the series labels sit outside the
  // plot at each curve's final point, so they need room or they clip.
  const x0 = 52, y0 = 28, x1 = 452, y1 = 300;
  const conc = [1, 5, 10, 20, 40, 80, 120];
  const series = [
    // labelDy nudges the end-of-line label off its neighbour: swebench and
    // osworld converge at high concurrency and would otherwise sit on top of
    // each other.
    { name: 'chat 1-turn', color: 'var(--plot-1)', labelDy: 3.5,  pts: [0.06, 0.09, 0.12, 0.18, 0.28, 0.44, 0.58] },
    { name: 'chat n-turn', color: 'var(--plot-2)', labelDy: 3.5,  pts: [0.10, 0.15, 0.21, 0.31, 0.47, 0.68, 0.83] },
    { name: 'swebench',    color: 'var(--plot-3)', labelDy: 9,    pts: [0.14, 0.22, 0.31, 0.45, 0.63, 0.84, 0.95] },
    { name: 'osworld',     color: 'var(--plot-4)', labelDy: -5,   pts: [0.19, 0.29, 0.40, 0.56, 0.74, 0.90, 0.98] },
  ];
  const px = (i: number) => x0 + ((x1 - x0) / (conc.length - 1)) * i;
  const py = (v: number) => y1 - v * (y1 - y0);

  return (
    <Frame accent="var(--accent)">
      <Grid x0={x0} y0={y0} x1={x1} y1={y1} />
      {series.map((s) => {
        const d = s.pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${px(i)},${py(v)}`).join(' ');
        return (
          <g key={s.name}>
            <path d={d} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinecap="round" opacity="0.95" />
            {s.pts.map((v, i) => (
              <circle key={i} cx={px(i)} cy={py(v)} r="2.9" fill="var(--plot-dot)" stroke={s.color} strokeWidth="1.6" />
            ))}
            <text
              x={px(conc.length - 1) + 10}
              y={py(s.pts[s.pts.length - 1]) + s.labelDy}
              fontSize="9.5"
              fill={s.color}
              fontFamily="IBM Plex Mono, ui-monospace, monospace"
              opacity="0.9"
            >
              {s.name}
            </text>
          </g>
        );
      })}
      {conc.map((c, i) => (
        <text key={c} x={px(i)} y={y1 + 18} textAnchor="middle" fontSize="9.5" fill="var(--ink-3)" fontFamily="IBM Plex Mono, ui-monospace, monospace">
          {c}
        </text>
      ))}
      <text x={x0} y={y1 + 36} fontSize="9.5" fill="var(--ink-3)" fontFamily="IBM Plex Mono, ui-monospace, monospace">
        CONCURRENCY →
      </text>
      <text x={16} y={y1} fontSize="9.5" fill="var(--ink-3)" fontFamily="IBM Plex Mono, ui-monospace, monospace" transform={`rotate(-90 16 ${y1})`}>
        p99 TTFT →
      </text>
    </Frame>
  );
}

/* ------------------------------------------------- QuettaSim: predicted vs real
   A parity plot. The diagonal is perfect prediction; the band is the tolerance
   the simulator is scored against. Points are the shape of a real scatter —
   tight in the middle of the grid, looser at the extremes. */
export function SimVisual() {
  const x0 = 60, y0 = 30, x1 = 510, y1 = 296;
  const pts: [number, number][] = [
    [0.08, 0.10], [0.12, 0.13], [0.17, 0.16], [0.21, 0.24], [0.26, 0.25],
    [0.31, 0.29], [0.34, 0.38], [0.39, 0.40], [0.44, 0.42], [0.48, 0.51],
    [0.52, 0.50], [0.57, 0.61], [0.61, 0.58], [0.66, 0.68], [0.70, 0.72],
    [0.74, 0.70], [0.78, 0.84], [0.82, 0.79], [0.87, 0.90], [0.91, 0.86],
    [0.15, 0.27], [0.29, 0.19], [0.63, 0.47], [0.85, 0.66],
  ];
  const px = (v: number) => x0 + v * (x1 - x0);
  const py = (v: number) => y1 - v * (y1 - y0);
  const band = 0.14;

  return (
    <Frame accent="var(--accent)">
      <Grid x0={x0} y0={y0} x1={x1} y1={y1} rows={5} cols={5} />
      {/* ±band tolerance envelope around parity */}
      <path
        d={`M${px(0)},${py(band)} L${px(1 - band)},${py(1)} L${px(1)},${py(1)} L${px(1)},${py(1 - band)} L${px(band)},${py(0)} L${px(0)},${py(0)} Z`}
        fill="rgba(201,163,106,0.12)"
      />
      <line x1={px(0)} y1={py(0)} x2={px(1)} y2={py(1)} stroke="rgba(201,163,106,0.55)" strokeWidth="1.6" strokeDasharray="5 4" />
      {pts.map(([m, p], i) => (
        <circle key={i} cx={px(m)} cy={py(p)} r="4.2" fill="rgba(201,163,106,0.45)" stroke="var(--accent)" strokeWidth="1.3" />
      ))}
      <text x={px(0.52)} y={py(0.62)} fontSize="9.5" fill="var(--accent)" fontFamily="IBM Plex Mono, ui-monospace, monospace" transform={`rotate(-31 ${px(0.52)} ${py(0.62)})`}>
        perfect prediction
      </text>
      <text x={x0} y={y1 + 22} fontSize="9.5" fill="var(--ink-3)" fontFamily="IBM Plex Mono, ui-monospace, monospace">
        MEASURED →
      </text>
      <text x={22} y={y1} fontSize="9.5" fill="var(--ink-3)" fontFamily="IBM Plex Mono, ui-monospace, monospace" transform={`rotate(-90 22 ${y1})`}>
        PREDICTED →
      </text>
    </Frame>
  );
}

/* --------------------------------------------- QuettaBoard: the product itself
   A reduced drawing of the dashboard: nav, scope rail, KPI tiles, chart. */
export function BoardVisual() {
  const bars = [0.34, 0.52, 0.41, 0.68, 0.58, 0.79, 0.71, 0.9, 0.83, 0.96];
  return (
    <Frame accent="var(--accent)">
      {/* window chrome */}
      <rect x="26" y="22" width="508" height="316" rx="12" fill="var(--cell)" stroke="var(--line)" />
      <line x1="26" y1="52" x2="534" y2="52" stroke="var(--line)" />
      <rect x="40" y="33" width="18" height="12" rx="4" fill="rgba(201,163,106,0.45)" />
      <rect x="64" y="35" width="62" height="8" rx="4" fill="rgba(255,255,255,0.16)" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={150 + i * 46} y="35" width="36" height="8" rx="4" fill="rgba(255,255,255,0.08)" />
      ))}
      <circle cx="502" cy="39" r="3.5" fill="var(--accent)" />
      <rect x="470" y="35" width="22" height="8" rx="4" fill="rgba(255,255,255,0.1)" />

      {/* scope rail */}
      <rect x="40" y="64" width="150" height="16" rx="8" fill="rgba(255,255,255,0.045)" stroke="var(--line)" />
      <rect x="43" y="67" width="52" height="10" rx="5" fill="rgba(255,255,255,0.12)" />

      {/* KPI tiles */}
      {[
        { label: '5,756', w: 150 },
        { label: '14', w: 150 },
        { label: '9', w: 152 },
      ].map((t, i) => (
        <g key={i}>
          <rect x={40 + i * 156} y="92" width={t.w} height="56" rx="10" fill="rgba(255,255,255,0.028)" stroke="var(--line)" />
          <rect x={52 + i * 156} y="104" width="54" height="6" rx="3" fill="rgba(255,255,255,0.14)" />
          <text x={52 + i * 156} y="136" fontSize="19" fill="var(--ink)" fontFamily="IBM Plex Mono, ui-monospace, monospace">
            {t.label}
          </text>
        </g>
      ))}

      {/* chart panel */}
      <rect x="40" y="160" width="454" height="160" rx="10" fill="rgba(255,255,255,0.022)" stroke="var(--line)" />
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="56" y1={176 + (1 - f) * 122} x2="478" y2={176 + (1 - f) * 122} stroke="rgba(255,255,255,0.055)" />
      ))}
      {bars.map((v, i) => {
        const bw = 26, gap = 15;
        const x = 62 + i * (bw + gap);
        const h = v * 116;
        return (
          <g key={i}>
            <rect x={x} y={298 - h} width={bw} height={h} rx="4" fill="rgba(201,163,106,0.18)" stroke="rgba(201,163,106,0.45)" />
            <rect x={x} y={298 - h * 0.62} width={bw} height={h * 0.62} rx="4" fill="rgba(201,163,106,0.4)" />
          </g>
        );
      })}
      <line x1="56" y1="298" x2="478" y2="298" stroke="rgba(255,255,255,0.16)" />
    </Frame>
  );
}

/* ------------------------------------------------- QuettaServe: fleet topology
   Proxy → scheduler → GPU replicas, with one replica draining. */
export function ServeVisual() {
  const gpus = [
    { x: 96,  state: 'live' },
    { x: 208, state: 'live' },
    { x: 320, state: 'drain' },
    { x: 432, state: 'live' },
  ] as const;
  const color = (s: string) => (s === 'drain' ? 'var(--ink-3)' : 'var(--accent)');

  return (
    <Frame accent="var(--accent)">
      {/* ingress */}
      <rect x="196" y="34" width="168" height="34" rx="10" fill="var(--cell)" stroke="var(--line-2)" />
      <text x="280" y="56" textAnchor="middle" fontSize="11.5" fill="var(--ink)" fontFamily="IBM Plex Mono, ui-monospace, monospace">
        api-proxy
      </text>

      {/* scheduler */}
      <rect x="164" y="112" width="232" height="38" rx="10" fill="rgba(201,163,106,0.09)" stroke="rgba(201,163,106,0.32)" />
      <text x="280" y="136" textAnchor="middle" fontSize="11.5" fill="var(--accent)" fontFamily="IBM Plex Mono, ui-monospace, monospace">
        k8s-operator · placement
      </text>
      <line x1="280" y1="68" x2="280" y2="112" stroke="var(--line-2)" strokeWidth="1.4" />

      {/* fan-out to replicas */}
      {gpus.map((g) => (
        <path
          key={g.x}
          d={`M280,150 C280,182 ${g.x + 32},182 ${g.x + 32},214`}
          fill="none"
          stroke={g.state === 'drain' ? 'rgba(125,119,106,0.5)' : 'rgba(201,163,106,0.4)'}
          strokeWidth="1.6"
          strokeDasharray={g.state === 'drain' ? '4 4' : undefined}
        />
      ))}

      {/* replicas */}
      {gpus.map((g, i) => (
        <g key={g.x}>
          <rect
            x={g.x}
            y={214}
            width="64"
            height="72"
            rx="10"
            fill="var(--cell)"
            stroke={g.state === 'drain' ? 'rgba(125,119,106,0.45)' : 'rgba(201,163,106,0.35)'}
          />
          {/* die */}
          <rect x={g.x + 18} y={230} width="28" height="28" rx="4" fill="var(--cell)" stroke={color(g.state)} strokeOpacity="0.6" />
          {[0, 1, 2].map((k) => (
            <line key={k} x1={g.x + 24 + k * 8} y1={230} x2={g.x + 24 + k * 8} y2={224} stroke={color(g.state)} strokeOpacity="0.45" strokeWidth="1.4" />
          ))}
          <circle cx={g.x + 32} cy={270} r="3" fill={color(g.state)} />
          <text x={g.x + 32} y={302} textAnchor="middle" fontSize="9.5" fill="var(--ink-2)" fontFamily="IBM Plex Mono, ui-monospace, monospace">
            gpu-{i}
          </text>
          <text x={g.x + 32} y={316} textAnchor="middle" fontSize="8.5" fill={color(g.state)} fontFamily="IBM Plex Mono, ui-monospace, monospace">
            {g.state}
          </text>
        </g>
      ))}
    </Frame>
  );
}

export const VISUALS = {
  bench: BenchVisual,
  sim: SimVisual,
  board: BoardVisual,
  serve: ServeVisual,
} as const;
