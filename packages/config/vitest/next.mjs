import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Vitest preset for the Next.js clients.
 *
 * The setup file is resolved to an absolute path so it is found no matter
 * which workspace the run starts from.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: [fileURLToPath(new URL('./setup.ts', import.meta.url))],
  },
});
