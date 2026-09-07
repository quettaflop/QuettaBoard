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
        <span className="flex items-center gap-1.5">
          <a
            href={sitePageHref('home')}
            aria-current={page === 'home' ? 'page' : undefined}
            className="nav-link"
          >
            Home
          </a>
          <a
            href={sitePageHref('efficiency')}
            aria-current={page === 'efficiency' ? 'page' : undefined}
            className="nav-link"
          >
            Index
          </a>
          <span className="ml-1 flex items-center gap-3">
            <ThemeToggle />
            <a href={siteContactHref(page)} className="nav-link">
              Contact
            </a>
          </span>
        </span>
      </div>
    </div>
  );
}
