/**
 * Production client bundles carry nothing of the dev server's additions
 * (route HMR, React Refresh support), per bundler and framework (SPEC G7):
 * the checks of integration/build-production*.test.ts (one file per bundler
 * group, to keep each file within its time budget).
 * The build decides production by its own signal (the bundler's production
 * mode), with `NODE_ENV` unset, and the plugin's default for `addHmr`.
 *
 * Two oracles, neither tied to how our own support code is named:
 * - the public hot APIs and the React Refresh runtime's globals are absent;
 * - a build with route HMR off (`addHmr: false`, `NODE_ENV=production` when
 *   the plugin is created) is the control: the production bundle ships no
 *   statement the control lacks (`addedCode` of
 *   `@tanstack/compiler-test-utils/added-code`: private names, printing
 *   and chunk placement are free), so it holds no extra support code or
 *   dependency, whatever it is called and whatever names it reuses.
 */
import { addedCode } from '@tanstack/compiler-test-utils/added-code'
import { expect } from 'vitest'
import { build, buildWithRsbuild, routeApp, routeHead } from './build-harness'
import type { Bundler } from '@tanstack/compiler-test-utils/build-harness'
import type { Framework } from './build-harness'

export const timeout = 120_000

const route = (
  framework: Framework,
) => `${routeHead(framework)}function Page() {
  return <p>MARK_PAGE</p>
}
function Failure() {
  return <p>MARK_FAILURE</p>
}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  errorComponent: Failure,
  component: Page,
})
`

/**
 * The public development APIs: the bundlers' hot module APIs and the React
 * Refresh runtime's globals. (`__TSR_ROUTER__` is not one: the router sets
 * it in production too.)
 */
const publicDevApis: Record<string, RegExp> = {
  'import.meta.hot': /\bimport\.meta\.hot\b/,
  'import.meta.webpackHot': /\bimport\.meta\.webpackHot\b/,
  'module.hot': /\bmodule\.hot\b/,
  $RefreshReg$: /\$RefreshReg\$/,
  $RefreshSig$: /\$RefreshSig\$/,
}

/**
 * Builds the route for production: as an app builds it (`NODE_ENV` unset,
 * the plugin's default `addHmr`), or as the control with route HMR off.
 */
async function productionBuild(
  bundler: Bundler | 'rsbuild',
  framework: Framework,
  autoCodeSplitting: boolean,
  control: boolean,
) {
  const pluginOptions = {
    autoCodeSplitting,
    codeSplittingOptions: { addHmr: control ? false : undefined },
  }
  const nodeEnv = control ? 'production' : null
  const files = routeApp(route(framework), { env: 'client', framework })
  return bundler === 'rsbuild'
    ? buildWithRsbuild({ nodeEnv, pluginOptions, files })
    : build({
        bundler,
        framework,
        env: 'client',
        nodeEnv,
        pluginOptions,
        files,
      })
}

/**
 * Builds the route for production and asserts that the bundle renders the
 * route and has none of the dev server's additions.
 */
export async function expectProductionClientBundle(
  bundler: Bundler | 'rsbuild',
  framework: Framework,
  autoCodeSplitting: boolean,
) {
  const app = await productionBuild(
    bundler,
    framework,
    autoCodeSplitting,
    false,
  )
  const run = await app.run(`await entry.mount(entry.Route.options.component)`)
  expect(run.html).toContain('MARK_PAGE')
  expect(
    Object.keys(publicDevApis).filter(
      (name) => app.where(publicDevApis[name]!) !== 'nowhere',
    ),
  ).toEqual([])
  const control = await productionBuild(
    bundler,
    framework,
    autoCodeSplitting,
    true,
  )
  expect(addedCode(app, control), 'code the control build lacks').toEqual([])
}
