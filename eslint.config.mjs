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
  {
    rules: {
      // An import used only in type position must say `import type`, so a
      // client component that type-imports from the server graph (CategorizedTransaction,
      // LinkResult, ...) can never silently become a value import that drags
      // the db pool and Plaid SDK into the browser bundle. This is the
      // enforcement for what used to be comment-only discipline.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // The `_` prefix marks a deliberately discarded binding (e.g. omitting
      // a column via rest-destructuring); without this the convention only
      // produces permanent warnings, which trains everyone to ignore lint.
      '@typescript-eslint/no-unused-vars': [
        'warn',
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
