/**
 * Experimental model-efficiency inputs.
 *
 * Intelligence is the Artificial Analysis Intelligence Index v4.3 as shown
 * on each linked model page, read on AA_RETRIEVED. It is not a QuettaBench
 * measurement. `variant` names the AA page variant the score belongs to
 * (AA scores reasoning and non-reasoning variants separately). Decode
 * FLOPs/token are approximated as 2 × active parameters; MoE uses active,
 * not total, params. A model without a verified AA score is not listed.
 */
export const AA_INDEX_VERSION = '4.3';
export const AA_RETRIEVED = '2026-09-13';
export const FLOPS_PER_PARAM = 2;

export interface ModelCatalogEntry {
  model: string;
  intelligence: number;
  /** The AA page variant the score was read from. */
  variant: string;
  totalParamsB: number;
  activeParamsB: number;
  href: string;
}

export const MODEL_CATALOG: readonly ModelCatalogEntry[] = [
  {
    model: 'Llama-3.1-8B',
    intelligence: 7,
    variant: 'Llama 3.1 Instruct 8B',
    totalParamsB: 8,
    activeParamsB: 8,
    href: 'https://artificialanalysis.ai/models/llama-3-1-instruct-8b',
  },
  {
    model: 'Llama-3.1-70B',
    intelligence: 7,
    variant: 'Llama 3.1 Instruct 70B',
    totalParamsB: 70,
    activeParamsB: 70,
    href: 'https://artificialanalysis.ai/models/llama-3-1-instruct-70b',
  },
  {
    model: 'Llama-3.3-70B',
    intelligence: 8,
    variant: 'Llama 3.3 Instruct 70B',
    totalParamsB: 70,
    activeParamsB: 70,
    href: 'https://artificialanalysis.ai/models/llama-3-3-instruct-70b',
  },
  {
    model: 'gpt-oss-20b',
    intelligence: 9,
    variant: 'gpt-oss-20b (high)',
    totalParamsB: 21,
    activeParamsB: 3.6,
    href: 'https://artificialanalysis.ai/models/gpt-oss-20b',
  },
  {
    model: 'gpt-oss-120b',
    intelligence: 12,
    variant: 'gpt-oss-120b (high)',
    totalParamsB: 117,
    activeParamsB: 5.1,
    href: 'https://artificialanalysis.ai/models/gpt-oss-120b',
  },
  {
    model: 'Qwen3-30B-A3B',
    intelligence: 8,
    variant: 'Qwen3 30B A3B (Reasoning)',
    totalParamsB: 30.5,
    activeParamsB: 3.3,
    href: 'https://artificialanalysis.ai/models/qwen3-30b-a3b-instruct-reasoning',
  },
  {
    model: 'Qwen3.5-9B',
    intelligence: 14,
    variant: 'Qwen3.5 9B (Reasoning)',
    totalParamsB: 9.65,
    activeParamsB: 9.65,
    href: 'https://artificialanalysis.ai/models/qwen3-5-9b',
  },
  {
    model: 'Qwen3.5-27B',
    intelligence: 23,
    variant: 'Qwen3.5 27B (Reasoning)',
    totalParamsB: 27.8,
    activeParamsB: 27.8,
    href: 'https://artificialanalysis.ai/models/qwen3-5-27b',
  },
  {
    model: 'Qwen2.5-72B',
    intelligence: 8,
    variant: 'Qwen2.5 Instruct 72B',
    totalParamsB: 72,
    activeParamsB: 72,
    href: 'https://artificialanalysis.ai/models/qwen2-5-72b-instruct',
  },
  {
    model: 'Mixtral-8x7B',
    intelligence: 5,
    variant: 'Mixtral 8x7B Instruct',
    totalParamsB: 46.7,
    activeParamsB: 12.9,
    href: 'https://artificialanalysis.ai/models/mixtral-8x7b-instruct',
  },
];

/** The experimental panel is hidden below this many scored models. */
export const MIN_MODEL_PANEL_ROWS = 5;

export const MODEL_CATALOG_BY_NAME = new Map(MODEL_CATALOG.map((m) => [m.model, m]));

export function gflopPerToken(activeParamsB: number): number {
  return FLOPS_PER_PARAM * activeParamsB;
}

export function intelPerGflop(intelligence: number, activeParamsB: number): number {
  const flop = gflopPerToken(activeParamsB);
  return intelligence > 0 && flop > 0 ? intelligence / flop : NaN;
}
