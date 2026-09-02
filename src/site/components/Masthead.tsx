import brandMark from '../assets/brand-mark.png';
import { ContactCard } from './ContactCard';
import { Partners } from './Partners';
import { ThemeToggle } from './ThemeToggle';
import { ToolStack } from './ToolStack';

/**
 * Page head: pitch column (letter + contact row) beside the product stack.
 */
export function Masthead() {
  return (
    <header>
      <div className="site-nav">
        <div className="shell flex items-center justify-between gap-4 py-3.5">
          <span className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-[4px] bg-[var(--mark)] ring-1 ring-inset ring-[var(--line)]">
              <img src={brandMark} alt="" className="h-4 w-4" draggable={false} />
            </span>
            <span className="text-[14px] tracking-tight text-[var(--ink)]">
              Quettaflop AI
            </span>
          </span>
          <span className="flex items-center gap-5">
            <ThemeToggle />
            <a href="#contact" className="mono text-[12px] text-[var(--ink-2)] transition-colors hover:text-[var(--accent)]">
              Contact
            </a>
          </span>
        </div>
      </div>

      <div className="shell pb-16 pt-14 sm:pb-20 sm:pt-16">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_16.75rem] lg:gap-x-10">
          <div className="min-w-0 max-w-[38rem]">
            <h1 className="text-[clamp(1.85rem,3.6vw,2.65rem)] leading-[1.2]">
              Serving frontier open models on hardware you can actually get.
            </h1>
            <div className="mt-7 space-y-4 text-[1.05rem] leading-relaxed">
              <p>
                Open models finally match closed ones in quality. The problem is running them —
                inference software is optimised for datacentre GPUs, leaving massive performance
                on the table for everything else.
              </p>
              <p>
                We're building the serving stack for hardware you can actually buy. RTX cards,
                not just B300s. Benchmarks on real agentic workloads, a simulator that predicts
                latency before you buy anything, and a Rust inference engine built around what
                those measurements show.
              </p>
            </div>
            <ContactCard />
          </div>
          <ToolStack />
        </div>
        <Partners />
      </div>
    </header>
  );
}
