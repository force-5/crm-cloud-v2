/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

/** The MSW worker (public/mockServiceWorker.js) is for `VITE_MOCK_API=true` dev runs only — never ship it. */
function dropMockWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'crm:drop-mock-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      rmSync(resolve(outDir, 'mockServiceWorker.js'), { force: true });
    },
  };
}

export default defineConfig({
  base: '/crm/',
  plugins: [
    // Must run before the React plugin.
    tanstackRouter({ target: 'react', autoCodeSplitting: true, routesDirectory: './src/routes', generatedRouteTree: './src/routeTree.gen.ts' }),
    react(),
    tailwindcss(),
    dropMockWorker(),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/crm/api': { target: 'http://localhost:8082', changeOrigin: false },
    },
  },
  build: {
    sourcemap: true,
    target: 'es2022',
    // No manualChunks: hand-splitting React away from libraries that use it at module-init time
    // (radix, react-i18next…) produced a circular chunk graph and a blank page in production.
    // Route-level splitting (autoCodeSplitting) keeps feature chunks small; the entry is ~200 kB gzip.
    chunkSizeWarningLimit: 750,
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
    testTimeout: 15000,
  },
});
