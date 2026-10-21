/**
 * Production client bundles carry nothing of the dev server's additions
 * (route HMR, React Refresh support), per bundler and framework (SPEC G7):
 * the checks of integration/build-production*.test.ts (one file per bundler
 * group, to keep each file within its time budget).
 * The build decides production by its own signal (the bundler's production
 * mode), with `NODE_ENV` unset, and the plugin's default for `addHmr`.
 *
 * The decision is by purpose, through paired real builds (N18): a build
 * with route HMR off (`addHmr: false`, `NODE_ENV=production` when the
 * plugin is created) is the control, which differs in the development
 * features only, so what the production bundle has and the control lacks
 * serves development. Neither oracle is tied to how our own support code is
 * named, printed or placed:
 * - the bundle runs in a real browser with no hot context and renders the
 *   route;
 * - it references none of the public development APIs (the bundlers' hot
 *   module APIs, the React Refresh runtime's globals);
 * - the route module a user imports has the same exports as the control's
 *   (an export added for a refresh runtime, e.g. a refresh boundary anchor,
 *   is development support the user's module surface ships).
 * The statements the bundle has and the control lacks (`addedCode` of
 * `@tanstack/compiler-test-utils/added-code`) are inspection evidence only:
 * they are attached to every failure message, never a reason to reject on
 * their own (a production specialisation may print or factor code
 * differently from the control).
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

/** The exports of the route module, as the user's entry re-exports them. */
const routeExports = `return Object.keys(entry).sort()`

/**
 * Builds the route for production and asserts that the bundle renders the
 * route and has none of the dev server's additions (see the module comment).
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
  const control = await productionBuild(
    bundler,
    framework,
    autoCodeSplitting,
    true,
  )
  // Evidence for a failure's reader: what the bundle ships that the control
  // does not, statement by statement
  const added = addedCode(app, control)
  const evidence = `statements the bundle has and the control lacks (inspection evidence, not the decision):\n${
    added
      .map((statement) => `  [${statement.chunk}] ${statement.code}`)
      .join('\n') || '  (none)'
  }`
  const run = await app.run(`await entry.mount(entry.Route.options.component)`)
  expect(run.html, evidence).toContain('MARK_PAGE')
  expect(
    Object.keys(publicDevApis).filter(
      (name) => app.where(publicDevApis[name]!) !== 'nowhere',
    ),
    `public development APIs the bundle references\n${evidence}`,
  ).toEqual([])
  expect(
    (await app.run(routeExports)).result,
    `exports of the route module, the control's being ${JSON.stringify((await control.run(routeExports)).result)}\n${evidence}`,
  ).toEqual((await control.run(routeExports)).result)
}
