import { useEffect, useRef, useState, type MouseEvent } from 'react';

type Theme = 'dark' | 'light';

type ViewTransition = { ready: Promise<void> };

function readTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f4f1ea' : '#0b0e12');
  try {
    localStorage.setItem('qf-theme', theme);
  } catch {
    /* private mode */
  }
}

function Sun() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.6" />
      <path d="M12 3v2.2M12 18.8V21M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M3 12h2.2M18.8 12H21M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
    </svg>
  );
}

function Moon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.5 14.2A8.2 8.2 0 1 1 9.8 3.5 6.6 6.6 0 0 0 20.5 14.2z" />
    </svg>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const busy = useRef(false);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggle = async (e: MouseEvent<HTMLButtonElement>) => {
    if (busy.current) return;
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => ViewTransition;
    };

    const swap = () => {
      applyTheme(next);
      setTheme(next);
    };

    if (reduced || !doc.startViewTransition) {
      swap();
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    busy.current = true;
    try {
      const vt = doc.startViewTransition(swap);
      await vt.ready;
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${Math.ceil(endRadius)}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 640,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      );
    } finally {
      window.setTimeout(() => {
        busy.current = false;
      }, 680);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className="flex items-center text-[var(--ink-2)] transition-colors hover:text-[var(--accent)]"
    >
      {theme === 'dark' ? <Sun /> : <Moon />}
    </button>
  );
}
