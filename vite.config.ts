import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// Relative base: emitted asset paths are "./assets/...", so the built site
// works opened straight from disk (file://), from a GitHub Pages subpath, or
// from any other subdirectory — with no repo-name coupling. Routing is hash
// based, so no server rewrites are needed either.
// `npm run build:offline` sets this. It produces a build with nothing to
// fetch: one classic (non-module) script, no code splitting. That matters
// because browsers block ES module loading over file:// — each file is an
// opaque origin, so a `type="module"` script fails CORS and the page renders
// blank. Inlining everything sidesteps the issue entirely.
const offline = process.env.VERBA_OFFLINE === '1'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: offline ? 'dist-offline' : 'dist',
    // Stay with ES module output — an `iife` build would have `import.meta`
    // rewritten to `{}`, breaking import.meta.env.BASE_URL and the content
    // glob. Instead just collapse to a single chunk, which the offline script
    // then inlines as an *inline* module (inline modules need no fetch, so
    // file:// has nothing to block).
    ...(offline
      ? {
          rollupOptions: {
            output: {
              inlineDynamicImports: true,
              entryFileNames: 'app.js',
              assetFileNames: 'app.[ext]',
            },
          },
        }
      : {}),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@content': fileURLToPath(new URL('./content', import.meta.url)),
    },
  },
})
