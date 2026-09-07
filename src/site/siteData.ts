/* ============================================================================
   Static site content.

   Everything the landing page renders lives here as a literal. The dashboard
   fetches its JSON from R2 at runtime; this site deliberately does not — a
   public page must render identically forever, survive the bucket being
   re-keyed, and never show a spinner. Figures below are a snapshot of the
   published corpus, not a live view of it.

   Snapshot: benchmark corpus of 2026-05-04 (5,756 runs) and the serving
   prediction set of the same date.

   Copy rule: plain and factual. No headline claims, no marketing voice. If a
   sentence would not survive being read out in a design review, cut it.
   ============================================================================ */

export const SNAPSHOT_DATE = 'May 2026';

/*
 * The dashboard link was removed from the site (team review 2026-08-27:
 * "remove the old dashboard link"). The build still publishes the dashboard
 * under /board/ — it is simply no longer advertised here.
 */

export const CONTACT_EMAIL = 'pi@quettaflop.ai';

/* --------------------------------------------------------------------- cards */

export interface CardFact {
  k: string;
  v: string;
}

export interface Card {
  id: string;
  /** Stage label. The four cards are the four stages of one measurement loop. */
  kicker: string;
  name: string;
  /** One or two lines. Shown on the closed card. */
  summary: string;
  accent: string;
  figure: 'trace' | 'sim' | 'board' | 'serve';
  detail: {
    lead: string;
    facts: CardFact[];
    points: string[];
    /** Two-column comparison table (QuettaSim's cost backends). */
    backends?: {
      cols: [string, string];
      rows: { k: string; v: [string, string] }[];
    };
    /** Heavier data block rendered under the points, if any. */
    extra?: 'coverage' | 'validation';
  };
  learnMore: {
    label: string;
    href: string;
    /** Shown next to the link when the destination is not public. */
    note?: string;
  };
}

export const CARDS: Card[] = [
  {
    id: 'measure',
    kicker: 'Measure',
    name: 'QuettaBench',
    summary:
      'Serving benchmarks on agentic workloads, with latency recorded per turn. vLLM and SGLang.',
    accent: '#c9a36a',
    figure: 'trace',
    detail: {
      lead:
        'Published serving numbers are usually collected on fixed-length, single-shot requests. Agentic traffic looks nothing like that, so QuettaBench replays measured agentic workloads and reports latency per turn at fixed concurrency.',
      facts: [
        { k: 'Engines', v: 'vLLM · SGLang' },
        { k: 'Modes', v: 'stress · single-turn · multi-turn' },
        { k: 'Concurrency', v: '1 → 500' },
        { k: 'Corpus', v: `5,756 runs · 21 profiles · ${SNAPSHOT_DATE}` },
      ],
      points: [
        'Three modes: raw kernel throughput, single-shot latency, and multi-turn replay.',
        'Trace replay from ShareGPT, SWE-bench, TerminalBench and OSWorld.',
        'p50 / p90 / p99 on TTFT, TPOT and end-to-end latency, per turn.',
        '3.46M requests and 18.6B input tokens across 336 GPU-hours.',
      ],
      extra: 'coverage',
    },
    // Repository is public, but not being linked publicly yet — point at contact
    // until there is a destination we want traffic going to.
    learnMore: { label: 'Contact us', href: '#contact' },
  },
  {
    id: 'predict',
    kicker: 'Predict',
    name: 'QuettaSim',
    summary:
      'Predicts TTFT, TPOT and end-to-end latency from a device spec and a workload. No GPU required.',
    accent: '#c9a36a',
    figure: 'sim',
    detail: {
      lead:
        'One queueing engine, two interchangeable cost backends — trading analytical reach against measured fidelity. Predictions are scored against the measured corpus rather than reported on their own.',
      facts: [{ k: 'New GPU', v: 'YAML device spec' }],
      backends: {
        cols: ['roofline', 'kernel-composed'],
        rows: [
          { k: 'Basis', v: ['analytical peak bounds', 'measured kernel tables'] },
          { k: 'Parallelism', v: ['TP · PP · EP', 'TP · EP'] },
        ],
      },
      points: [
        'Cache-aware, per-turn prediction for multi-turn agentic workloads.',
        'Frozen-fixture cross-validation against the measured corpus.',
      ],
      extra: 'validation',
    },
    learnMore: { label: 'Contact us', href: '#contact' },
  },
  {
    id: 'run',
    kicker: 'Run',
    name: 'QuettaServe',
    summary:
      'Rust inference engine optimised for pipeline-parallel serving of SOTA models.',
    accent: '#c9a36a',
    figure: 'serve',
    detail: {
      lead:
        'An inference engine written in Rust, with the control plane to run it as a fleet.',
      facts: [
        { k: 'Language', v: 'Rust' },
        { k: 'Parallelism', v: 'pipeline · tensor · expert' },
        { k: 'API', v: 'OpenAI-compatible' },
      ],
      points: [
        'Pipeline-parallel serving of state-of-the-art models.',
        'Kubernetes operator for fleet placement and draining.',
        'OpenAI-compatible API proxy.',
      ],
    },
    learnMore: { label: 'Contact us', href: '#contact' },
  },
];

/* ------------------------------------------------------- coverage data block */

export const HARDWARE = [
  { name: 'H100', widths: [1, 2, 4], tier: 'datacenter' },
  { name: 'A100 40GB', widths: [1, 2, 4, 8], tier: 'datacenter' },
  { name: 'RTX 3090', widths: [1, 2, 4, 8], tier: 'workstation' },
  { name: 'RTX 2080Ti', widths: [1, 2, 4], tier: 'workstation' },
] as const;

export const MODELS = [
  { name: 'Llama-3.1-8B', params: '8B', kind: 'dense' },
  { name: 'Qwen3.5-9B', params: '9B', kind: 'dense' },
  { name: 'gpt-oss-20b', params: '20B', kind: 'MoE' },
  { name: 'Qwen3.5-27B', params: '27B', kind: 'dense' },
  { name: 'Mixtral-8x7B', params: '8×7B', kind: 'MoE' },
  { name: 'Llama-3.1-70B', params: '70B', kind: 'dense' },
  { name: 'Llama-3.3-70B', params: '70B', kind: 'dense' },
  { name: 'Qwen2.5-72B', params: '72B', kind: 'dense' },
  { name: 'gpt-oss-120b', params: '120B', kind: 'MoE' },
] as const;

/* ----------------------------------------------------- validation data block
   Median APE on the best-covered configuration (4×H100, active grid, May 2026
   snapshot: TPOT 8.2%, E2EL 14.3%, n=243). The corpus is re-scored as new runs
   land, so the page names the hardware but deliberately not a run count.
   -------------------------------------------------------------------------- */

export const VALIDATION = {
  hardware: '4×H100',
  metrics: [
    { name: 'TPOT', mdape: 8.2, blurb: 'inter-token latency' },
    { name: 'E2EL', mdape: 14.3, blurb: 'end-to-end' },
  ],
  note: 'Scored continuously against new benchmark runs.',
} as const;

/* --------------------------------------------------------------- turn trace
   One measured agentic trace: Llama-3.3-70B on 4×H100, vLLM, swebench-multiturn
   at concurrency 20 — an 88-turn SWE-bench trajectory, six turns sampled.
   Context grows 25× over the conversation while measured TTFT grows 1.3×.
   -------------------------------------------------------------------------- */

export const TURN_TRACE = [
  { turn: 0, context: 1310, cacheHit: 0.0, ttft: 173.4 },
  { turn: 4, context: 2354, cacheHit: 0.95, ttft: 228.8 },
  { turn: 12, context: 6992, cacheHit: 0.97, ttft: 344.2 },
  { turn: 28, context: 12505, cacheHit: 0.99, ttft: 428.1 },
  { turn: 52, context: 22851, cacheHit: 0.99, ttft: 434.6 },
  { turn: 87, context: 32101, cacheHit: 0.97, ttft: 227.0 },
] as const;

/* ------------------------------------------------------------------- footer */

export const FOOTER_LINKS = [
  { label: 'Index', href: '/efficiency/' },
  { label: 'Contact', href: '#contact' },
];

/* ------------------------------------------------------------------ partners
   Grouped by relationship, the way scalinginference.org does it ("Delivered by"
   / "Trusted by" / "Technology partners") rather than one vague "Backed by" row —
   ARIA funds the work, CommonAI provides compute, and those are different claims.

   Logo files are the official assets as published on scalinginference.org. Both
   are dark marks on an opaque white ground, so they sit on white chips rather
   than being colour-inverted, which would wreck CommonAI's purple.
   -------------------------------------------------------------------------- */

export interface PartnerGroup {
  label: string;
  members: { name: string; logo: string; h: number }[];
}
