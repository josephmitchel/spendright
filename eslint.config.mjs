import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
  // Type-aware linting for the promise rules below; scoped to TS files so
  // the config and scripts (.mjs) don't need a project entry.
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Promise discipline, checked instead of habitual.
      // Design: promise-discipline-linted.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  {
    rules: {
      // Load-bearing: useLoadProtocol keys its load effect on `perform`'s
      // identity, and the preset's default warn exits 0.
      'react-hooks/exhaustive-deps': 'error',
      // An import used only in type position must say `import type`.
      // Design: client-server-boundary-enforced.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // A type import beside a value import of one module must merge.
      'import/no-duplicates': 'error',
      // Third-party block first, then internal, alphabetized.
      'import/order': [
        'error',
        {
          groups: [['builtin', 'external'], 'internal', ['parent', 'sibling', 'index']],
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      // An error, not a warning (lint exits 0 on warnings). The `_` prefix
      // marks a deliberately discarded binding.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
]);

export default eslintConfig;
