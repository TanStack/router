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
 * features only. The production bundle renders the route in a real browser
 * and is the control's output, chunk for chunk: whatever it ships beyond
 * the control serves development.
 */
import { expect } from 'vitest'
import { build, buildWithRsbuild, routeApp, routeHead } from './build-harness'
import type {
  BuildResult,
  Bundler,
} from '@tanstack/compiler-test-utils/build-harness'
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

/** The emitted chunks, by file name. */
function output(result: BuildResult) {
  return Object.fromEntries(
    result.chunks.map((chunk) => [chunk.fileName, chunk.code]),
  )
}

/**
 * Builds the route for production and asserts that the bundle renders the
 * route and equals the control's (see the module comment).
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
  const run = await app.run('await entry.mount(entry.Route.options.component)')
  expect(run.html).toContain('MARK_PAGE')
  expect(output(app)).toEqual(output(control))
}
