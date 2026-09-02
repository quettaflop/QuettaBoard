import { useEffect, useState } from 'react';
import { CONTACT_EMAIL } from '../siteData';

/**
 * Contact, in the same register as everything else on the page: a slim glass
 * row, not a banner. The address is data — set mono, left-aligned, at reading
 * size — with a copy affordance beside it. No form: a form needs a backend,
 * and this site deliberately has none.
 */
export function ContactCard() {
  const [copied, setCopied] = useState(false);
  // Two pieces of state, doing two different jobs:
  //   flash    — a counter used as the row's key, so every click remounts the
  //              node and the animation restarts from zero, rapid repeats
  //              included.
  //   flashing — whether the animation is actually in flight, so the class can
  //              come off when it ends. Without this the class would linger
  //              forever and the DOM would claim to be mid-flash at rest.
  const [flash, setFlash] = useState(0);
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    // Click delegation on document, NOT hashchange: hashchange stays silent
    // when the hash is already #contact, and the whole point is to re-flash
    // on every "Contact" click no matter where the visitor already is.
    const onClick = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest('a[href="#contact"]')) {
        setFlash((n) => n + 1);
        setFlashing(true);
      }
    };
    document.addEventListener('click', onClick);
    // Arriving on a #contact deep link should shine once too.
    if (window.location.hash === '#contact') {
      setFlash((n) => n + 1);
      setFlashing(true);
    }
    return () => document.removeEventListener('click', onClick);
  }, []);

  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      ok = true;
    } catch {
      // The async clipboard API is blocked in sandboxed iframes (e.g. embedded
      // previews) and on plain http. execCommand('copy') still works there on
      // a user gesture, so fall back to it via a throwaway textarea.
      try {
        const ta = document.createElement('textarea');
        ta.value = CONTACT_EMAIL;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch {
        ok = false;
      }
    }
    // The tick only ever reports a copy that actually happened — if both paths
    // fail, the address is plain text in the button and hand-selection remains.
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <section id="contact" className="shell pb-16">
      <div
        key={flash}
        onAnimationEnd={() => setFlashing(false)}
        className={`glass flex flex-col gap-4 rounded-[16px] px-6 py-5 sm:flex-row sm:items-center sm:px-7${flashing ? ' contact-flash' : ''}`}
      >
        <div className="min-w-0">
          <div className="eyebrow">Contact</div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#a9afba]">
            Benchmark requests and API access to our products.
          </p>
        </div>

        {/* The chip IS the copy button — no mailto, so clicking never yanks the
            visitor into a mail app. Feedback happens in place. */}
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${CONTACT_EMAIL} to clipboard`}
          title="Click to copy"
          className={`mono flex items-center gap-2.5 rounded-lg border px-3.5 py-2 text-[13px] transition-colors sm:ml-auto sm:shrink-0 ${
            copied
              ? 'border-[#34d399]/50 bg-[#34d399]/10 text-[#6ee7b7]'
              : 'border-white/10 bg-white/[0.03] text-[#e6e8ec] hover:border-[#2dd4bf]/40 hover:bg-white/[0.05] hover:text-[#7ff0e0]'
          }`}
        >
          {CONTACT_EMAIL}
          {copied ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" opacity="0.65">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
          <span className="sr-only" aria-live="polite">{copied ? 'Copied' : ''}</span>
        </button>
      </div>
    </section>
  );
}
