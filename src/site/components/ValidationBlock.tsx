import { VALIDATION } from '../siteData';

/**
 * The simulator's error, with the scope it was measured on stated next to it.
 * The bar is filled by the error, so shorter is better — labelled, because a
 * filled track otherwise reads as a score.
 */
export function ValidationBlock() {
  return (
    <div className="border-t border-white/[0.08] bg-white/[0.02] px-6 py-7 sm:px-8">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h4 className="text-[13px] font-semibold text-[#e6e8ec]">Prediction error</h4>
        <span className="mono text-[10px] tracking-[0.14em] text-[#676c76]">
          MEDIAN ERROR · {VALIDATION.hardware}
        </span>
      </div>

      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        {VALIDATION.metrics.map((m) => (
          <div key={m.name}>
            <div className="flex items-baseline gap-2">
              <span className="mono text-[11px] tracking-[0.14em] text-[#a9afba]">{m.name}</span>
              <span className="mono-nums ml-auto text-[22px] font-medium leading-none text-[#f3f4f6]">
                {m.mdape}
                <span className="ml-0.5 text-[13px] text-[#676c76]">%</span>
              </span>
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(m.mdape, 100)}%`,
                  background: 'linear-gradient(90deg, #2dd4bf, #a78bfa)',
                }}
              />
            </div>
            <div className="mono mt-1.5 flex justify-between text-[9px] tracking-[0.1em] text-[#4f545d]">
              <span>0% · SHORTER IS BETTER</span>
              <span>100%</span>
            </div>
            <p className="mt-2 text-[11.5px] text-[#8b919b]">{m.blurb}</p>
          </div>
        ))}
      </div>

      <p className="mt-6 border-t border-white/[0.08] pt-4 text-[11.5px] leading-relaxed text-[#8b919b]">
        {VALIDATION.note}
      </p>
    </div>
  );
}
