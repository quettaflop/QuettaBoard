import { useCallback, useEffect, useState } from 'react';
import { CARDS, type Card } from '../siteData';
import { CardDetail } from './CardDetail';
import { TurnTraceChart } from './TurnTraceChart';
import { VISUALS } from './visuals';

function Figure({ card }: { card: Card }) {
  if (card.figure === 'trace') return <TurnTraceChart />;
  const Visual = VISUALS[card.figure];
  return Visual ? <Visual /> : null;
}

/**
 * Three stacked chapters. Figure is always visible; only the extra tables
 * fold. Hash still opens a chapter.
 */
export function CardDeck() {
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.replace(/^#\/?/, '');
      setOpen(CARDS.some((c) => c.id === id) ? id : null);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  const toggle = useCallback((id: string) => {
    const next = open === id ? null : id;
    const url = `${window.location.pathname}${window.location.search}${next ? `#${next}` : ''}`;
    window.history.replaceState(null, '', url);
    setOpen(next);
  }, [open]);

  return (
    <div>
      {CARDS.map((card, i) => {
        const isOpen = open === card.id;
        return (
          <article
            key={card.id}
            id={card.id}
            data-open={isOpen ? 'true' : 'false'}
            className="chapter"
          >
            <div className="shell grid gap-10 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
              <div className="flex gap-5">
                <div className="chapter-rail hidden w-0.5 shrink-0 self-stretch sm:block" />
                <div className="min-w-0">
                  <div className="flex items-baseline gap-3">
                    <span className="mono text-[12px] text-[var(--accent)]">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="eyebrow">{card.kicker}</span>
                  </div>
                  <h2 className="mt-3 text-[clamp(1.4rem,2.2vw,1.85rem)]">{card.name}</h2>
                  <p className="mt-3 text-[15px] leading-relaxed">{card.summary}</p>
                  <p className="mt-4 text-[15px] leading-relaxed">{card.detail.lead}</p>
                  <button
                    type="button"
                    onClick={() => toggle(card.id)}
                    aria-expanded={isOpen}
                    aria-controls={`${card.id}-extra`}
                    className="notes-btn"
                  >
                    {isOpen ? 'Hide notes' : 'Read notes'}
                    <span aria-hidden="true">{isOpen ? '↑' : '↓'}</span>
                  </button>
                </div>
              </div>
              <div className="min-w-0">
                <Figure card={card} />
              </div>
            </div>

            <div
              id={`${card.id}-extra`}
              className="expand"
              data-open={isOpen ? 'true' : 'false'}
              role="region"
              aria-label={`${card.name} notes`}
              inert={!isOpen}
            >
              <div>
                <div className="expand-inner">
                  <div className="shell pb-14">
                    <CardDetail card={card} />
                  </div>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
