import { defineConfig } from 'vite';

// https://vitejs.dev/config
// onnxruntime-web (wake word) stays outside the bundle: it loads its own .wasm
// files from node_modules, which bundling would break.
export default defineConfig({
  build: { rollupOptions: { external: ['onnxruntime-web'] } },
});
