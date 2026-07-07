/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `'1'` in an internal build; unset in a public build. See src/env.ts. */
  readonly VITE_INTERNAL?: string;
}
