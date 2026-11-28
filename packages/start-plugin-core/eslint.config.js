// @ts-check

import rootConfig, { compilerSourceConfig } from '../../eslint.config.js'
import concurrentTests from './tests/concurrent-tests.json' with { type: 'json' }
import noncompilerTests from './tests/noncompiler-tests.json' with { type: 'json' }

/**
 * Serial only (TEST-TOOLS-DESIGN.md, Decision B): what registers a close
 * with Vitest's global hooks closes with whichever test runs. The
 * concurrent files (`integration-concurrent`), and every helper module of
 * `tests/` but these (a concurrent file may import any of them), use none
 * of it, by any spelling or dynamic import: Vitest's `onTestFinished` and
 * `onTestFailed`, compiler-test-utils' `test-scope`, and these modules
 * (paths under `tests/`): the ones that register, and every module that
 * imports one of them. A helper that imports one and is not listed is an
 * error, so the list is complete.
 */
const serialModules = [
  'build-start',
  'dev-server',
  'hydrate-helpers',
  'importProtection/original-location',
  'importProtection/start-apps',
  'integration/hydrate-build-cases',
  'integration/hydrate-dev-edits',
  'integration/importProtection/allow-import-cases',
  'integration/importProtection/asset-query-app',
  'integration/importProtection/client-pages',
  'integration/importProtection/dropped-imports-apps',
  'integration/importProtection/hosts',
  'integration/importProtection/kept-importer-cases',
  'integration/importProtection/reported-location-app',
  'integration/importProtection/served-verdict-app',
  'integration/route-assets-cases',
  'integration/route-css-cases',
  'integration/route-edits-after-tree-rebuild',
  'integration/route-error-apps',
  'integration/rsbuild/route-set-reload-app',
  'integration/rsbuild/worker-warning-apps',
  'integration/rsc-warning-app',
  'integration/split-wrapped-values-cases',
  'integration/start-build-builder-shapes-cases',
  'integration/start-build-settlement-app',
  'integration/start-build-watch-cases',
  'integration/start-compose-app',
  'integration/start-router-server-only-switch',
  'render',
  'rsbuild-dev-server',
  'test-end',
  'test-page',
]
const message =
  "Serial only: registers its close with Vitest's global onTestFinished (or imports what does). Concurrent files share what a beforeAll opened; helper modules take what they open as a value."
const serialModulePath = `^\\.{1,2}/(.*/)?(${serialModules
  .map((module) => module.split('/').at(-1))
  .join('|')})(\\.[cm]?[jt]sx?)?$`
const noSerialImports = [
  'error',
  {
    paths: [
      {
        name: 'vitest',
        importNames: ['onTestFinished', 'onTestFailed'],
        message,
      },
      { name: '@tanstack/compiler-test-utils/test-scope', message },
    ],
    patterns: [{ regex: serialModulePath, message }],
  },
]
const serialImportExpressions = [
  {
    // (`.` for the slash: a selector's regex ends at its first `/`)
    selector: `ImportExpression[source.value=/^(?:vitest|@tanstack.compiler-test-utils.test-scope|(?:\\.\\.?.)+(?:.*.)?(?:${serialModules.map((module) => module.split('/').at(-1)).join('|')})(?:\\.[cm]?[jt]sx?)?)$/]`,
    message,
  },
]
const inTests = (/** @type {Array<string>} */ files) =>
  files.map((file) => `tests/${file}`)

export default [
  ...rootConfig,
  ...compilerSourceConfig,
  {
    // Main's tests of features that are not compilers, unchanged from main,
    // which does not lint its tests (`test:noncompiler` runs them).
    ignores: inTests(noncompilerTests),
  },
  {
    files: ['tests/**/!(*.test).{ts,tsx}', ...inTests(concurrentTests)],
    ignores: serialModules.flatMap((module) => [
      `tests/${module}.ts`,
      `tests/${module}.tsx`,
    ]),
    rules: {
      'no-restricted-imports': noSerialImports,
      'no-restricted-syntax': ['error', ...serialImportExpressions],
    },
  },
]
