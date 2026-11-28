/**
 * The `test` of this package's tests: the shared fixtures
 * (`@tanstack/compiler-test-utils/test`) and the servers a test file's
 * loads share, one per framework, each started on the first load of its
 * apps and closed when the file ends:
 * - `routeTreeHost`: the Vite server that evaluates the route trees
 *   (route-tree.ts);
 * - `clientHost`: the Vite server that serves them to the browser page
 *   (consumer-client.ts).
 */
import { test as base } from '@tanstack/compiler-test-utils/test'
import { createClientServer } from './consumer-client'
import { createHost } from './route-tree'
import type { ViteDevServer } from 'vite'
import type { ClientHost } from './consumer-client'
import type { Host, RouteTreeHost } from './route-tree'

export const test = base
  .extend(
    'routeTreeHost',
    { scope: 'file' },
    ({ fileRoot }, { onCleanup }): RouteTreeHost => {
      const hosts = new Map<string, Promise<Host>>()
      onCleanup(async () => {
        await Promise.all(
          [...hosts.values()].map(async (host) => (await host).server.close()),
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
          [...servers.values()].map(async (server) => (await server).close()),
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
