import { HARDWARE, MODELS } from '../siteData';

/** Hardware × parallelism grid and the model list. Data, not prose. */
export function CoverageBlock() {
  return (
    <div className="grid gap-px border-t border-[var(--line)] bg-[var(--line)] lg:grid-cols-2">
      <section className="bg-[var(--bg)] px-6 py-7 sm:px-8">
        <div className="flex items-baseline justify-between">
          <h4 className="text-[13px] font-normal text-[var(--ink)]">Hardware</h4>
          <span className="mono text-[10px] tracking-[0.14em] text-[var(--ink-3)]">14 CONFIGS</span>
        </div>
        <ul className="mt-5 space-y-4">
          {HARDWARE.map((h) => (
            <li key={h.name}>
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-[13px] text-[var(--ink)]">{h.name}</span>
                <span className="mono text-[10px] text-[var(--ink-3)]">{h.tier}</span>
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
                          ? 'border border-[rgba(201,163,106,0.35)] bg-[rgba(201,163,106,0.10)] text-[var(--accent)]'
                          : 'border border-dashed border-[var(--line)] text-[var(--idle)]'
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
        <p className="mt-6 text-[11.5px] leading-relaxed text-[var(--ink-2)]">
          Filled cells are tensor-parallel widths present in the corpus. All runs BF16, on
          committed server baselines.
        </p>
      </section>

      <section className="bg-[var(--bg)] px-6 py-7 sm:px-8">
        <div className="flex items-baseline justify-between">
          <h4 className="text-[13px] font-normal text-[var(--ink)]">Models</h4>
          <span className="mono text-[10px] tracking-[0.14em] text-[var(--ink-3)]">8B → 120B</span>
        </div>
        <ul className="mt-5 grid gap-px overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2">
          {MODELS.map((m, i) => (
            <li
              key={m.name}
              className={`flex items-center justify-between gap-3 bg-[var(--well)] px-3.5 py-2.5 ${
                i === MODELS.length - 1 && MODELS.length % 2 === 1 ? 'sm:col-span-2' : ''
              }`}
            >
              <span className="mono truncate text-[11.5px] text-[var(--ink)]">{m.name}</span>
              <span
                className={`mono shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] ${
                  m.kind === 'MoE'
                    ? 'bg-[rgba(201,163,106,0.12)] text-[var(--accent)] ring-1 ring-inset ring-[rgba(201,163,106,0.3)]'
                    : 'bg-[var(--cell)] text-[var(--ink-2)] ring-1 ring-inset ring-[var(--line)]'
                }`}
              >
                {m.kind === 'MoE' ? 'MoE' : m.params}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-[11.5px] leading-relaxed text-[var(--ink-2)]">
          Agent traces are reduced to measured length and arrival distributions, then replayed, so
          a profile is reproducible without shipping the raw trajectories.
        </p>
      </section>
    </div>
  );
}
