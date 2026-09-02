import { useCallback, useEffect, useRef, useState } from 'react';
import { CARDS, type Card } from '../siteData';
import { CardDetail } from './CardDetail';

/**
 * Four summary cards; clicking one reveals its detail below the grid.
 *
 * In-page expand rather than a page per card: the site is a single static entry
 * with no router, so separate pages would mean either extra HTML entries or a
 * router plus server rewrites — and a path-routed SPA does not survive a static
 * host without them. Expanding keeps it to one file and one chunk.
 *
 * The open card is mirrored into the URL hash, so a detail view is still
 * linkable and the back button still works — the part of "separate pages" that
 * actually matters, without the routing.
 */
export function CardDeck() {
  const [open, setOpen] = useState<string | null>(null);

  // The panel's content stays mounted after closing so the collapse has
  // something to animate to zero. It is inert while closed, so nothing hidden
  // is reachable by keyboard or screen reader.
  const [shown, setShown] = useState<Card | null>(null);

  useEffect(() => {
    if (!open) return;
    const card = CARDS.find((c) => c.id === open);
    if (card) setShown(card);
  }, [open]);

  // Nudge the panel into view, but only when opening actually left it
  // off-screen. On a laptop the panel sits right under the cards and is already
  // visible, so scrolling every click would be motion for its own sake.
  const panelRef = useRef<HTMLDivElement | null>(null);
  const prevOpen = useRef<string | null>(null);
  useEffect(() => {
    const justOpened = open && !prevOpen.current;
    prevOpen.current = open;
    if (!justOpened) return;

    // Wait for the height transition to have started so the measurement is
    // against the expanding panel, not a zero-height box.
    const t = window.setTimeout(() => {
      const el = panelRef.current;
      if (!el) return;
      const { top, bottom } = el.getBoundingClientRect();
      const offscreen = bottom > window.innerHeight && top > window.innerHeight * 0.55;
      if (offscreen) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 120);
    return () => window.clearTimeout(t);
  }, [open]);

  // Deep links (/#predict) and back/forward both drive the open card.
  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.replace(/^#\/?/, '');
      setOpen(CARDS.some((c) => c.id === id) ? id : null);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  const toggle = useCallback(
    (id: string) => {
      const next = open === id ? null : id;
      // replaceState, not a hash assignment: opening a card should not add a
      // history entry per click, but the URL should still be copyable.
      const url = `${window.location.pathname}${window.location.search}${next ? `#${next}` : ''}`;
      window.history.replaceState(null, '', url);
      setOpen(next);
    },
    [open],
  );

  return (
    <section className="shell glow-field pb-10 pt-10">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((card) => {
          const isOpen = open === card.id;
          return (
            <li key={card.id}>
              <button
                type="button"
                onClick={() => toggle(card.id)}
                aria-expanded={isOpen}
                aria-controls="card-detail"
                style={{ ['--card-accent' as string]: card.accent }}
                className={`card-btn glass glass-hover flex h-full w-full flex-col rounded-[16px] p-6 text-left ${
                  isOpen ? 'border-white/25 bg-white/[0.06]' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: card.accent }} />
                  <span className="mono text-[10.5px] tracking-[0.16em] text-[#8b919b]">
                    {card.kicker.toUpperCase()}
                  </span>
                </div>
                <h2 className="mt-4 text-[16px] font-semibold tracking-[-0.01em] text-[#f3f4f6]">
                  {card.name}
                </h2>
                <p className="mt-2.5 flex-1 text-[13px] leading-relaxed text-[#a9afba]">
                  {card.summary}
                </p>
                <span className="mono mt-5 flex items-center gap-1.5 text-[11px] text-[#676c76]">
                  {isOpen ? 'Hide detail' : 'Detail'}
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                    style={{ transitionTimingFunction: 'cubic-bezier(.22,1,.36,1)' }}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Always mounted; height is the animation. */}
      <div
        ref={panelRef}
        id="card-detail"
        className="expand"
        data-open={open ? 'true' : 'false'}
        role="region"
        aria-label="Card detail"
        inert={!open}
      >
        <div>
          <div className="expand-inner">
            {shown && (
              // Keyed on the card so switching re-runs the fade, covering the
              // instant height change that a still-open panel cannot animate.
              <div key={shown.id} className="panel-body">
                <CardDetail card={shown} onClose={() => toggle(shown.id)} />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
