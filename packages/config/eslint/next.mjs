import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import eslintConfigPrettier from 'eslint-config-prettier';

/**
 * ESLint preset for the Next.js clients.
 *
 * `eslint-config-prettier` comes last so formatting is left entirely to
 * Prettier, which runs as its own repository check.
 */
export default defineConfig([
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'next-env.d.ts',
  ]),
  ...nextVitals,
  ...nextTs,
  eslintConfigPrettier,
]);
