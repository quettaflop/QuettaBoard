import { Partners } from './Partners';
import { SiteNav } from './SiteNav';
import { ToolStack } from './ToolStack';
import { HardwareIllustration } from './HardwareIllustration';
import { ArrowRight } from './icons';
import { CONTACT_EMAIL } from '../siteData';
import { sitePageHref } from '../sitePaths';

export function Masthead() {
  return (
    <header>
      <SiteNav page="home" />
      <div className="shell">
        <div className="hero">
          <div className="hero-art">
            <HardwareIllustration />
            <span className="hero-art-caption mono">Inference, down to the metal.</span>
          </div>
          <div className="hero-copy">
            <p className="eyebrow">Open models. Real hardware.</p>
            <h1>Frontier models.<br />Everyday<br className="hero-break" /> hardware<span className="hero-period">.</span></h1>
            <p className="hero-description">
              We’re building the serving stack for hardware you can actually buy.
              Benchmarks on real agentic workloads. A simulator to predict latency.
              A Rust inference engine built around what the measurements show.
            </p>
            <div className="hero-actions">
              <a href="#work" className="button-primary">Explore the stack <ArrowRight size={20} /></a>
              <a href={sitePageHref('efficiency')} className="text-link">Efficiency Index <span aria-hidden="true">↗</span></a>
            </div>
          </div>
        </div>
        <div className="hero-bottom">
          <a href={`mailto:${CONTACT_EMAIL}`} className="contact-orbit" aria-label="Get in touch with Quettaflop">
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <defs><path id="contact-circle" d="M60,60 m-45,0 a45,45 0 1,1 90,0 a45,45 0 1,1 -90,0" /></defs>
              <text><textPath href="#contact-circle" textLength="282">LET’S TALK INFERENCE · GET IN TOUCH · </textPath></text>
            </svg>
            <span><ArrowRight size={25} /></span>
          </a>
          <Partners />
        </div>
        <ToolStack />
      </div>
    </header>
  );
}
