import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/routeTree.gen.ts',
      'apps/mobile/.expo/**',
      'apps/mobile/expo-env.d.ts',
      'apps/web/public/mockServiceWorker.js',
      '*.html',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}', 'apps/mobile/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  { files: ['apps/web/public/**/*.js'], languageOptions: { globals: globals.browser } },
  { files: ['**/*.{cjs,mjs}', 'apps/mobile/*.js'], languageOptions: { globals: globals.node } },
  { files: ['**/test/**', '**/*.test.{ts,tsx}'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
);
