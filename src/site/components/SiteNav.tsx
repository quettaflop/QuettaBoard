import brandMark from '../assets/brand-mark.png';
import { siteContactHref, sitePageHref, type SitePage } from '../sitePaths';
import { ThemeToggle } from './ThemeToggle';

export function SiteNav({ page }: { page: SitePage }) {
  return (
    <div className="site-nav">
      <div className="shell flex items-center justify-between gap-4 py-3.5">
        <a href={sitePageHref('home')} className="flex items-center gap-3 text-inherit no-underline">
          <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-[4px] bg-[var(--mark)] ring-1 ring-inset ring-[var(--line)]">
            <img src={brandMark} alt="" className="h-4 w-4" draggable={false} />
          </span>
          <span className="text-[14px] tracking-tight text-[var(--ink)]">Quettaflop AI</span>
        </a>
        <span className="flex items-center gap-5">
          {page === 'efficiency' && (
            <a
              href={sitePageHref('home')}
              className="mono text-[12px] text-[var(--ink-2)] transition-colors hover:text-[var(--accent)]"
            >
              Home
            </a>
          )}
          <a
            href={sitePageHref('efficiency')}
            aria-current={page === 'efficiency' ? 'page' : undefined}
            className={`mono text-[12px] transition-colors hover:text-[var(--accent)] ${
              page === 'efficiency' ? 'text-[var(--accent)]' : 'text-[var(--ink-2)]'
            }`}
          >
            Index
          </a>
          <ThemeToggle />
          <a
            href={siteContactHref(page)}
            className="mono text-[12px] text-[var(--ink-2)] transition-colors hover:text-[var(--accent)]"
          >
            Contact
          </a>
        </span>
      </div>
    </div>
  );
}
