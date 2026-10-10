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
    <section id="work" className="work-section shell" aria-labelledby="work-title">
      <div className="section-heading">
        <p className="eyebrow">The Quettaflop stack</p>
        <h2 id="work-title">Measure. Predict. Serve.</h2>
        <p>One loop, from real workloads to the hardware that runs them.</p>
      </div>
      {CARDS.map((card, i) => {
        const isOpen = open === card.id;
        return (
          <article
            key={card.id}
            id={card.id}
            data-open={isOpen ? 'true' : 'false'}
            className="chapter"
          >
            <div className="chapter-main">
              <div className="chapter-copy">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-3">
                    <span className="mono text-[12px] text-[var(--accent)]">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="eyebrow">{card.kicker}</span>
                  </div>
                  <h3 className="chapter-title">{card.name}</h3>
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
                  <div className="chapter-notes">
                    <CardDetail card={card} />
                  </div>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
