import { useEffect, useState } from 'react';
import { CONTACT_EMAIL } from '../siteData';

/**
 * Signature under the pitch: a label, a copy chip, a helper. Not a card.
 */
export function ContactCard() {
  const [copied, setCopied] = useState(false);
  const [flash, setFlash] = useState(0);
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest('a[href="#contact"]')) {
        setFlash((n) => n + 1);
        setFlashing(true);
      }
    };
    document.addEventListener('click', onClick);
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
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <div id="contact" className="contact-row">
      <span className="contact-row-label">Contact</span>
      <button
        key={flash}
        type="button"
        onClick={copy}
        onAnimationEnd={() => setFlashing(false)}
        aria-label={`Copy ${CONTACT_EMAIL} to clipboard`}
        title="Click to copy"
        className={`contact-chip${flashing ? ' contact-flash' : ''}${copied ? ' is-copied' : ''}`}
      >
        {CONTACT_EMAIL}
        {copied ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
        <span className="sr-only" aria-live="polite">{copied ? 'Copied' : ''}</span>
      </button>
      <span className="contact-row-help">
        Benchmark requests and API access to our products.
      </span>
    </div>
  );
}
