import { defineConfig } from 'tsup';
import { cpSync } from 'node:fs';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: true,
  splitting: false,
  onSuccess: async () => {
    cpSync('src/server/views', 'dist/views', { recursive: true });
    cpSync('src/server/service-worker.js', 'dist/service-worker.js');
    // The bundled migrator resolves migrations relative to dist/ (import.meta.url),
    // so ship the SQL files alongside the bundle for `npm start` to work.
    cpSync('src/db/migrations', 'dist/migrations', { recursive: true });
  },
});
