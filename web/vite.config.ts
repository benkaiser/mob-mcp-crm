import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';

// Backend default port is 3000 (see src/index.ts: PORT = process.env.PORT || '3000').
const BACKEND = process.env.MOB_BACKEND ?? 'http://localhost:3000';

// SPA is served under /app, with the JSON API at /web/api and auth pages under /web.
export default defineConfig({
  root: __dirname,
  base: '/app/',
  plugins: [preact()],
  build: {
    // Emit to the top-level dist-web/ directory (sibling of dist/).
    outDir: '../dist-web',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Main SPA entry (index.html → main.tsx).
        main: resolve(__dirname, 'index.html'),
        // App-shell service worker, emitted to dist-web/sw-app.js (no hash) so
        // it has a stable URL at /app/sw-app.js for registration with scope /app/.
        'sw-app': resolve(__dirname, 'src/sw-app.ts'),
      },
      output: {
        // Keep the service worker at a predictable, unhashed path; everything
        // else (the SPA bundle) goes under assets/ with content hashes.
        entryFileNames: (chunk) =>
          chunk.name === 'sw-app' ? 'sw-app.js' : 'assets/[name]-[hash].js',
      },
    },
  },
  server: {
    proxy: {
      // Proxy the JSON API and server-rendered auth pages to the backend in dev.
      '/web/api': { target: BACKEND, changeOrigin: true },
      '/web': { target: BACKEND, changeOrigin: true },
    },
  },
});
