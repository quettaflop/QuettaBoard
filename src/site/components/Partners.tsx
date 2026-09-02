import type { PartnerGroup } from '../siteData';
import ariaLogo from '../assets/partners/aria.png';
import commonaiLogo from '../assets/partners/commonai.png';

/**
 * Partner logos, grouped by relationship.
 *
 * Modelled on scalinginference.org, which separates "Delivered by" / "Funded by"
 * / "Technology partners" instead of lumping everyone under one heading. That
 * distinction matters here: ARIA funds the work, CommonAI supplies compute.
 *
 * Both official assets are dark marks on a light ground, so each sits on a white
 * chip — the same treatment the source site uses (colour logos on white). The
 * alternative, CSS-inverting them onto the dark page, would turn CommonAI's
 * purple a muddy yellow-green.
 */
/* Per-logo height, not one shared value: the ARIA asset carries the agency name
   in small type beside the wordmark, so it needs more height than CommonAI to
   stay legible. Matching heights would make one of them either mush or huge. */
const GROUPS: PartnerGroup[] = [
  {
    label: 'Funded by',
    members: [{ name: 'Advanced Research + Invention Agency', logo: ariaLogo, h: 34 }],
  },
  {
    label: 'Compute partner',
    members: [{ name: 'CommonAI', logo: commonaiLogo, h: 21 }],
  },
];

export function Partners() {
  return (
    <section className="border-b border-white/[0.08]">
      <div className="shell flex flex-col gap-8 py-9 sm:flex-row sm:gap-14 sm:py-11">
        {GROUPS.map((g) => (
          <div key={g.label}>
            <div className="eyebrow">{g.label}</div>
            <ul className="mt-3.5 flex flex-wrap items-center gap-3">
              {g.members.map((m) => (
                <li
                  key={m.name}
                  className="flex h-[58px] items-center rounded-lg bg-white px-4 ring-1 ring-inset ring-white/10"
                >
                  <img
                    src={m.logo}
                    alt={m.name}
                    style={{ height: `${m.h}px` }}
                    className="w-auto"
                    draggable={false}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
