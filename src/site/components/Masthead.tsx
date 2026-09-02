import brandMark from '../assets/brand-mark.png';
import brandMarkLarge from '../assets/brand-mark-large.png';

/**
 * Page head: the company name, then the value proposition in a handful of
 * plain sentences.
 *
 * Team review (2026-08-27) called the previous version "confusing to a general
 * purpose human being" — it named the four tools without ever saying what the
 * company is for. So this leads with the problem (frontier open models are
 * expensive to serve) and what we do about it, and names the hardware we care
 * about, since RTX-class cards are the actual focus rather than B300s.
 *
 * The dashboard link that used to sit top-right was removed in the same review.
 */
export function Masthead() {
  return (
    <header className="border-b border-white/[0.08]">
      <div className="site-nav">
        <div className="shell flex items-center gap-3 py-3.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#0d0f13] ring-1 ring-inset ring-white/10">
            <img src={brandMark} alt="" className="h-4 w-4" draggable={false} />
          </span>
          {/* Wordmark in the display face, as scalinginference.org does for its own
              .logo-wordmark. Bricolage Grotesque's capital Q has a long
              horizontal tail that runs under the following letters — characterful
              in running text, but in a wordmark it reads as a stray underline. */}
          <span
            className="text-[14px] font-semibold tracking-tight text-[#f3f4f6]"
            style={{ fontFamily: 'var(--display)' }}
          >
            Quettaflop AI
          </span>
        </div>
      </div>

      <div className="shell pb-9 pt-7 sm:pb-11 sm:pt-10">
        <h1 className="text-[clamp(2rem,4.4vw,3rem)] font-semibold leading-[1.1] tracking-[-0.025em] text-[#f6f7f9]">
          Serving frontier open models
          <br className="hidden sm:block" /> on hardware you can actually get.
        </h1>

        {/* Copy left, brand mark right. The mark is decorative — the company name
            is already text in the bar above — so it carries an empty alt and is
            hidden from assistive tech rather than announced twice. */}
        <div className="mt-6 grid gap-x-14 gap-y-9 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="max-w-2xl space-y-3.5 text-[clamp(1rem,1.6vw,1.1rem)] leading-relaxed text-[#a9afba]">
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

          <div className="relative shrink-0 justify-self-start lg:justify-self-end">
            {/* Soft accent bloom behind the mark, so it belongs to the same lit
                surface as the glass panels rather than floating on the ground. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background:
                  'radial-gradient(circle, rgba(45,212,191,0.13), rgba(167,139,250,0.06) 45%, transparent 68%)',
              }}
            />
            <img
              src={brandMarkLarge}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="relative h-[104px] w-auto opacity-90 sm:h-[132px] lg:h-[168px]"
            />
          </div>
        </div>
      </div>
    </header>
  );
}
