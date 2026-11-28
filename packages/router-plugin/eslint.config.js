// @ts-check

import rootConfig, { compilerSourceConfig } from '../../eslint.config.js'
import { concurrentHelpers, concurrentTests } from './concurrent-tests.js'

/** Relative import patterns of a helper module of `tests/`. */
const helper = (/** @type {string} */ name) => [`./${name}`, `../${name}`]

const message =
  'registers its close with the global onTestFinished, which a concurrent test does not own: open through the fixtures of tests/test.ts'

export default [
  ...rootConfig,
  ...compilerSourceConfig,
  {
    // Route files the tests copy into their apps, outside the TypeScript
    // project (tsconfig.json)
    ignores: ['tests/**/test-files/**'],
  },
  {
    // The concurrent files and the helpers they import open nothing whose
    // close goes to Vitest's global `onTestFinished` (the serial files'
    // openers): with tests running at once, it is another test's
    files: [...concurrentTests, ...concurrentHelpers].map(
      (file) => `tests/${file}`,
    ),
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'vitest',
              importNames: ['onTestFinished', 'onTestFailed'],
              message: 'a concurrent test registers through its own context',
            },
          ],
          patterns: [
            ...[
              'dev-page',
              'dev-server',
              'generator-dev-app',
              'generator-dev-scenarios',
              'generator-watch-session',
              'batch-build',
              'production-bundle',
            ].map((name) => ({ group: helper(name), message })),
            { group: helper('route-app'), importNames: ['loadRoute'], message },
            {
              group: helper('build-harness'),
              importNames: [
                'build',
                'buildWithRsbuild',
                'buildAndRun',
                'buildShared',
                'buildSharedWithRsbuild',
              ],
              message,
            },
            {
              group: helper('route-hmr-page'),
              importNames: ['openRouteHmrPage'],
              message,
            },
            {
              group: helper('webpack-hmr-page'),
              importNames: ['openWebpackHmrPage'],
              message,
            },
          ],
        },
      ],
    },
  },
]
