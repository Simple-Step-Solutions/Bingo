import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

/**
 * ESLint config.
 *
 * `npm run lint` (tsc --noEmit) catches type errors and unused symbols. It does
 * not catch either of the two classes of bug that actually shipped here:
 *
 *   * A component defined inside a render, which made React see a new component
 *     type on every keystroke and remount the manual-code input mid-scan.
 *     react-hooks and the rules below catch that shape.
 *   * An interactive div with no role and no key handler, which made the bingo
 *     grid unreachable by keyboard. jsx-a11y catches that.
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'functions/node_modules/**', 'dev-dist/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.es2022 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,

      // The dependency-array rule is the one that matters, and it is an error.
      'react-hooks/exhaustive-deps': 'error',

      // A new React 19 rule. Every current hit is a snapshot subscription
      // setting its initial state, which is the pattern the docs themselves
      // recommend for external stores. Left visible rather than switched off,
      // because it is worth reading each new one.
      'react-hooks/set-state-in-effect': 'warn',

      // 29 hits, almost all in admin forms that wrap their input in a label
      // without htmlFor. Real, mechanical, and worth doing -- but doing it
      // blind across every admin form is how a form quietly stops submitting.
      // A warning so it stays visible instead of being silently switched off.
      'jsx-a11y/label-has-associated-control': 'warn',

      // Firestore documents genuinely arrive as untyped data, and narrowing
      // every snapshot would be noise rather than safety. Flagged, not fatal.
      '@typescript-eslint/no-explicit-any': 'warn',

      // tsc already enforces this with noUnusedLocals; duplicating it here just
      // produces two messages for the same line.
      '@typescript-eslint/no-unused-vars': 'off',

      // Empty catch blocks are used deliberately for storage access in private
      // browsing mode, where a throw is expected and means nothing.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  {
    files: ['functions/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'commonjs',
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      // Node exposes a global `crypto`, and `require('node:crypto')` shadows
      // it. That is the idiomatic import and gives the full API rather than
      // just WebCrypto.
      'no-redeclare': 'off',
    },
  },

  {
    // Service workers run in their own global scope: `self`, `clients`, and
    // importScripts are not window globals.
    files: ['public/**/*.js', 'src/**/*sw.{js,ts}'],
    languageOptions: {
      globals: { ...globals.serviceworker, importScripts: 'readonly', firebase: 'readonly' },
    },
  },

  {
    files: ['rules-tests/**/*.ts', 'functions/test/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
