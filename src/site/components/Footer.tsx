import { FOOTER_LINKS } from '../siteData';

export function Footer() {
  return (
    <footer className="border-t border-white/[0.08] py-10">
      <div className="shell flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
          {FOOTER_LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="text-[12.5px] text-[#8b919b] transition-colors hover:text-[#e6e8ec]"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <p className="mono text-[11px] text-[#4f545d] sm:text-right">
          © {new Date().getFullYear()} Quettaflop AI
        </p>
      </div>
    </footer>
  );
}
