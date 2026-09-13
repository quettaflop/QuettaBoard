/**
 * Experimental model-efficiency inputs.
 *
 * Intelligence is Artificial Analysis Intelligence Index v4.3, retrieved
 * 2026-09-13. It is not a QuettaBench measurement. Decode FLOPs/token are
 * approximated as 2 × active parameters; MoE uses active, not total, params.
 */
export const AA_INDEX_VERSION = '4.3';
export const AA_RETRIEVED = '2026-09-13';
export const FLOPS_PER_PARAM = 2;

export interface ModelCatalogEntry {
  model: string;
  intelligence: number;
  estimated: boolean;
  totalParamsB: number;
  activeParamsB: number;
  href: string;
}

export const MODEL_CATALOG: readonly ModelCatalogEntry[] = [
  {
    model: 'Llama-3.1-8B',
    intelligence: 7,
    estimated: true,
    totalParamsB: 8,
    activeParamsB: 8,
    href: 'https://artificialanalysis.ai/models/llama-3-1-instruct-8b',
  },
  {
    model: 'Llama-3.1-70B',
    intelligence: 7,
    estimated: true,
    totalParamsB: 70,
    activeParamsB: 70,
    href: 'https://artificialanalysis.ai/models/llama-3-1-instruct-70b',
  },
  {
    model: 'Llama-3.3-70B',
    intelligence: 8,
    estimated: true,
    totalParamsB: 70,
    activeParamsB: 70,
    href: 'https://artificialanalysis.ai/models/llama-3-3-instruct-70b',
  },
  {
    model: 'gpt-oss-20b',
    intelligence: 9,
    estimated: false,
    totalParamsB: 21,
    activeParamsB: 3.6,
    href: 'https://artificialanalysis.ai/models/gpt-oss-20b',
  },
  {
    model: 'gpt-oss-120b',
    intelligence: 12,
    estimated: false,
    totalParamsB: 117,
    activeParamsB: 5.1,
    href: 'https://artificialanalysis.ai/models/gpt-oss-120b',
  },
  {
    model: 'Qwen3-30B-A3B',
    intelligence: 9,
    estimated: true,
    totalParamsB: 30.5,
    activeParamsB: 3.3,
    href: 'https://artificialanalysis.ai/models/qwen3-30b-a3b-instruct-reasoning',
  },
  {
    model: 'Qwen3.5-9B',
    intelligence: 14,
    estimated: true,
    totalParamsB: 9.65,
    activeParamsB: 9.65,
    href: 'https://artificialanalysis.ai/models/qwen3-5-9b',
  },
  {
    model: 'Qwen3.5-27B',
    intelligence: 23,
    estimated: true,
    totalParamsB: 27.8,
    activeParamsB: 27.8,
    href: 'https://artificialanalysis.ai/models/qwen3-5-27b',
  },
  {
    model: 'Qwen2.5-72B',
    intelligence: 8,
    estimated: true,
    totalParamsB: 72,
    activeParamsB: 72,
    href: 'https://artificialanalysis.ai/models/qwen2-5-72b-instruct',
  },
  {
    model: 'Mixtral-8x7B',
    intelligence: 5,
    estimated: true,
    totalParamsB: 46.7,
    activeParamsB: 12.9,
    href: 'https://artificialanalysis.ai/models/mixtral-8x7b-instruct',
  },
];

export const MODEL_CATALOG_BY_NAME = new Map(MODEL_CATALOG.map((m) => [m.model, m]));

export function gflopPerToken(activeParamsB: number): number {
  return FLOPS_PER_PARAM * activeParamsB;
}

export function intelPerGflop(intelligence: number, activeParamsB: number): number {
  const flop = gflopPerToken(activeParamsB);
  return intelligence > 0 && flop > 0 ? intelligence / flop : NaN;
}
