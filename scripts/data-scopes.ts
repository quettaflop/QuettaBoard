// Single source of truth for dashboard data scopes.
//
// Both build-data.ts (writes data.json + the per-scope data.<scope>.json
// sidecars) and validate-data.ts (asserts the aggregate and each sidecar agree)
// import DATA_SCOPES + normalizeDataScope from here. Keeping the list and the
// alias table in ONE place is load-bearing: when the two drifted (moe_ep was
// added to build-data but not validate, 2026-07) the validator silently
// miscounted moe_ep rows as trace_replay, failed on every run, and froze the R2
// data.json mirror for two weeks. Add a scope here and both sides pick it up.

export type DataScope = 'trace_replay' | 'synthetic_distributional' | 'archived' | 'moe_ep';

export const DATA_SCOPES: DataScope[] = ['trace_replay', 'synthetic_distributional', 'archived', 'moe_ep'];

// Canonicalize a raw dataScope string (including historical aliases) to one of
// DATA_SCOPES, or undefined if unrecognized. Callers that need a total function
// apply their own fallback (build-data's detectDataScope and validate's
// normalizeScope both fall back to 'trace_replay').
export function normalizeDataScope(
  scope: string | undefined,
): DataScope | undefined {
  if (scope === 'moe_ep') return 'moe_ep';
  if (scope === 'synthetic_distributional' || scope === 'synthetic' || scope === 'latest') return 'synthetic_distributional';
  if (scope === 'trace_replay' || scope === 'archive') return 'trace_replay';
  if (scope === 'archived' || scope === 'current' || scope === 'canonical' || scope === 'fixed' || scope === 'fixed-grid' || scope === 'mse') {
    return 'archived';
  }
  return undefined;
}
