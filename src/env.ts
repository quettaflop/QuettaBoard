// A build that serves ONLY the GPU fleet-state page — for a standalone deployment
// (e.g. a host with nothing to do with the benchmark/simulator dashboard) that
// should show nothing else. Implies INTERNAL below, so a deployer only needs to
// set this one flag.
export const GPU_ONLY = import.meta.env.VITE_GPU_ONLY === '1';

// Single source of truth for the public/internal build split.
//
// `VITE_INTERNAL=1` at build time flips this to `true`, which (a) surfaces the
// internal-only pages/nav and (b) lets Rollup keep the internal code + control
// API wiring. In a public build the flag is unset, `INTERNAL` folds to a
// compile-time `false`, and every internal branch is dead-code-eliminated so
// the emitted bundle never references the internal page code or control API.
export const INTERNAL = import.meta.env.VITE_INTERNAL === '1' || GPU_ONLY;
