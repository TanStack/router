import * as Vue from 'vue'
import { renderToString } from 'vue/server-renderer'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createControlledPromise } from '@tanstack/router-core'
import { hydrate as hydrateRouter } from '@tanstack/router-core/ssr/client'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
} from '../src'
import type { TsrSsrGlobal } from '@tanstack/router-core/ssr/client'

declare global {
  interface Window {
    $_TSR?: TsrSsrGlobal
  }
}

const testCleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  while (testCleanups.length) {
    await testCleanups.pop()!()
  }
  vi.restoreAllMocks()
  window.$_TSR = undefined
  document.body.innerHTML = ''
})

describe('hydrating a server-capped boundary lane', () => {
  test.each([
    ['error', 'parent'],
    ['notFound', 'root'],
  ] as const)(
    'keeps the server-rendered %s %s boundary visible while the client replays it',
    async (outcome, boundary) => {
      const childLoader = vi.fn(() => 'child data')
      const makeRouteTree = (
        head?: () => Record<string, never> | Promise<Record<string, never>>,
      ) => {
        const boundaryOptions = {
          beforeLoad: () => {
            throw outcome === 'notFound'
              ? notFound()
              : new Error('server route failure')
          },
          head,
          pendingComponent: () => (
            <div data-testid="boundary-pending">Boundary pending</div>
          ),
          errorComponent: () => (
            <div data-testid="boundary-error">Boundary error</div>
          ),
          notFoundComponent: () => (
            <div data-testid="boundary-not-found">Boundary not found</div>
          ),
        }
        const rootRoute = createRootRoute({
          component: Outlet,
          ...(boundary === 'root' ? boundaryOptions : {}),
        })
        const parentRoute = createRoute({
          getParentRoute: () => rootRoute,
          path: '/parent',
          component: Outlet,
          ...(boundary === 'parent' ? boundaryOptions : {}),
        })
        const childRoute = createRoute({
          getParentRoute: () => parentRoute,
          path: '/child',
          loader: childLoader,
          component: () => <div>Child</div>,
        })
        return rootRoute.addChildren([parentRoute.addChildren([childRoute])])
      }

      const serverRouter = createRouter({
        routeTree: makeRouteTree(),
        ...(boundary === 'root' ? { isShell: true } : {}),
        history: createMemoryHistory({
          initialEntries: ['/parent/child'],
        }),
      })
      serverRouter.isServer = true
      await serverRouter.load()

      const serverMatches = serverRouter.stores.matches.get()
      expect(serverMatches).toHaveLength(boundary === 'root' ? 1 : 2)
      expect(serverMatches.at(-1)).toMatchObject(
        boundary === 'root'
          ? { status: 'success', globalNotFound: true }
          : { status: 'error' },
      )

      const serverApp = Vue.createSSRApp(
        Vue.defineComponent({
          setup: () => () => <RouterProvider router={serverRouter} />,
        }),
      )
      const serverHtml = await renderToString(serverApp)
      const expectedBoundary =
        outcome === 'notFound' ? 'Boundary not found' : 'Boundary error'
      expect(serverHtml).toContain(expectedBoundary)

      // Keep route-asset projection from the follow-up replay pending so the
      // first hydrated frame cannot race the replay's final commit.
      const replayAssets = createControlledPromise<Record<string, never>>()
      const clientHead = vi
        .fn<() => Record<string, never> | Promise<Record<string, never>>>()
        .mockReturnValueOnce({})
        .mockReturnValueOnce(replayAssets)
      const clientRouter = createRouter({
        routeTree: makeRouteTree(clientHead),
        history: createMemoryHistory({
          initialEntries: ['/parent/child'],
        }),
      })

      window.$_TSR = {
        router: {
          manifest: { routes: {} },
          dehydratedData: {},
          lastMatchId: serverMatches.at(-1)!.id,
          matches: serverMatches.map((match) => ({
            i: match.id,
            u: match.updatedAt,
            s: match.status,
            l: match.loaderData,
            e: match.error,
            ssr: match.ssr,
            ...(match.globalNotFound ? { g: true } : {}),
          })),
        },
        h: vi.fn(),
        e: vi.fn(),
        c: vi.fn(),
        p: vi.fn(),
        buffer: [],
        initialized: false,
      }

      await hydrateRouter(clientRouter)
      await vi.waitFor(() => {
        expect(clientHead).toHaveBeenCalledTimes(2)
        expect(clientRouter.stores.isLoading.get()).toBe(true)
      })

      const container = document.createElement('div')
      container.innerHTML = serverHtml
      document.body.appendChild(container)
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const clientApp = Vue.createSSRApp(
        Vue.defineComponent({
          setup: () => () => <RouterProvider router={clientRouter} />,
        }),
      )
      testCleanups.push(async () => {
        clientApp.unmount()
        replayAssets.resolve({})
        await clientRouter.latestLoadPromise
      })

      clientApp.mount(container)
      await Vue.nextTick()

      expect(container).toHaveTextContent(expectedBoundary)
      expect(container).not.toHaveTextContent('Boundary pending')
      expect(
        [consoleError.mock.calls, consoleWarn.mock.calls].flat(2).join(' '),
      ).not.toMatch(/hydration|mismatch/i)
      expect(childLoader).not.toHaveBeenCalled()
    },
  )
})
