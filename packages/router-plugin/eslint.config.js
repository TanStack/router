// @ts-check

import rootConfig, { compilerSourceConfig } from '../../eslint.config.js'
import { concurrentTests } from './concurrent-tests.js'

/**
 * Serial only (TEST-TOOLS-DESIGN.md, Decision B): what registers a close with
 * Vitest's global hooks, on whichever test runs. The concurrent files, and
 * every other helper module of `tests/` (a concurrent file may import any of
 * them), use none of it, by any spelling or dynamic import: Vitest's global
 * `test`, `it` and test hooks, compiler-test-utils' `test-scope`, the serial
 * modules, and the serial openers of `route-app.ts` and `build-harness.ts`.
 */
const serialModules = [
  'batch-build',
  'dev-page',
  'dev-server',
  'generator-dev-app',
  'generator-dev-scenarios',
  'generator-watch-session',
  'production-bundle',
  'route-hosts-setup',
  'serial',
  'test-end',
]
const serialExports = {
  'route-app': ['loadRoute', 'closeRouteHosts'],
  'build-harness': ['build', 'buildWithRsbuild', 'buildAndRun'],
}
const message =
  "Serial only: registers its close with Vitest's global onTestFinished. Concurrent files open through the fixtures of tests/test.ts; helper modules take what they open as a value."
/** The relative spellings of a module of `tests/`, with or without an extension. */
const spellings = (/** @type {string} */ name) =>
  ['./', '../', '../../'].flatMap((up) => [up + name, `${up}${name}.*`])
const noSerialImports = [
  'error',
  {
    paths: [
      {
        name: 'vitest',
        importNames: ['it', 'onTestFailed', 'onTestFinished', 'test'],
        message,
      },
      { name: '@tanstack/compiler-test-utils/test-scope', message },
    ],
    patterns: [
      { group: serialModules.flatMap(spellings), message },
      ...Object.entries(serialExports).map(([name, importNames]) => ({
        group: spellings(name),
        importNames,
        message,
      })),
    ],
  },
]
const serialImportExpression = {
  // (`.` for the slash: a selector's regex ends at its first `/`)
  selector: `ImportExpression[source.value=/^(?:vitest|@tanstack.compiler-test-utils.test-scope|(?:\\.\\.?.)+(?:${[...serialModules, ...Object.keys(serialExports)].join('|')})(?:\\.[cm]?[jt]s)?)$/]`,
  message,
}
/**
 * No test of a file runs at once with another but in `integration-concurrent`
 * (a project setting, not a test's): a serial file's openers register on
 * whichever test runs.
 */
const noConcurrentTests = [
  {
    selector: "MemberExpression[property.name='concurrent']",
    message:
      'Tests run concurrently only in integration-concurrent (concurrent-tests.js), as a project.',
  },
  {
    selector:
      "CallExpression > ObjectExpression > Property[key.name='concurrent']",
    message:
      'Tests run concurrently only in integration-concurrent (concurrent-tests.js), as a project.',
  },
]
const tests = (/** @type {Array<string>} */ names) =>
  names.map((name) => `tests/${name}.ts`)

export default [
  ...rootConfig,
  ...compilerSourceConfig,
  {
    // Route files the tests copy into their apps, outside the TypeScript
    // project (tsconfig.json)
    ignores: ['tests/**/test-files/**'],
  },
  {
    name: 'router-plugin/no-concurrent-tests',
    files: ['tests/**/*.ts'],
    rules: { 'no-restricted-syntax': ['error', ...noConcurrentTests] },
  },
  {
    name: 'router-plugin/no-serial-openers',
    files: ['tests/**/!(*.test).ts'],
    ignores: tests([...serialModules, ...Object.keys(serialExports)]),
    rules: {
      'no-restricted-imports': noSerialImports,
      'no-restricted-syntax': [
        'error',
        serialImportExpression,
        ...noConcurrentTests,
      ],
    },
  },
  {
    name: 'router-plugin/concurrent-tests',
    files: concurrentTests.map((file) => `tests/${file}`),
    rules: {
      'no-restricted-imports': noSerialImports,
      'no-restricted-syntax': [
        'error',
        serialImportExpression,
        ...noConcurrentTests,
      ],
    },
  },
]
