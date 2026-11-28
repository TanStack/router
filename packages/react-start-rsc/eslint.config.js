// @ts-check

import pluginReact from '@eslint-react/eslint-plugin'
import pluginReactHooks from 'eslint-plugin-react-hooks'
import rootConfig from '../../eslint.config.js'
import concurrentTests from './tests/concurrent-tests.json' with { type: 'json' }

/**
 * Serial only (TEST-TOOLS-DESIGN.md, Decision B): what registers a close with
 * Vitest's global hooks, on whichever test runs. The concurrent files, and
 * every helper module (any of them may be imported by a concurrent file), use
 * none of it: Vitest's global `test`, `it` and hooks, `rsc-serial.ts`, and the
 * suite of `rsc-css-rsbuild-rows.ts`, by any spelling or dynamic import.
 */
const serialModules = [
  'tests/integration/rsc-serial.ts',
  'tests/integration/rsc-css-rsbuild-rows.ts',
]
const serialOnly =
  "Serial only: registers its close with Vitest's global onTestFinished. Concurrent files use the fixtures of ./test; helper modules open with the open* openers of ./rsc-app."
const noSerialImports = [
  'error',
  {
    paths: [
      {
        name: 'vitest',
        importNames: ['it', 'onTestFailed', 'onTestFinished', 'test'],
        message: serialOnly,
      },
    ],
    patterns: [
      {
        group: [
          '**/rsc-serial',
          '**/rsc-serial.*',
          '**/rsc-css-rsbuild-rows',
          '**/rsc-css-rsbuild-rows.*',
        ],
        message: serialOnly,
      },
    ],
  },
]
const serialImportExpression = {
  selector:
    'ImportExpression[source.value=/vitest|rsc-serial|rsc-css-rsbuild-rows/]',
  message: serialOnly,
}

export default [
  ...rootConfig,
  {
    ...pluginReact.configs.recommended,
    files: ['**/*.{ts,tsx}'],
  },
  {
    plugins: {
      'react-hooks': pluginReactHooks,
    },
    rules: {
      '@eslint-react/no-unstable-context-value': 'off',
      '@eslint-react/no-unstable-default-props': 'off',
      '@eslint-react/dom/no-missing-button-type': 'off',
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
  {
    name: 'react-start-rsc/import-boundaries',
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@tanstack/start-server-core',
              message:
                'Import from a dedicated @tanstack/start-server-core subpath to avoid pulling the full server barrel into the RSC module graph.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "ImportExpression[source.value='@tanstack/start-server-core']",
          message:
            'Dynamically import a dedicated @tanstack/start-server-core subpath instead of the root barrel.',
        },
      ],
    },
  },
  {
    name: 'react-start-rsc/no-serial-openers',
    files: ['tests/integration/!(*.test).ts'],
    ignores: serialModules,
    rules: {
      'no-restricted-imports': noSerialImports,
      'no-restricted-syntax': ['error', serialImportExpression],
    },
  },
  {
    // (static imports only: what a dynamic one loads is not checked)
    name: 'react-start-rsc/concurrent-tests',
    files: concurrentTests,
    rules: {
      'no-restricted-imports': noSerialImports,
      'no-restricted-syntax': [
        'error',
        { selector: 'ImportExpression', message: serialOnly },
      ],
    },
  },
  {
    files: ['**/__tests__/**'],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },
]
