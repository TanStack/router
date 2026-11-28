// @ts-check

import rootConfig, { compilerSourceConfig } from '../../eslint.config.js'
import { concurrentTests } from './concurrent-tests.js'

/**
 * Serial only (TEST-TOOLS-DESIGN.md, Decision B): what registers a close with
 * Vitest's global hooks, on whichever test runs. The concurrent files, and
 * every other helper module of `tests/` (a concurrent file may import any of
 * them), use none of it, by any spelling or dynamic import: Vitest's global
 * `test`, `it` and test hooks, compiler-test-utils' `test-end`, the serial
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
]
const serialExports = {
  'route-app': ['loadRoute', 'closeRouteHosts'],
  'build-harness': ['build', 'buildWithRsbuild', 'buildAndRun'],
}
const message =
  "Serial only: registers its close with Vitest's global onTestFinished. Concurrent files open through the fixtures of tests/test.ts; helper modules take what they open as a value."
/** A module of `tests/` by any path, with or without an extension (no package's). */
const spellings = (/** @type {Array<string>} */ names) => [
  ...names.flatMap((name) => [`**/${name}`, `**/${name}.*`]),
  '!@tanstack/**',
]
const noSerialImports = [
  'error',
  {
    paths: [
      {
        name: 'vitest',
        importNames: ['it', 'onTestFailed', 'onTestFinished', 'test'],
        message,
      },
      { name: '@tanstack/compiler-test-utils/test-end', message },
    ],
    patterns: [
      { group: spellings(serialModules), message },
      ...Object.entries(serialExports).map(([name, importNames]) => ({
        group: spellings([name]),
        importNames,
        message,
      })),
    ],
  },
]
const serialImportExpressions = [
  {
    // (`\x2f` for the slash: a selector's regex ends at its first `/`)
    selector: `ImportExpression[source.value=/^(?:vitest|@tanstack\\x2fcompiler-test-utils\\x2ftest-end|(?:[^@].*\\x2f)?(?:${[...serialModules, ...Object.keys(serialExports)].join('|')})(?:\\.[cm]?[jt]sx?)?)$/]`,
    message,
  },
  {
    selector: "ImportExpression[source.type!='Literal']",
    message: `${message} (A dynamic import names its module as a string.)`,
  },
]
const tests = (/** @type {Array<string>} */ names) =>
  names.map((name) => `tests/${name}.{ts,tsx}`)

export default [
  ...rootConfig,
  ...compilerSourceConfig,
  {
    // Route files the tests copy into their apps, outside the TypeScript
    // project (tsconfig.json)
    ignores: ['tests/**/test-files/**'],
  },
  {
    name: 'router-plugin/no-serial-openers',
    files: ['tests/**/!(*.test).{ts,tsx}'],
    ignores: tests([...serialModules, ...Object.keys(serialExports)]),
    rules: {
      'no-restricted-imports': noSerialImports,
      'no-restricted-syntax': ['error', ...serialImportExpressions],
    },
  },
  {
    name: 'router-plugin/concurrent-tests',
    files: concurrentTests.map((file) => `tests/${file}`),
    rules: {
      'no-restricted-imports': noSerialImports,
      'no-restricted-syntax': ['error', ...serialImportExpressions],
    },
  },
]
