import { HARDWARE, MODELS } from '../siteData';

/** Hardware × parallelism grid and the model list. Data, not prose. */
export function CoverageBlock() {
  return (
    <div className="grid gap-px border-t border-white/[0.08] bg-white/[0.06] lg:grid-cols-2">
      <section className="bg-white/[0.015] px-6 py-7 sm:px-8">
        <div className="flex items-baseline justify-between">
          <h4 className="text-[13px] font-semibold text-[#e6e8ec]">Hardware</h4>
          <span className="mono text-[10px] tracking-[0.14em] text-[#676c76]">14 CONFIGS</span>
        </div>
        <ul className="mt-5 space-y-4">
          {HARDWARE.map((h) => (
            <li key={h.name}>
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-[13px] text-[#e6e8ec]">{h.name}</span>
                <span className="mono text-[10px] text-[#676c76]">{h.tier}</span>
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                {[1, 2, 4, 8].map((w) => {
                  const on = (h.widths as readonly number[]).includes(w);
                  return (
                    <span
                      key={w}
                      title={on ? `${w}× tested` : `${w}× not in corpus`}
                      className={`mono flex h-6 flex-1 items-center justify-center rounded text-[10.5px] ${
                        on
                          ? 'border border-[#2dd4bf]/30 bg-[#2dd4bf]/10 text-[#7ff0e0]'
                          : 'border border-dashed border-white/[0.09] text-[#3a3d44]'
                      }`}
                    >
                      {w}×
                    </span>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-[11.5px] leading-relaxed text-[#8b919b]">
          Filled cells are tensor-parallel widths present in the corpus. All runs BF16, on
          committed server baselines.
        </p>
      </section>

      <section className="bg-white/[0.015] px-6 py-7 sm:px-8">
        <div className="flex items-baseline justify-between">
          <h4 className="text-[13px] font-semibold text-[#e6e8ec]">Models</h4>
          <span className="mono text-[10px] tracking-[0.14em] text-[#676c76]">8B → 120B</span>
        </div>
        <ul className="mt-5 grid gap-px overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.06] sm:grid-cols-2">
          {MODELS.map((m, i) => (
            <li
              key={m.name}
              className={`flex items-center justify-between gap-3 bg-[#0d0f13]/70 px-3.5 py-2.5 ${
                i === MODELS.length - 1 && MODELS.length % 2 === 1 ? 'sm:col-span-2' : ''
              }`}
            >
              <span className="mono truncate text-[11.5px] text-[#e6e8ec]">{m.name}</span>
              <span
                className={`mono shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] ${
                  m.kind === 'MoE'
                    ? 'bg-[#a78bfa]/12 text-[#c9b8ff] ring-1 ring-inset ring-[#a78bfa]/25'
                    : 'bg-white/[0.05] text-[#a9afba] ring-1 ring-inset ring-white/[0.08]'
                }`}
              >
                {m.kind === 'MoE' ? 'MoE' : m.params}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-[11.5px] leading-relaxed text-[#8b919b]">
          Agent traces are reduced to measured length and arrival distributions, then replayed, so
          a profile is reproducible without shipping the raw trajectories.
        </p>
      </section>
    </div>
  );
}
