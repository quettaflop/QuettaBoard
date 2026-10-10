import type { CSSProperties, PointerEvent } from 'react';
import brandMark from '../assets/brand-mark.png';
import { sitePageHref, siteSectionHref, type SitePage } from '../sitePaths';
import { ThemeToggle } from './ThemeToggle';

export function SiteNav({ page }: { page: SitePage }) {
  const moveShine = (event: PointerEvent<HTMLAnchorElement>) => {
    if (event.pointerType !== 'mouse') return;
    const logo = event.currentTarget;
    const bounds = logo.getBoundingClientRect();
    logo.style.setProperty('--logo-x', `${event.clientX - bounds.left}px`);
    logo.style.setProperty('--logo-y', `${event.clientY - bounds.top}px`);
  };

  return (
    <nav className="site-nav shell" aria-label="Main navigation">
      <div className="nav-pages">
        <a href={sitePageHref('home')} aria-current={page === 'home' ? 'page' : undefined} className="nav-link">Home</a>
        <a href={siteSectionHref('work', page)} className="nav-link">Work</a>
        <a href={sitePageHref('efficiency')} aria-current={page === 'efficiency' ? 'page' : undefined} className="nav-link">Index</a>
        <a href={sitePageHref('blog')} aria-current={page === 'blog' ? 'page' : undefined} className="nav-link">Blog</a>
        <a href={sitePageHref('careers')} aria-current={page === 'careers' ? 'page' : undefined} className="nav-link">Careers</a>
      </div>
      <a
        href={sitePageHref('home')}
        className="nav-brand"
        aria-label="Quettaflop AI — home"
        onPointerEnter={moveShine}
        onPointerMove={moveShine}
        style={{ '--brand-mark': `url("${brandMark}")` } as CSSProperties}
      >
        <img src={brandMark} alt="" draggable={false} />
      </a>
      <div className="nav-actions">
        <a href="https://github.com/quettaflop" className="nav-icon" aria-label="Quettaflop on GitHub">
          <svg viewBox="0 0 24 24" width="23" height="23" fill="currentColor" aria-hidden="true">
            <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.86c-2.78.6-3.37-1.18-3.37-1.18-.45-1.15-1.11-1.46-1.11-1.46-.91-.62.07-.61.07-.61 1 .08 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.64-1.34-2.22-.25-4.55-1.11-4.55-4.95 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.03a9.58 9.58 0 0 1 5 0c1.91-1.3 2.75-1.03 2.75-1.03.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.85-2.34 4.7-4.57 4.95.36.31.68.92.68 1.85v2.74c0 .26.18.58.69.48A10 10 0 0 0 12 2Z" />
          </svg>
        </a>
        <a href="https://www.linkedin.com/company/quettaflop-ai" className="nav-icon" aria-label="Quettaflop on LinkedIn">
          <svg viewBox="0 0 24 24" width="23" height="23" fill="currentColor" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
            <circle cx="7.5" cy="8" r="1.1" />
            <path d="M6.5 10.5h2v7h-2zm4 0h2v1c.5-.8 1.3-1.2 2.3-1.2 2 0 2.7 1.2 2.7 3.2v4h-2v-3.7c0-1.1-.3-1.7-1.2-1.7-1.1 0-1.8.7-1.8 1.9v3.5h-2z" />
          </svg>
        </a>
        <ThemeToggle />
      </div>
    </nav>
  );
}
