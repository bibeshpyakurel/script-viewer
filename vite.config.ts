// Import from 'vitest/config' (not 'vite') so the `test` block below is typed.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Asset path prefix. Defaults to the domain root, which is right for local
  // dev and for hosts that serve at `/`. GitHub Pages serves from
  // /<repo-name>/, so the deploy workflow sets VITE_BASE accordingly.
  base: process.env.VITE_BASE ?? '/',
  // React fast-refresh in dev and the JSX transform in build.
  plugins: [react()],
  test: {
    // Required: unit tests run in plain Node, no DOM emulation.
    environment: 'node',
    // Only treat files under src/ as tests; keeps node_modules/dist out.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/*.d.ts',
        'src/main.tsx',
      ],
      // A ratchet set just under the numbers measured on 2026-09-15
      // (statements 70.27, branches 64.83, functions 72.43, lines 72.92).
      // The uniform-node invariant this project rests on is enforced by tests,
      // so coverage dropping is a real signal, not bookkeeping.
      thresholds: {
        statements: 68,
        branches: 62,
        functions: 70,
        lines: 70,
      },
    },
  },
});
