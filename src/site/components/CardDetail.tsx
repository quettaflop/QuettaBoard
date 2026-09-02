import { Fragment } from 'react';
import type { Card } from '../siteData';
import { TurnTraceChart } from './TurnTraceChart';
import { CoverageBlock } from './CoverageBlock';
import { ValidationBlock } from './ValidationBlock';
import { VISUALS } from './visuals';
import { ArrowRight } from './icons';

/** The expanded panel for one card. Content is declarative in siteData. */
export function CardDetail({ card, onClose }: { card: Card; onClose: () => void }) {
  const Figure = card.figure === 'trace' ? null : VISUALS[card.figure];

  return (
    <div className="glass mt-4 overflow-hidden rounded-[18px]">
      <div
        className="h-[2px] w-full"
        style={{ background: `linear-gradient(90deg, ${card.accent}, ${card.accent}00)` }}
      />

      <div className="flex items-start gap-4 border-b border-white/[0.08] bg-white/[0.025] px-6 py-5 sm:px-8">
        <div className="min-w-0">
          <div className="mono text-[10.5px] tracking-[0.16em]" style={{ color: card.accent }}>
            {card.kicker.toUpperCase()}
          </div>
          <h3 className="mt-1.5 text-[17px] font-semibold tracking-[-0.01em] text-[#f3f4f6]">
            {card.name}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto shrink-0 rounded-full border border-white/10 p-1.5 text-[#8b919b] transition-colors hover:bg-white/[0.06] hover:text-[#f3f4f6]"
          aria-label={`Close ${card.name} detail`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      {/* The turn-trace chart needs ~620px to keep its axis labels legible, which
          a half-width column never gives it on a laptop — so that one figure
          gets its own full-width row instead of a side-by-side split. */}
      <div
        className={`grid gap-x-10 gap-y-8 px-6 py-7 sm:px-8 ${
          card.figure === 'trace' ? '' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'
        }`}
      >
        <div className="min-w-0">
          <p className="text-[14px] leading-relaxed text-[#c3c8d0]">{card.detail.lead}</p>

          {card.detail.backends && (
            <div className="mt-6 overflow-hidden rounded-xl border border-white/[0.08]">
              <div className="grid grid-cols-[minmax(0,0.7fr)_1fr_1fr] gap-px bg-white/[0.06] text-[12px]">
                <div className="bg-[#0d0f13]/70 px-3.5 py-2.5" />
                {card.detail.backends.cols.map((c) => (
                  <div key={c} className="mono bg-[#0d0f13]/70 px-3.5 py-2.5 font-medium" style={{ color: card.accent }}>
                    {c}
                  </div>
                ))}
                {card.detail.backends.rows.map((row) => (
                  <Fragment key={row.k}>
                    <div className="eyebrow bg-white/[0.015] px-3.5 py-3 !text-[9.5px]">
                      {row.k}
                    </div>
                    {row.v.map((v, i) => (
                      <div key={`${row.k}-${i}`} className="mono bg-white/[0.015] px-3.5 py-3 text-[#c3c8d0]">
                        {v}
                      </div>
                    ))}
                  </Fragment>
                ))}
              </div>
            </div>
          )}

          <ul className="mt-6 space-y-2.5">
            {card.detail.points.map((p) => (
              <li key={p} className="flex gap-3 text-[13.5px] leading-relaxed text-[#a9afba]">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: card.accent }} />
                {p}
              </li>
            ))}
          </ul>

          <dl className="mt-7 flex flex-wrap gap-x-8 gap-y-4 border-t border-white/[0.08] pt-5">
            {card.detail.facts.map((f) => (
              <div key={f.k}>
                <dt className="eyebrow">{f.k}</dt>
                <dd className="mono mt-1.5 text-[12px] text-[#e6e8ec]">{f.v}</dd>
              </div>
            ))}
          </dl>

          {/* "Learn more" — one per card, for going deeper than this panel. */}
          <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/[0.08] pt-5">
            <a href={card.learnMore.href} className="link-arrow">
              {card.learnMore.label} <ArrowRight size={13} />
            </a>
            {card.learnMore.note && (
              <span className="mono text-[10.5px] text-[#676c76]">({card.learnMore.note})</span>
            )}
          </div>
        </div>

        <div className="min-w-0">
          {card.figure === 'trace' ? <TurnTraceChart /> : Figure && <Figure />}
        </div>
      </div>

      {card.detail.extra === 'coverage' && <CoverageBlock />}
      {card.detail.extra === 'validation' && <ValidationBlock />}
    </div>
  );
}
