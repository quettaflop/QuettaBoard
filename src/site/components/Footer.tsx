import { readSitePage, siteContactHref, sitePageHref } from '../sitePaths';
import { ContactCard } from './ContactCard';
import { CONTACT_EMAIL } from '../siteData';

export function Footer() {
  const page = readSitePage();
  return (
    <footer className="site-footer">
      {page === 'home' && (
        <section className="contact-section shell" aria-labelledby="contact-title">
          <p className="eyebrow">Build with us</p>
          <div className="contact-heading">
            <h2 id="contact-title" tabIndex={-1}>Let’s talk inference.</h2>
            <a href={`mailto:${CONTACT_EMAIL}`} className="button-primary">Say hello <span aria-hidden="true">↗</span></a>
          </div>
          <ContactCard />
        </section>
      )}
      <div className="shell flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
          <a href={sitePageHref('blog')} className="text-[12.5px] text-[var(--ink-2)] hover:text-[var(--ink)]">Blog</a>
          <a href={sitePageHref('careers')} className="text-[12.5px] text-[var(--ink-2)] hover:text-[var(--ink)]">Careers</a>
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
