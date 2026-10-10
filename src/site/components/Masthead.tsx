import { useEffect, useState, type MouseEvent } from 'react';
import { Partners } from './Partners';
import { SiteNav } from './SiteNav';
import { ToolStack } from './ToolStack';
import { HardwareIllustration } from './HardwareIllustration';
import { ArrowRight, Check } from './icons';
import { sitePageHref } from '../sitePaths';

export function Masthead() {
  const [contactClick, setContactClick] = useState(0);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!contactClick) return;
    const heading = document.getElementById('contact-title');
    let observer: IntersectionObserver | undefined;
    let arrivalTimer: number | undefined;
    let flashTimer: number | undefined;

    const highlight = () => {
      observer?.disconnect();
      heading?.focus({ preventScroll: true });
      heading?.classList.add('contact-title-flash');
      flashTimer = window.setTimeout(() => heading?.classList.remove('contact-title-flash'), 1250);
    };

    const scrollTimer = window.setTimeout(() => {
      setConfirmed(false);
      if (!heading) return;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        heading.scrollIntoView({ behavior: 'instant', block: 'center' });
        highlight();
      } else {
        // Start the heading's shimmer when it arrives, not while it is offscreen.
        observer = new IntersectionObserver(([entry]) => {
          if (entry.isIntersecting && entry.intersectionRatio === 1) highlight();
        }, { threshold: 1 });
        observer.observe(heading);
        heading.scrollIntoView({ behavior: 'smooth', block: 'center' });
        arrivalTimer = window.setTimeout(() => observer?.disconnect(), 3000);
      }
    }, 1000);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(arrivalTimer);
      window.clearTimeout(flashTimer);
      observer?.disconnect();
      heading?.classList.remove('contact-title-flash');
    };
  }, [contactClick]);

  const goToContact = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setConfirmed(true);
    setContactClick((n) => n + 1);
  };

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
          <a href="#contact-title" onClick={goToContact} className={`contact-orbit${confirmed ? ' is-confirmed' : ''}`} aria-label="Get in touch with Quettaflop">
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <defs><path id="contact-circle" d="M60,60 m-45,0 a45,45 0 1,1 90,0 a45,45 0 1,1 -90,0" /></defs>
              <text><textPath href="#contact-circle" textLength="282">LET’S TALK INFERENCE · GET IN TOUCH · </textPath></text>
            </svg>
            <span>{confirmed ? <Check size={20} /> : <ArrowRight size={20} />}</span>
          </a>
          <Partners />
        </div>
        <ToolStack />
      </div>
    </header>
  );
}
