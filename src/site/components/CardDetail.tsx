import { Fragment } from 'react';
import type { Card } from '../siteData';
import { CoverageBlock } from './CoverageBlock';
import { ValidationBlock } from './ValidationBlock';
import { ArrowRight } from './icons';

/** Folded notes for one chapter. The figure lives in the chapter itself. */
export function CardDetail({ card }: { card: Card }) {
  return (
    <div className="glass overflow-hidden rounded-[8px]">
      {card.detail.backends && (
        <div className="overflow-hidden border-b border-[var(--line)]">
          <div className="grid grid-cols-[minmax(0,0.7fr)_1fr_1fr] gap-px bg-[var(--line)] text-[13px]">
            <div className="bg-[var(--raise)] px-3.5 py-2.5" />
            {card.detail.backends.cols.map((c) => (
              <div key={c} className="mono bg-[var(--raise)] px-3.5 py-2.5 text-[var(--accent)]">
                {c}
              </div>
            ))}
            {card.detail.backends.rows.map((row) => (
              <Fragment key={row.k}>
                <div className="eyebrow bg-[var(--bg)] px-3.5 py-3">{row.k}</div>
                {row.v.map((v, i) => (
                  <div key={`${row.k}-${i}`} className="mono bg-[var(--bg)] px-3.5 py-3 text-[var(--ink)]">
                    {v}
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        </div>
      )}

      <div className="px-6 py-6 sm:px-8">
        <ul className="space-y-2.5">
          {card.detail.points.map((p) => (
            <li key={p} className="flex gap-3 text-[14px] leading-relaxed">
              <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
              {p}
            </li>
          ))}
        </ul>

        <dl className="mt-7 flex flex-wrap gap-x-8 gap-y-4 border-t border-[var(--line)] pt-5">
          {card.detail.facts.map((f) => (
            <div key={f.k}>
              <dt className="eyebrow">{f.k}</dt>
              <dd className="mono mt-1.5 text-[12px] text-[var(--ink)]">{f.v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--line)] pt-5">
          <a href={card.learnMore.href} className="link-arrow">
            {card.learnMore.label} <ArrowRight size={13} />
          </a>
        </div>
      </div>

      {card.detail.extra === 'coverage' && <CoverageBlock />}
      {card.detail.extra === 'validation' && <ValidationBlock />}
    </div>
  );
}
