import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The DASHBOARD build (index.html -> src/main.tsx). The marketing site is a
// separate app with its own config: see vite.site.config.ts.
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  define: {
    __BUILD_HASH__: JSON.stringify(Date.now().toString(36)),
  },
})
