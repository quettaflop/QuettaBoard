/**
 * Serving-engine identity for the Engine Index.
 *
 * Versions are the `engineVersion` values recorded on the QuettaBench runs
 * behind the frozen snapshot; the index compares those builds, not the
 * projects in general. Update alongside the snapshot.
 */
export const ENGINE_REFERENCE = 'vllm';

export const ENGINE_VERSIONS: Record<string, string> = {
  vllm: '0.19',
  sglang: '0.5.9',
};

export const ENGINE_VERSIONS_NOTE =
  'Versions are those recorded on the benchmark runs in the 2026-08-30 snapshot (vLLM 0.19.0–0.19.1, SGLang 0.5.9).';

const ENGINE_NAMES: Record<string, string> = {
  vllm: 'vLLM',
  sglang: 'SGLang',
};

export function engineLabel(engine: string, withVersion = false): string {
  const name = ENGINE_NAMES[engine] ?? engine;
  const version = ENGINE_VERSIONS[engine];
  return withVersion && version ? `${name} ${version}` : name;
}
