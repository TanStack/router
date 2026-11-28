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
  .extend(
    'createApp',
    ({ appRoot }) =>
      (files: Record<string, string>) =>
        app.createApp(appRoot, files),
  )
  .extend(
    'appWithRoutes',
    ({ appRoot }) =>
      (files: Array<string>) =>
        app.appWithRoutes(appRoot, files),
  )
  .extend(
    'copyFixture',
    ({ appRoot }) =>
      (name: string) =>
        fixture.copyFixture(appRoot, name),
  )
  .extend(
    'evaluateModule',
    ({ appRoot, routeTreeHost }) =>
      (code: string, fileName?: string) =>
        tree.evaluateModule(routeTreeHost, appRoot, code, fileName),
  )
  .extend(
    'withRouteTree',
    ({ routeTreeHost }) =>
      <T>(
        treeFile: string,
        use: (loaded: LoadedRouteTree) => Promise<T> | T,
        client?: ClientPages,
      ) =>
        tree.withRouteTree(routeTreeHost, treeFile, use, client),
  )
  .extend(
    'routesOf',
    ({ routeTreeHost }) =>
      (treeFile: string) =>
        tree.routesOf(routeTreeHost, treeFile),
  )
  .extend(
    'urlsOf',
    ({ routeTreeHost }) =>
      (treeFile: string) =>
        tree.urlsOf(routeTreeHost, treeFile),
  )
  .extend(
    'matchesOf',
    ({ routeTreeHost }) =>
      (treeFile: string, pathname: string) =>
        tree.matchesOf(routeTreeHost, treeFile, pathname),
  )
  .extend(
    'observeRouteTree',
    ({ routeTreeHost }) =>
      (treeFile: string) =>
        tree.observeRouteTree(routeTreeHost, treeFile),
  )

/** The fixtures of this package's tests, for the helpers a file builds on them. */
export type Fixtures =
  typeof test extends TestAPI<infer Context> ? Context : never
