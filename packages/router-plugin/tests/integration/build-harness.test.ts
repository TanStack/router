/**
 * Control tests of the router plugin's real-build harness (build-harness.ts):
 * with each bundler's router plugin, a split component loads lazily and
 * renders, and the plugin's console warnings are recorded. The harness core
 * has its own controls in `@tanstack/compiler-test-utils`.
 */
import { describe, expect, test } from 'vitest'
import {
  BuildError,
  bundlers,
} from '@tanstack/compiler-test-utils/build-harness'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { build, buildWithRsbuild, routeApp } from '../build-harness'
import { head } from '../regression-helpers'
import type {
  BuildResult,
  Bundler,
} from '@tanstack/compiler-test-utils/build-harness'

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
  return describeSplitRoute(
    await build({
      bundler,
      env,
      files: routeApp(splitRoute, { env, files: { 'heavy.ts': heavy } }),
    }),
    env,
  )
}

async function describeSplitRoute(app: BuildResult, env: 'ssr' | 'client') {
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

// Rsbuild with its production defaults and the router plugin of Rspack,
// as an Rsbuild app adds it.
test(
  'router plugin with Rsbuild loads a split component lazily and renders it (client)',
  async () => {
    const app = await buildWithRsbuild({
      files: routeApp(splitRoute, {
        env: 'client',
        files: { 'heavy.ts': heavy },
      }),
    })
    expect(await describeSplitRoute(app, 'client')).toEqual(
      splitRouteExpected.client,
    )
  },
  timeout,
)

// Bug: the esbuild adapter never runs the route generator in a build (its
// generator only initialises in `esbuild.config`; generation happens in
// `watchChange`), so the code splitter knows no route files and splits
// nothing. The code splitter's esbuild adapter also never initialises its
// config (no `esbuild` hook calls `initUserConfig`), so it would throw once
// it saw a route file.
// Splitting, or refusing clearly (a build error naming esbuild and
// `autoCodeSplitting`), are both valid fixes (decision D3 (c), SPEC J2.18);
// a warning on a successful unsplit build is not a refusal.
// Impact: `tanstackRouter({ autoCodeSplitting: true })` with esbuild bundles
// every route component into the entry, without telling the user.
test.fails.each(['ssr', 'client'] as const)(
  'router plugin with esbuild loads a split component lazily and renders it, or refuses naming esbuild and the option (%s)',
  async (env) => {
    let app: BuildResult
    try {
      app = await build({
        bundler: 'esbuild',
        env,
        files: routeApp(splitRoute, { env, files: { 'heavy.ts': heavy } }),
      })
    } catch (error) {
      if (!(error instanceof BuildError)) {
        throw error
      }
      expectDiagnostic(error, { names: ['esbuild', 'autoCodeSplitting'] })
      return
    }
    expect(await describeSplitRoute(app, env)).toEqual(splitRouteExpected[env])
  },
  timeout,
)
