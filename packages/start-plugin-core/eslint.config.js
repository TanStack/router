// @ts-check

import rootConfig, { compilerSourceConfig } from '../../eslint.config.js'
import noncompilerTests from './tests/noncompiler-tests.json' with { type: 'json' }

/**
 * What closes with the current test (Vitest's global `onTestFinished`): in
 * a file whose tests run at once (`integration-concurrent`), the current
 * test is any of them. Those files share what a `beforeAll` opened.
 */
const serialOnly = {
  message:
    'Closes with the current test: concurrent tests share what a beforeAll opened (the `*Shared` openers).',
  importNames: [
    'onTestFinished',
    'onTestFailed',
    'buildStart',
    'serveStartBuild',
    'openAppPage',
    'startDevServer',
    'startRsbuildDevServer',
    'startRsbuildStartDevServer',
    'startBrowserStartDevServer',
    'startBrowserRsbuildDevServer',
    'startBrowserRsbuildStartDevServer',
    'startBrowserProtectedDevServer',
    'startProtectedDevServer',
    'startRscProtectedDevServer',
    'startRsbuildRscApp',
    'startViteRscApp',
    'startEditHost',
    'closedWithTest',
    'openTestPage',
  ],
}

/**
 * The files of `integration-concurrent` (vite.config.ts) and the helpers
 * they import, checked by the same rules (a helper outside the list is an
 * error in the file importing it).
 */
const concurrentFiles = [
  'tests/integration/hydrate-pages*.ts',
  'tests/integration/clientOnlyJSX.test.ts',
  'tests/integration/start-build-jsx-and-builders.test.ts',
  'tests/settled-source.ts',
]

export default [
  ...rootConfig,
  ...compilerSourceConfig,
  {
    // Main's tests of features that are not compilers, unchanged from main,
    // which does not lint its tests (`test:noncompiler` runs them).
    ignores: noncompilerTests.map((file) => `tests/${file}`),
  },
  {
    files: concurrentFiles,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            // (any module and spelling: a name is what is restricted)
            { regex: '.', ...serialOnly },
            {
              regex:
                '^\\.\\.?/(?!(hydrate-pages(-react|-solid)?|build-harness|settled-source)(\\.[cm]?[jt]sx?)?$)',
              message:
                'A helper of a concurrent file is one of `concurrentFiles` in eslint.config.js, checked by the same rules.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression',
          message:
            'Concurrent files import statically: the rule checks what they import.',
        },
      ],
    },
  },
  {
    // Every other file runs one test at a time: the openers close with the
    // current test (Vitest's global `onTestFinished`).
    files: ['tests/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...['test', 'it', 'describe', 'suite'].map((object) => ({
          object,
          property: 'concurrent',
          message:
            'Tests of a file run at once only in `integration-concurrent` (vite.config.ts).',
        })),
      ],
    },
  },
]
