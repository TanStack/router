/**
 * The `test` of this package's tests: the shared fixtures
 * (`@tanstack/compiler-test-utils/test`) and the servers a test file's
 * loads share, one per framework, each started on the first load of its
 * apps and closed when the file ends:
 * - `routeTreeHost`: the Vite server that evaluates the route trees
 *   (route-tree.ts);
 * - `clientHost`: the Vite server that serves them to the browser page
 *   (consumer-client.ts).
 *
 * And the helpers most tests call, bound to the test's `appRoot` and the
 * file's `routeTreeHost` (app.ts, generator-fixture.ts, route-tree.ts).
 */
import { test as base } from '@tanstack/compiler-test-utils/test'
import * as app from './app'
import { createClientServer } from './consumer-client'
import * as fixture from './generator-fixture'
import * as tree from './route-tree'
import { createHost } from './route-tree'
import type { TestAPI } from 'vitest'
import type { ViteDevServer } from 'vite'
import type { ClientHost, ClientPages } from './consumer-client'
import type { Host, LoadedRouteTree, RouteTreeHost } from './route-tree'

export const test = base
  .extend(
    'routeTreeHost',
    { scope: 'file' },
    ({ fileRoot }, { onCleanup }): RouteTreeHost => {
      const hosts = new Map<string, Promise<Host>>()
      onCleanup(async () => {
        // (a host that failed to start failed its test, and has nothing to close)
        await Promise.all(
          [...hosts.values()].map((host) =>
            host.then(
              ({ server }) => server.close(),
              () => {},
            ),
          ),
        )
      })
      return (framework) => {
        if (!hosts.has(framework)) {
          hosts.set(framework, createHost(fileRoot, framework))
        }
        return hosts.get(framework)!
      }
    },
  )
  .extend(
    'clientHost',
    { scope: 'file' },
    ({ fileRoot }, { onCleanup }): ClientHost => {
      const servers = new Map<string, Promise<ViteDevServer>>()
      onCleanup(async () => {
        await Promise.all(
          [...servers.values()].map((server) =>
            server.then(
              (started) => started.close(),
              () => {},
            ),
          ),
        )
      })
      return (framework) => {
        if (!servers.has(framework)) {
          servers.set(framework, createClientServer(fileRoot, framework))
        }
        return servers.get(framework)!
      }
    },
  )
  // (one `extend` for the bound helpers: TypeScript before 5.9 loses the
  // context's types along a longer chain of `extend` calls)
  .extend<{
    createApp: Bound<typeof app.createApp>
    appWithRoutes: Bound<typeof app.appWithRoutes>
    copyFixture: Bound<typeof fixture.copyFixture>
    evaluateModule: (
      code: string,
      fileName?: string,
    ) => ReturnType<typeof tree.evaluateModule>
    withRouteTree: <T>(
      treeFile: string,
      use: (loaded: LoadedRouteTree) => Promise<T> | T,
      client?: ClientPages,
    ) => Promise<T>
    routesOf: Bound<typeof tree.routesOf>
    urlsOf: Bound<typeof tree.urlsOf>
    matchesOf: Bound<typeof tree.matchesOf>
    observeRouteTree: Bound<typeof tree.observeRouteTree>
  }>({
    createApp: ({ appRoot }, use) =>
      use((files) => app.createApp(appRoot, files)),
    appWithRoutes: ({ appRoot }, use) =>
      use((files) => app.appWithRoutes(appRoot, files)),
    copyFixture: ({ appRoot }, use) =>
      use((name) => fixture.copyFixture(appRoot, name)),
    evaluateModule: ({ appRoot, routeTreeHost }, use) =>
      use((code, fileName) =>
        tree.evaluateModule(routeTreeHost, appRoot, code, fileName),
      ),
    withRouteTree: ({ routeTreeHost }, use) =>
      use((treeFile, run, client) =>
        tree.withRouteTree(routeTreeHost, treeFile, run, client),
      ),
    routesOf: ({ routeTreeHost }, use) =>
      use((treeFile) => tree.routesOf(routeTreeHost, treeFile)),
    urlsOf: ({ routeTreeHost }, use) =>
      use((treeFile) => tree.urlsOf(routeTreeHost, treeFile)),
    matchesOf: ({ routeTreeHost }, use) =>
      use((treeFile, pathname) =>
        tree.matchesOf(routeTreeHost, treeFile, pathname),
      ),
    observeRouteTree: ({ routeTreeHost }, use) =>
      use((treeFile) => tree.observeRouteTree(routeTreeHost, treeFile)),
  })

/** A helper with its first parameter (the directory or the host) given. */
type Bound<TFunction> = TFunction extends (
  first: any,
  ...rest: infer A
) => infer R
  ? (...rest: A) => R
  : never

/** The fixtures of this package's tests, for the helpers a file builds on them. */
export type Fixtures =
  typeof test extends TestAPI<infer Context> ? Context : never
