// ESLint for the whole workspace. One config, flat.
//
// Two rules carry the master prompt's invariants rather than style:
//   - packages/engine is pure (I4): it may not import Node, the database, or the model client.
//   - packages/ai is the only place a model endpoint is called (rule 9).
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      'design/**',
      '.watch/**',
      'coverage/**',
      'tests/e2e/__screenshots__/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['packages/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'fs', 'path', 'crypto', 'os', 'child_process'],
              message: 'packages/engine is pure (I4): no Node I/O.',
            },
            {
              group: ['pg', 'pg-boss', 'drizzle-orm', 'drizzle-orm/*', '@ekbill/db', '@ekbill/db/*'],
              message: 'packages/engine is pure (I4): no database.',
            },
            {
              group: ['@ekbill/ai', '@ekbill/ai/*', 'openai'],
              message: 'packages/engine is pure (I4): no model calls.',
            },
            { group: ['next', 'next/*', 'react', 'react-dom'], message: 'packages/engine is pure (I4): no framework.' },
          ],
        },
      ],
      'no-restricted-globals': ['error', { name: 'fetch', message: 'packages/engine is pure (I4).' }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'packages/engine is pure (I4): dates are passed in.',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'packages/engine is pure (I4): dates are passed in.',
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: 'packages/engine is deterministic (I4).',
        },
        {
          selector:
            "CallExpression[callee.name='fetch'] > Literal[value=/openai\\.com|api\\.anthropic|generativelanguage/]",
          message: 'Model endpoints are called only from packages/ai (rule 9).',
        },
        {
          selector:
            "CallExpression[callee.name='fetch'] > TemplateLiteral[quasis.0.value.raw=/openai\\.com|api\\.anthropic|generativelanguage/]",
          message: 'Model endpoints are called only from packages/ai (rule 9).',
        },
      ],
    },
  },
  {
    // Everything except packages/ai (which makes the calls) and packages/engine (whose own block below
    // carries these two selectors beside its purity rules: a later matching block replaces, not merges).
    files: ['**/*.{ts,tsx,mjs}'],
    ignores: ['packages/ai/**', 'packages/engine/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.name='fetch'] > Literal[value=/openai\\.com|api\\.anthropic|generativelanguage/]",
          message: 'Model endpoints are called only from packages/ai (rule 9).',
        },
        {
          selector:
            "CallExpression[callee.name='fetch'] > TemplateLiteral[quasis.0.value.raw=/openai\\.com|api\\.anthropic|generativelanguage/]",
          message: 'Model endpoints are called only from packages/ai (rule 9).',
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs', '**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        Buffer: 'readonly',
      },
    },
  },
);
