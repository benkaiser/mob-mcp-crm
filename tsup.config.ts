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
  },
});
