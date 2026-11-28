// @ts-check
import { readdirSync } from 'node:fs'
import path from 'node:path'

const integrationDir = path.join(import.meta.dirname, 'tests/integration')

/**
 * The slow-tier files whose tests run concurrently (project
 * `integration-concurrent`): the route HMR files (`route-hmr-browser*`)
 * and `moreConcurrentTests`, whose every test opens its own dev server,
 * page and app directory, starts only dev servers, edits only its own
 * app, and asserts only on its own server's log and its own page. Every
 * other project runs one test at a time. Left out: the files whose
 * warning and error assertions read what the process printed
 * (`RouteHmrPage.warnings`, Rsbuild's `serverErrors`), which concurrent
 * tests share. Paths relative to `tests/`.
 */
export const serialHmrTests = [
  'integration/route-hmr-browser-plugin.test.ts',
  'integration/route-hmr-browser-plugin-routes.test.ts',
  'integration/route-hmr-browser-plugin-order.test.ts',
  'integration/route-hmr-browser-kept-binding.test.ts',
  'integration/route-hmr-browser-kept-binding-solid.test.ts',
]
export const moreConcurrentTests = [
  'integration/code-splitter-refresh-placements.test.ts',
  'integration/route-hmr-rsbuild-dev-maps.test.ts',
  'integration/known-bugs-route-hmr-removals.test.ts',
  'integration/known-bugs-route-hmr-kept-binding.test.ts',
]
export const concurrentTests = [
  ...readdirSync(integrationDir)
    .filter(
      (file) =>
        file.startsWith('route-hmr-browser') && file.endsWith('.test.ts'),
    )
    .map((file) => `integration/${file}`)
    .filter((file) => !serialHmrTests.includes(file)),
  ...moreConcurrentTests,
]

/**
 * The helper modules the concurrent files import that open things or
 * declare tests: they too open only through the fixtures of `tests/test.ts`
 * (eslint.config.js). Paths relative to `tests/`.
 */
export const concurrentHelpers = [
  'route-hmr-edit.ts',
  ...readdirSync(integrationDir)
    .filter((file) => file.endsWith('-cases.ts'))
    .map((file) => `integration/${file}`),
]
