import { CAREER_AREAS, CONTACT_EMAIL } from '../siteData';
import { siteSectionHref } from '../sitePaths';
import { SiteNav } from './SiteNav';
import { ArrowRight } from './icons';

export function Careers() {
  const emailHref = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Careers at Quettaflop')}`;

  return (
    <>
      <SiteNav page="careers" />
      <main id="main" className="careers-page shell">
        <header className="careers-header">
          <div>
            <p className="eyebrow">Careers at Quettaflop</p>
            <h1>Make inference<br />work better<span className="hero-period">.</span></h1>
            <p className="careers-intro">We build tools to measure, model, and run AI inference. If you enjoy turning experiments into useful systems, we’d like to hear from you.</p>
            <a href={siteSectionHref('work', 'careers')} className="text-link">Explore our work <ArrowRight size={18} /></a>
          </div>
          <aside className="careers-invite" aria-labelledby="careers-invite-title">
            <p className="eyebrow">Start a conversation</p>
            <h2 id="careers-invite-title">Show us what<br />you’ve built.</h2>
            <p>Tell us what you’d like to work on. Share a CV or links to code, papers, or experiments. A short note is enough to start.</p>
            <a href={emailHref} className="button-primary">Introduce yourself <ArrowRight size={18} /></a>
            <a href={emailHref} className="careers-email">{CONTACT_EMAIL}</a>
          </aside>
        </header>

        <section className="careers-work" aria-labelledby="careers-work-title">
          <div className="section-heading">
            <p className="eyebrow">The work</p>
            <h2 id="careers-work-title">Across the inference stack.</h2>
            <p>These are the areas we work on. Get in touch to discuss where you could contribute.</p>
          </div>
          <div className="career-areas">
            {CAREER_AREAS.map((area, index) => (
              <section key={area.title} className="career-area" aria-labelledby={`career-area-${index}`}>
                <span className="eyebrow career-number" aria-hidden="true">0{index + 1}</span>
                <h3 id={`career-area-${index}`}>{area.title}</h3>
                <p>{area.description}</p>
                <p className="career-tools">{area.tools}</p>
              </section>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
