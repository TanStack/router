/**
 * Known router plugin bugs that only show on a running dev server, after
 * edits. Each pin asserts correct behaviour for a bug on main and is marked
 * .fails; remove .fails when the bug is fixed. Each pin has a control test
 * that runs the same harness on a case that works. The ones observed in a
 * real browser page: integration/known-bugs-dev-server.test.ts.
 */
import { describe, expect, test } from 'vitest'
import {
  expectExportedRouteOptions,
  expectSharedOverloads,
  exportedComponentsLostWhenSplit,
  rootRoute,
  routerDevServer,
} from './dev-server'
import { head } from './regression-helpers'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'

const timeout = 30_000

describe('route module exports with automatic code splitting', () => {
  // Controls: react-refresh-route-components.test.ts "route module exports
  // with React HMR and autoCodeSplitting" (same harness), where these cases
  // pass without automatic code splitting.

  // Bug: the code splitter moves a component the route module exports into
  // its chunk and drops its export: a class cannot be split ("Unexpected
  // splitNode type: ClassDeclaration") and loses its `export class`, and an
  // aliased export list (`export { component as View }`) is left without its
  // declaration (known-bugs-code-splitter.test.ts "class components" and "a
  // split component that an export alias reads renders from both").
  // Impact: in development, modules importing the export get `undefined`
  // (Vite SSR) or fail to load (browsers: "Export 'component' is not
  // defined"), and the route's component chunk fails to compile.
  // Source: #8504 react-refresh-route-components ("route module exports with
  // React HMR and autoCodeSplitting=true"), where they pass.
  test.fails.each(exportedComponentsLostWhenSplit)(
    'keep a $name component exported as the route option value',
    async ({ declaration, options, exported }) => {
      await expectExportedRouteOptions(
        `${head}${declaration}
export const Route = createFileRoute('/page')({ ${options} })`,
        exported,
        true,
      )
    },
    timeout,
  )

  // Bug: the overload signatures of a function that the route module and a
  // split loader share stay next to its import, and the alias loses the
  // binding (known-bugs-code-splitter.test.ts "an overloaded function the
  // route module and a split loader share keeps working").
  // Impact: in development, `helperAlias` is undefined (Vite SSR) or the
  // route module fails to load (browsers).
  // Source: #8504 react-refresh-route-components ("keep exported overloads
  // and their aliases that unsplit and split options call"), where it passes.
  test.fails(
    'keep exported overloads and their aliases that unsplit and split options call',
    async () => {
      await expectSharedOverloads(true)
    },
    timeout,
  )
})

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
  async function moveRoutesDirectory(edits: Record<string, string> = {}) {
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

  // Control for the pin below (same harness): the next route file edit
  // generates the route tree with the new configuration.
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

  // Bug: on a `tsr.config.json` edit, the generator plugin re-creates the
  // generator with the new configuration and returns without running it
  // (router-generator-plugin.ts `generate`).
  // Impact: a configuration change (routes directory, generated route tree,
  // route file options) is applied to the route tree only on the next route
  // file event, or never if none comes before a restart.
  // Source: gap DV3 (gaps/dev-hmr.md).
  test.fails(
    'a tsr.config.json edit generates the route tree with the new configuration',
    async () => {
      expect(await moveRoutesDirectory()).toBe('/about')
    },
    timeout,
  )
})
