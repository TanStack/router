// @ts-check

import pluginReact from '@eslint-react/eslint-plugin'
import pluginReactHooks from 'eslint-plugin-react-hooks'
import rootConfig from '../../eslint.config.js'
import concurrentTests from './tests/concurrent-tests.json' with { type: 'json' }

/** What a concurrent test must not call: closes registered on whichever test runs (Vitest's global hooks). */
const serialOnly =
  "Serial only: registers its close with Vitest's global onTestFinished. Concurrent files use the fixtures of ./test and the open* openers."

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
    name: 'react-start-rsc/concurrent-tests',
    files: concurrentTests,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'vitest',
              importNames: ['onTestFinished', 'onTestFailed', 'test'],
              message: serialOnly,
            },
            {
              name: './rsc-app',
              importNames: [
                'blankPage',
                'errorsOf',
                'openRscPage',
                'serveRscBuild',
                'startRscDevServer',
                'startRscPreviewServer',
                'startRscRsbuildDevServer',
                'startRscRsbuildPreviewServer',
              ],
              message: serialOnly,
            },
            {
              name: './rsc-reach-app',
              importNames: ['everyOutcome', 'expectReachHistory'],
              message: serialOnly,
            },
          ],
        },
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
