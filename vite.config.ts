// Import from 'vitest/config' (not 'vite') so the `test` block below is typed.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // React fast-refresh in dev and the JSX transform in build.
  plugins: [react()],
  test: {
    // Required: unit tests run in plain Node, no DOM emulation.
    environment: 'node',
    // Only treat files under src/ as tests; keeps node_modules/dist out.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
