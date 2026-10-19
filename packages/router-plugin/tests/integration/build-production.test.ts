/**
 * Production client bundles carry nothing of the dev server's additions
 * (route HMR, React Refresh support), per bundler and framework (SPEC G7).
 * The build decides production by its own signal (the bundler's production
 * mode), with `NODE_ENV` unset, and the plugin's default for `addHmr`.
 *
 * Two oracles, neither tied to how our own support code is named:
 * - the public hot APIs and the React Refresh runtime's globals are absent;
 * - a build with route HMR off (`addHmr: false`, `NODE_ENV=production` when
 *   the plugin is created) is the control: the production bundle reads and
 *   declares the same identifiers, so it holds no extra support code,
 *   whatever it is called. (React only: the frameworks the plugin adds
 *   Refresh support for; the other frameworks get no such support.)
 */
import { describe, expect, test } from 'vitest'
import {
  build,
  buildWithRsbuild,
  frameworks,
  routeApp,
  routeHead,
} from '../build-harness'
import type {
  BuildResult,
  Bundler,
} from '@tanstack/compiler-test-utils/build-harness'
import type { Framework } from '../build-harness'

const timeout = 120_000

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
 * The identifier-like tokens of a bundle, each once, sorted: two builds of
 * the same code read and declare the same names; support code added to one
 * of them shows as names the other lacks, whatever they are called.
 */
function identifierTokens(app: BuildResult) {
  const tokens = new Set<string>()
  for (const chunk of app.chunks) {
    for (const match of chunk.code.matchAll(/[A-Za-z_$][\w$]*/g)) {
      tokens.add(match[0])
    }
  }
  return [...tokens].sort()
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
async function expectProductionClientBundle(
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
  if (framework === 'react') {
    const control = await productionBuild(
      bundler,
      framework,
      autoCodeSplitting,
      true,
    )
    expect(identifierTokens(app)).toEqual(identifierTokens(control))
  }
}

describe.each(['vite', 'rspack', 'webpack'] as const)('%s', (bundler) => {
  test.each(frameworks)(
    'a production %s client bundle has no dev-only code',
    async (framework) => {
      await expectProductionClientBundle(bundler, framework, true)
    },
    timeout,
  )
})

// Rsbuild with its production defaults (React apps), the router plugin of
// Rspack added as an Rsbuild app adds it.
test.each([true, false])(
  'a production react client bundle (autoCodeSplitting: %s) has no dev-only code (rsbuild)',
  async (autoCodeSplitting) => {
    await expectProductionClientBundle('rsbuild', 'react', autoCodeSplitting)
  },
  timeout,
)

test.each(['solid', 'vue'] as const)(
  'a production %s client bundle without code splitting has no dev-only code (vite)',
  async (framework) => {
    await expectProductionClientBundle('vite', framework, false)
  },
  timeout,
)

// Bug: same root cause as the pins below, on Vite: the route HMR plugin has
// no `apply: 'serve'` and follows `NODE_ENV` at plugin creation. Vite drops
// the code `import.meta.hot` guards, but not the React Refresh anchor export
// the HMR compile adds to every React route. The Vite CLI sets `NODE_ENV`
// before loading the config; Vite's JavaScript API (`build({ plugins:
// [tanstackRouter(...)] })` from a script without `NODE_ENV`) does not.
// Source: router-composed-plugin.ts (`isProduction` from `NODE_ENV`),
// router-hmr-plugin.ts (no `apply`).
// Impact: production bundles built through Vite's API keep the refresh
// anchor of every React route.
test.fails(
  'a production react client bundle without code splitting has no dev-only code (vite)',
  async () => {
    await expectProductionClientBundle('vite', 'react', false)
  },
  timeout,
)

// Bug: with automatic code splitting off, the composed router plugin adds
// the route HMR plugin unless `NODE_ENV` is `production` when the plugin is
// created (`router-composed-plugin.ts`), instead of following the bundler's
// mode; webpack and Rspack set `NODE_ENV` only inside the bundle. Same root
// cause as the React pin in known-bugs-route-hmr.test.ts, for every
// framework.
// Source: gap CC-P1 / M3.
// Impact: webpack/Rspack production bundles built from a shell without
// `NODE_ENV` ship the route HMR code of every route.
describe.each(['rspack', 'webpack'] as const)('%s', (bundler) => {
  test.fails.each(frameworks)(
    'a production %s client bundle without code splitting has no dev-only code',
    async (framework) => {
      await expectProductionClientBundle(bundler, framework, false)
    },
    timeout,
  )
})
