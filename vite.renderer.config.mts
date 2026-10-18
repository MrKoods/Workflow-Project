import { defineConfig } from 'vite';
import path from 'node:path';

// https://vitejs.dev/config
// The UI lives in ui/. Forge sets outDir relative to root, so pin it back to
// the project-level .vite folder that main.ts loads from in production.
export default defineConfig({
  root: path.resolve(import.meta.dirname, 'ui'),
  build: {
    outDir: path.resolve(import.meta.dirname, '.vite/renderer/main_window'),
    emptyOutDir: true,
  },
});
