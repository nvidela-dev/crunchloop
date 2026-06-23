// @ts-check
import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Baseline shared across the repo's TypeScript projects:
//   eslint:recommended + @typescript-eslint/recommended
export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'dist', 'coverage'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'module',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
