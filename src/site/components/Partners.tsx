import type { PartnerGroup } from '../siteData';
import ariaLogo from '../assets/partners/aria.png';
import commonaiLogo from '../assets/partners/commonai.png';

const GROUPS: PartnerGroup[] = [
  {
    label: 'Trusted by',
    members: [
      { name: 'Advanced Research + Invention Agency', logo: ariaLogo, h: 28, href: 'https://aria.org.uk/' },
    ],
  },
  {
    label: 'Compute partner',
    members: [{ name: 'CommonAI', logo: commonaiLogo, h: 18, href: 'https://commonai.org/' }],
  },
];

/** Keep the two relationships distinct and use the official logo colours. */
export function Partners() {
  return (
    <section className="partners" aria-label="Partners">
      <div className="flex flex-col gap-6 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-10 sm:gap-y-5">
        {GROUPS.map((g) => (
          <div key={g.label} className="flex flex-wrap items-center gap-3">
            <div className="eyebrow shrink-0">{g.label}</div>
            <ul className="flex flex-wrap items-center gap-3">
              {g.members.map((m) => (
                <li key={m.name}>
                  <a
                    href={m.href}
                    className="flex h-10 items-center rounded-[4px] bg-white px-3 ring-1 ring-inset ring-[var(--line)] transition-shadow hover:ring-[var(--ink)]"
                  >
                    <img
                      src={m.logo}
                      alt={m.name}
                      style={{ height: `${m.h}px` }}
                      className="w-auto"
                      draggable={false}
                    />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
