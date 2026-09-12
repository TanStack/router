import { afterEach, describe, expect, test, vi } from 'vitest'
import * as Solid from 'solid-js'
import { hydrate as solidHydrate } from 'solid-js/web'
import { hydrate as hydrateRouter } from '@tanstack/router-core/ssr/client'
import { dehydrateSsrMatchId } from '../../router-core/src/ssr/ssr-match-id'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useLinkProps,
} from '../src'
import type { AnyRouteMatch } from '@tanstack/router-core'
import type { TsrSsrGlobal } from '@tanstack/router-core/ssr/client'

afterEach(() => {
  vi.restoreAllMocks()
  window.$_TSR = undefined
  delete (globalThis as any)._$HY
  document.body.innerHTML = ''
})

function bootstrap(matches: Array<AnyRouteMatch>): void {
  window.$_TSR = {
    router: {
      manifest: undefined,
      matches: matches.map((match) => ({
        i: dehydrateSsrMatchId(match.id),
        s: 'success' as const,
        ssr: true as const,
        u: Date.now(),
      })),
    },
    h: vi.fn(),
    e: vi.fn(),
    c: vi.fn(),
    p: vi.fn(),
    buffer: [],
  } as unknown as TsrSsrGlobal
}

describe('issue #8233: link active state during hydration', () => {
  test('resolves against the location the server rendered with', async () => {
    // Solid runs a component body once, so this is the hydrating render.
    let hydratingRender: {
      hydrating: boolean
      home: string | null
      about: string | null
    }
    let read: () => { home: string | null; about: string | null }

    function Links() {
      const home = useLinkProps({ to: '/' }) as Record<string, string>
      const about = useLinkProps({ to: '/about' }) as Record<string, string>
      read = () => ({
        home: home['data-status'] ?? null,
        about: about['data-status'] ?? null,
      })
      hydratingRender = {
        hydrating: Solid.sharedConfig.context !== undefined,
        ...read(),
      }
      return null
    }

    const rootRoute = createRootRoute({ component: Outlet })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: Links,
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      component: () => null,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, aboutRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    bootstrap(router.matchRoutes(router.state.location))
    await hydrateRouter(router)

    // What `loadClientRoute` publishes synchronously when a shell link is
    // clicked while this boundary has not hydrated yet.
    const pending = router.buildLocation({ to: '/about' })
    router.batch(() => {
      router.stores.status.set('pending')
      router.stores.location.set(pending as any)
    })

    // What `generateHydrationScript()` installs in a real app.
    ;(globalThis as any)._$HY = {
      events: [],
      completed: new WeakSet(),
      r: {},
      fe() {},
      done: false,
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    solidHydrate(() => <RouterProvider router={router} />, container)
    await new Promise((resolve) => setTimeout(resolve, 0))

    // The hydrating render has to reproduce the server output: `/` was the
    // rendered location, so the home link is active and the about link is not.
    expect(hydratingRender!).toEqual({
      hydrating: true,
      home: 'active',
      about: null,
    })

    // Once hydrated, the live (pending) location takes over.
    expect(read!()).toEqual({ home: null, about: 'active' })
  })
})
