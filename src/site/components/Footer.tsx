import { readSitePage, siteContactHref, sitePageHref } from '../sitePaths';

export function Footer() {
  const page = readSitePage();
  return (
    <footer className="border-t border-[var(--line)] py-10">
      <div className="shell flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
          <a
            href={sitePageHref('efficiency')}
            className="text-[12.5px] text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]"
          >
            Index
          </a>
          <a
            href={siteContactHref(page)}
            className="text-[12.5px] text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]"
          >
            Contact
          </a>
        </nav>

        <p className="mono text-[11px] text-[var(--ink-3)] sm:text-right">
          © {new Date().getFullYear()} Quettaflop AI
        </p>
      </div>
    </footer>
  );
}
