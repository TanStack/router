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
  ],
}

export default [
  ...rootConfig,
  ...compilerSourceConfig,
  {
    // Main's tests of features that are not compilers, unchanged from main,
    // which does not lint its tests (`test:noncompiler` runs them).
    ignores: noncompilerTests.map((file) => `tests/${file}`),
  },
  {
    // The files of `integration-concurrent` (vite.config.ts) and their helpers
    files: [
      'tests/integration/hydrate-pages*.ts',
      'tests/integration/clientOnlyJSX.test.ts',
      'tests/integration/start-build-jsx-and-builders.test.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ regex: '.', ...serialOnly }] },
      ],
    },
  },
]
