import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

// Flat config — the current ESLint format, one array of layered configs.
export default tseslint.config(
  // Build output is generated; never lint it.
  { ignores: ['dist'] },
  // Baseline correctness rules for plain JS.
  js.configs.recommended,
  // TypeScript rules, non-type-checked variant: fast, and needs no project wiring.
  tseslint.configs.recommended,
  // Must come last: turns off every rule that would fight Prettier's formatting.
  prettier,
);
