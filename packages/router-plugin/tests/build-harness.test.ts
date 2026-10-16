/**
 * Control tests of the router plugin's real-build harness (build-harness.ts):
 * with each bundler's router plugin, a split component loads lazily and
 * renders, and the plugin's console warnings are recorded. The harness core
 * has its own controls in `@tanstack/compiler-test-utils`.
 */
import { describe, expect, test } from 'vitest'
import { bundlers } from '@tanstack/compiler-test-utils/build-harness'
import { build, routeApp } from './build-harness'
import { head } from './regression-helpers'
import type { Bundler } from '@tanstack/compiler-test-utils/build-harness'

const timeout = 60_000

const splitRoute = `${head}import { heavy } from '../heavy'
function Page() {
  return <p>{heavy('MARK_COMPONENT')}</p>
}
export const Route = createFileRoute('/')({
  staticData: { label: 'MARK_ROUTE' },
  component: Page,
})
`
const heavy = `export function heavy(label: string) {
  return label
}
`

async function buildSplitRoute(bundler: Bundler, env: 'ssr' | 'client') {
  const app = await build({
    bundler,
    env,
    files: routeApp(splitRoute, { env, files: { 'heavy.ts': heavy } }),
  })
  const placement = {
    route: app.where('MARK_ROUTE'),
    component: app.where('MARK_COMPONENT'),
  }
  const run = await app.run(
    env === 'ssr'
      ? `return await entry.render(entry.Route.options.component)`
      : `await entry.mount(entry.Route.options.component)`,
  )
  return {
    placement,
    rendered: env === 'ssr' ? run.result : run.html,
  }
}

const splitRouteExpected = {
  ssr: {
    placement: { route: 'eager', component: 'lazy' },
    rendered: '<p>MARK_COMPONENT</p>',
  },
  client: {
    placement: { route: 'eager', component: 'lazy' },
    rendered: '<div id="root"><p>MARK_COMPONENT</p></div>',
  },
}

describe.each(bundlers.filter((bundler) => bundler !== 'esbuild'))(
  'router plugin with %s',
  (bundler) => {
    test.each(['ssr', 'client'] as const)(
      'loads a split component lazily and renders it (%s)',
      async (env) => {
        expect(await buildSplitRoute(bundler, env)).toEqual(
          splitRouteExpected[env],
        )
      },
      timeout,
    )

    // The router plugin reports what it cannot split with `console.warn`;
    // here a plugin option the build calls warns.
    test('records console warnings of the build', async () => {
      const app = await build({
        bundler,
        pluginOptions: {
          codeSplittingOptions: {
            splitBehavior: ({ routeId }) => {
              console.warn(`MARK_BUILD_WARNING ${routeId}`)
              return undefined
            },
          },
        },
        files: routeApp(`${head}export const Route = createFileRoute('/')({
  component: () => <p>page</p>,
})
`),
      })
      expect(app.consoleMessages).toContainEqual(
        expect.stringContaining('MARK_BUILD_WARNING /'),
      )
    })
  },
)

// Bug: the esbuild adapter never runs the route generator in a build (its
// generator only initialises in `esbuild.config`; generation happens in
// `watchChange`), so the code splitter knows no route files and splits
// nothing. The code splitter's esbuild adapter also never initialises its
// config (no `esbuild` hook calls `initUserConfig`), so it would throw once
// it saw a route file.
// Impact: `tanstackRouter({ autoCodeSplitting: true })` with esbuild bundles
// every route component into the entry, without telling the user.
test.fails.each(['ssr', 'client'] as const)(
  'router plugin with esbuild loads a split component lazily and renders it (%s)',
  async (env) => {
    expect(await buildSplitRoute('esbuild', env)).toEqual(
      splitRouteExpected[env],
    )
  },
  timeout,
)
