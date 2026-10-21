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
 * - running it never touches a development global (G7 outcome): the page
 *   traps the React Refresh runtime's globals, the ignored-exports hook of
 *   `@vitejs/plugin-react`'s refresh runtime and the router's HMR globals
 *   before any module of the app evaluates, and records every read and
 *   write; and it leaves no global the control's page lacks (whatever the
 *   name: e.g. refresh bookkeeping shipped without its hot-API guard);
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
import { globalTrapSource } from '@tanstack/compiler-test-utils/global-trap'
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
 * Development globals a production page must never touch: the React
 * Refresh runtime's registration globals, the hook through which
 * `@vitejs/plugin-react`'s refresh runtime asks for the exports it ignores,
 * and the router's HMR globals (route HMR finds the live router through
 * `__TSR_ROUTER__`). `__TSR_ROUTER__` is a development global here only
 * because these pages create no router (the router's own runtime writes it
 * in production too): that premise is asserted on every row, on the
 * control's page (route HMR off), which must touch none of them. A trap
 * fires only when a module touches the name (a read, a write, a probe such
 * as `in` or `hasOwnProperty`, a definition: `globalTrapSource`), so a
 * production bundle that touches none of them, whatever its own names,
 * passes; the global comparison with the control is the name-free check.
 */
const devGlobals = [
  '$RefreshReg$',
  '$RefreshSig$',
  '__getReactRefreshIgnoredExports',
  '__TSR_REACT_REFRESH__',
  '__TSR_ROUTER__',
]

/**
 * The module the entry imports first (so it evaluates before any other
 * module of the app): traps `devGlobals` on the page's global object
 * (`globalTrapSource`: every read, write, probe or definition). (An app
 * module like any other: the bundlers compile it, the router plugin does
 * not.)
 */
const devGlobalsTrap = `/** Every touch of a development global so far. */
export const devGlobalsTouched: () => Array<string> = ${globalTrapSource({
  // Encoded, so that the bundle's text holds none of the names the static
  // check of the development APIs looks for
  names: `${JSON.stringify(devGlobals.map((name) => Buffer.from(name).toString('base64')))}.map((name) => atob(name))`,
})}
`

/**
 * The app's files with the trap module (`devGlobalsTrap`) imported first by
 * the client entry.
 */
function withDevGlobalsTrap(files: Record<string, string>) {
  return {
    ...files,
    'dev-globals-trap.ts': devGlobalsTrap,
    'entry.ts': `export { devGlobalsTouched } from './dev-globals-trap'\n${files['entry.ts']}`,
  }
}

/**
 * Renders the route's component in the production page and returns what the
 * page touched of `devGlobals` and the page's global names.
 */
const renderScript = `await entry.mount(entry.Route.options.component)
return {
  touched: entry.devGlobalsTouched(),
  globals: Object.getOwnPropertyNames(globalThis),
}`

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
  const files = withDevGlobalsTrap(
    routeApp(route(framework), { env: 'client', framework }),
  )
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
  const run = await app.run(renderScript)
  expect(run.html, evidence).toContain('MARK_PAGE')
  const rendered = run.result as {
    touched: Array<string>
    globals: Array<string>
  }
  const controlRun = await control.run(renderScript)
  const controlRendered = controlRun.result as {
    touched: Array<string>
    globals: Array<string>
  }
  // The premise of the `__TSR_ROUTER__` trap (see `devGlobals`): the page
  // creates no router, so its own runtime touches none of them.
  expect(
    controlRendered.touched,
    "premise: the control's page (route HMR off) touches no development global: the page creates no router",
  ).toEqual([])
  const controlGlobals = new Set(controlRendered.globals)
  expect(
    Object.keys(publicDevApis).filter(
      (name) => app.where(publicDevApis[name]!) !== 'nowhere',
    ),
    `public development APIs the bundle references\n${evidence}`,
  ).toEqual([])
  expect(
    rendered.touched,
    `development globals the production page touched\n${evidence}`,
  ).toEqual([])
  expect(
    rendered.globals.filter((name) => !controlGlobals.has(name)),
    `globals the production page has and the control's page lacks\n${evidence}`,
  ).toEqual([])
  expect(
    (await app.run(routeExports)).result,
    `exports of the route module, the control's being ${JSON.stringify((await control.run(routeExports)).result)}\n${evidence}`,
  ).toEqual((await control.run(routeExports)).result)
}
