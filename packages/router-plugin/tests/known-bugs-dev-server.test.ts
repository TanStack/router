/**
 * Known router plugin bugs that only show on a running dev server, after
 * edits. Each test asserts the correct behaviour for a bug main had, which
 * today's compiler fixes (a regression test, oracle/KNOWN-BUGS.md). Each has
 * a control test that runs the same harness on a case that works. The ones
 * observed in a real browser page: integration/known-bugs-dev-server.test.ts.
 */
import { describe, expect, test } from 'vitest'
import { rootRoute, routerDevServer } from './dev-server'
import { head } from './route-app'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'

const timeout = 30_000

describe('router config file', () => {
  /** `tsr.config.json` with the harness's plugin options. */
  const config = (routesDirectory: string) =>
    JSON.stringify({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory,
      generatedRouteTree: './routeTree.gen.ts',
    })

  const route = (
    path: string,
  ) => `${head}export const Route = createFileRoute('${path}')({})
`

  /**
   * The route the app's generated route tree (`routeTree.gen.ts`) matches
   * at `pathname`: the real router over the tree, in the dev server's SSR
   * environment, after `router.load()`.
   */
  async function matchedRoute(server: DevServer, pathname: string) {
    const { routeTree } = await server.import('/routeTree.gen.ts')
    const { createMemoryHistory, createRouter } = await server.import(
      '@tanstack/react-router',
    )
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [pathname] }),
    })
    await router.load()
    return router.state.matches.at(-1)?.fullPath
  }

  /**
   * Starts with `tsr.config.json` reading the routes from `routes/`, then
   * points it to `pages/`, with `edits`. Returns the route the route tree
   * matches at `/about` afterwards (none before: `/about` is in `pages/`).
   */
  async function moveRoutesDirectory(edits: Record<string, string>) {
    const server = await routerDevServer({
      pluginOptions: null,
      files: {
        'tsr.config.json': config('./routes'),
        'routes/index.tsx': route('/'),
        'pages/__root.tsx': rootRoute,
        'pages/about.tsx': route('/about'),
      },
    })
    expect(await matchedRoute(server, '/about')).not.toBe('/about')
    await server.edit({ 'tsr.config.json': config('./pages') })
    await server.edit(edits)
    return matchedRoute(server, '/about')
  }

  // The next route file edit generates the route tree with the new
  // configuration. (Whether the `tsr.config.json` edit itself regenerates
  // it is free: SPEC J1.10.)
  test(
    'a route file edit after a tsr.config.json edit generates the route tree with the new configuration',
    async () => {
      expect(
        await moveRoutesDirectory({
          'pages/about.tsx': route('/about') + '\n',
        }),
      ).toBe('/about')
    },
    timeout,
  )
})
