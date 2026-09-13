/**
 * Ownership TCO for the hardware / engine indexes.
 *
 * Meeting (2026-09): rank hardware on dollars per token if you *buy*
 * the GPU and run it for three years — not on a rental GPU-hour.
 * Purchase from secondary-market listings (DumpsterCluster + eBay
 * trackers). Electricity is the unweighted mean of DumpsterCluster
 * Table 4 industrial rates, not a country. Capex is straight-line
 * amortised to a residual over the same three years.
 *
 * These figures are dated assumptions, not a quote.
 */
import type { HardwareFamily } from './score';

export const TCO_HORIZON_YEARS = 3;
export const HOURS_PER_YEAR = 8760;
/** Base case: continuously utilized. Sensitivity is disclosed in the UI. */
export const TCO_UTILIZATION = 1;
/** GPU-board-only estimate: facility and host overhead are excluded. */
export const TCO_PUE = 1;
export const TCO_HOURS = TCO_HORIZON_YEARS * HOURS_PER_YEAR * TCO_UTILIZATION;

/**
 * DumpsterCluster Table 4 industrial USD/kWh (arxiv:2608.14614).
 * China appears twice at the same price (coal vs renewable mix);
 * counted once. Meeting: use an average, not a country.
 */
export const DUMPSTER_INDUSTRIAL_USD_PER_KWH = {
  china: 0.0556,
  unitedStates: 0.12,
  brazil: 0.125,
} as const;

/** Mentioned in the meeting, but no traceable paper/URL was supplied. */
export const TOM_SAWYER_ELECTRICITY_SOURCE: null = null;

export const AVG_USD_PER_KWH =
  (DUMPSTER_INDUSTRIAL_USD_PER_KWH.china +
    DUMPSTER_INDUSTRIAL_USD_PER_KWH.unitedStates +
    DUMPSTER_INDUSTRIAL_USD_PER_KWH.brazil) /
  3;

export interface HardwarePurchase {
  usd: number;
  /** Fraction of purchase still on the books after the horizon. */
  residualFrac: number;
  tdpW: number;
  asOf: string;
  condition: string;
  observationCount: number | null;
  basis: string;
  source: string;
  href: string;
}

/**
 * GPU-only secondary prices. Residual fractions are a 3-year schedule
 * on top of an already-used card: Hopper still has a market; Ampere
 * 40GB and consumer cards follow DumpsterCluster's observation that
 * older SKUs decay fast once the next generation is everywhere.
 */
export const HARDWARE_PURCHASE: Record<HardwareFamily, HardwarePurchase> = {
  H100: {
    usd: 18500,
    residualFrac: 0.25,
    tdpW: 700,
    asOf: '2026-08',
    condition: 'secondary-market, GPU only',
    observationCount: null,
    basis: 'published secondary-market estimate; sample count not reported',
    source: 'DumpsterCluster Fig. 2, secondary market GPU-only (H100 80GB)',
    href: 'https://arxiv.org/html/2608.14614',
  },
  A100: {
    usd: 1900,
    residualFrac: 0.1,
    tdpW: 400,
    asOf: '2026-03',
    condition: 'used, GPU only',
    observationCount: null,
    basis: 'eBay-fitted curve; sample count not reported',
    source: 'DumpsterCluster Fig. 1 eBay-fitted A100 40GB, Mar 2026',
    href: 'https://arxiv.org/html/2608.14614',
  },
  '3090': {
    usd: 1275,
    residualFrac: 0.15,
    tdpW: 350,
    asOf: '2026-08',
    condition: 'used',
    observationCount: null,
    basis: 'published eBay used median; sample count not reported',
    source: 'eBay used median ~$1,275 (InsiderLLM, Aug 2026)',
    href: 'https://insiderllm.com/guides/used-rtx-3090-buying-guide/',
  },
  '2080 Ti': {
    usd: 255,
    residualFrac: 0.05,
    tdpW: 250,
    asOf: '2026-06',
    condition: 'used',
    observationCount: null,
    basis: 'published eBay used tracker; sample count not reported',
    source: 'eBay used ~$255 (BestValueGPU, Jun 2026)',
    href: 'https://bestvaluegpu.com/history/new-and-used-rtx-2080-ti-price-history-and-specs/',
  },
};

/** Dated market reference; never used to score the hardware index. */
export const OPENROUTER_LLAMA31_8B = {
  model: 'Llama-3.1-8B',
  slug: 'meta-llama/llama-3.1-8b-instruct',
  usdPerMTokIn: 0.02,
  usdPerMTokOut: 0.04,
  asOf: '2026-09-13',
  scope: 'listed API input/output price; output comparison uses output-only price',
  source: 'OpenRouter listed price, Meta Llama 3.1 8B Instruct',
  href: 'https://openrouter.ai/meta-llama/llama-3.1-8b-instruct',
} as const;

export interface GpuTco {
  family: HardwareFamily;
  purchaseUsd: number;
  residualUsd: number;
  amortUsd: number;
  /** Straight-line book drop per year. */
  amortUsdPerYear: number;
  electricUsdPerYear: number;
  tcoUsd: number;
  usdPerHour: number;
  tdpW: number;
  usdPerKwh: number;
  utilization: number;
  pue: number;
}

export function gpuTco(family: HardwareFamily): GpuTco {
  const spec = HARDWARE_PURCHASE[family];
  const residualUsd = spec.usd * spec.residualFrac;
  const amortUsd = spec.usd - residualUsd;
  const electricUsdPerYear =
    (spec.tdpW / 1000) *
    AVG_USD_PER_KWH *
    HOURS_PER_YEAR *
    TCO_UTILIZATION *
    TCO_PUE;
  const tcoUsd = amortUsd + electricUsdPerYear * TCO_HORIZON_YEARS;
  return {
    family,
    purchaseUsd: spec.usd,
    residualUsd,
    amortUsd,
    amortUsdPerYear: amortUsd / TCO_HORIZON_YEARS,
    electricUsdPerYear,
    tcoUsd,
    usdPerHour: tcoUsd / TCO_HOURS,
    tdpW: spec.tdpW,
    usdPerKwh: AVG_USD_PER_KWH,
    utilization: TCO_UTILIZATION,
    pue: TCO_PUE,
  };
}

export function amortSchedule(family: HardwareFamily): Array<{
  year: number;
  bookStart: number;
  charge: number;
  bookEnd: number;
}> {
  const t = gpuTco(family);
  const charge = t.amortUsdPerYear;
  const out = [];
  let book = t.purchaseUsd;
  for (let year = 1; year <= TCO_HORIZON_YEARS; year += 1) {
    const bookEnd = book - charge;
    out.push({ year, bookStart: book, charge, bookEnd });
    book = bookEnd;
  }
  return out;
}

export function tcoUsdPerMTok(
  tokPerSec: number,
  family: HardwareFamily,
  gpus: number,
): number | null {
  if (!(tokPerSec > 0) || !(gpus > 0)) return null;
  const usd = gpuTco(family).usdPerHour * gpus;
  return (usd / (tokPerSec * 3600)) * 1e6;
}

export function tcoTokensPerDollar(
  tokPerSec: number,
  family: HardwareFamily,
  gpus: number,
): number | null {
  const usd = tcoUsdPerMTok(tokPerSec, family, gpus);
  if (usd == null || !(usd > 0)) return null;
  return 1e6 / usd;
}

export function impliedGrossMargin(cost: number, marketPrice: number): number | null {
  if (!(cost >= 0) || !(marketPrice > 0)) return null;
  return (marketPrice - cost) / marketPrice;
}
