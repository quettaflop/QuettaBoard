// LLMServingSim 2.0 predictions (external simulator, fed QuettaSim-synthesized kernel profiles),
// joined per (gpu_key, model, profile, concurrency) — the SAME key as the roofline series — so the
// Simulator v2 board and Predictions matrix can show it alongside kernel-composed + roofline.
import { rooflineKey } from './rooflinePredictions';

export interface LssTurn {
  turn_index: number;
  ttft_pred?: number;
  tpot_pred?: number;
  e2el_pred?: number;
}

export interface LssRow {
  model?: string;
  profile?: string;
  concurrency?: number;
  ttft_pred?: number;
  tpot_pred?: number;
  e2el_pred?: number;
  ttft_err?: number | null;
  tpot_err?: number | null;
  e2el_err?: number | null;
  // Per-turn trajectory (mean over sessions at each turn index) so the per-turn chart draws a curve.
  multiturn_turn_predictions?: LssTurn[];
}

export type LssLookup = Map<string, LssRow>;

export function buildLssLookup(json: Record<string, LssRow[]> | null): LssLookup {
  const m: LssLookup = new Map();
  if (!json) return m;
  for (const [gpuKey, rows] of Object.entries(json)) {
    for (const r of rows) {
      if (r.model && r.profile != null && r.concurrency != null) {
        m.set(rooflineKey(gpuKey, r.model, r.profile, r.concurrency), r);
      }
    }
  }
  return m;
}
