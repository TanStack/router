import * as Vue from 'vue'
import { renderToString } from 'vue/server-renderer'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { hydrate as hydrateRouter } from '@tanstack/router-core/ssr/client'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import { dehydrateToBootstrap } from './ssr-test-utils'
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

function status(container: Element, testId: string) {
  return (
    container
      .querySelector(`[data-testid="${testId}"]`)
      ?.getAttribute('data-status') ?? null
  )
}

describe('issue #8233: link active state during hydration', () => {
  test('resolves against the location the server rendered with', async () => {
    const makeRouteTree = () => {
      const rootRoute = createRootRoute({ component: Outlet })
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => (
          <p>
            <Link to="/" data-testid="home">
              Home
            </Link>
            <Link to="/about" data-testid="about">
              About
            </Link>
          </p>
        ),
      })
      const aboutRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/about',
        component: () => <div>About</div>,
      })
      return rootRoute.addChildren([indexRoute, aboutRoute])
    }

    const serverRouter = createRouter({
      routeTree: makeRouteTree(),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    serverRouter.isServer = true
    testCleanups.push(() => serverRouter.serverSsr?.cleanup())
    window.$_TSR = await dehydrateToBootstrap(serverRouter)

    const serverHtml = await renderToString(
      Vue.createSSRApp(
        Vue.defineComponent({
          setup: () => () => <RouterProvider router={serverRouter} />,
        }),
      ),
    )

    const clientRouter = createRouter({
      routeTree: makeRouteTree(),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await hydrateRouter(clientRouter)

    // What `loadClientRoute` publishes synchronously when a shell link is
    // clicked while this boundary has not hydrated yet.
    const pending = clientRouter.buildLocation({ to: '/about' })
    clientRouter.batch(() => {
      clientRouter.stores.status.set('pending')
      clientRouter.stores.location.set(pending as any)
    })

    const container = document.createElement('div')
    container.innerHTML = serverHtml
    document.body.appendChild(container)

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const clientApp = Vue.createSSRApp(
      Vue.defineComponent({
        setup: () => () => <RouterProvider router={clientRouter} />,
      }),
    )
    clientApp.mount(container)
    testCleanups.push(() => {
      clientApp.unmount()
      container.remove()
    })

    // The hydrating render has to reproduce the server output: `/` was the
    // rendered location, so the home link is active and the about link is not.
    expect(status(container, 'home')).toBe('active')
    expect(status(container, 'about')).toBe(null)
    expect(
      [consoleError.mock.calls, consoleWarn.mock.calls].flat(2).join(' '),
    ).not.toMatch(/hydration|mismatch/i)

    // Once hydrated, the live (pending) location takes over.
    await Vue.nextTick()
    expect(status(container, 'home')).toBe(null)
    expect(status(container, 'about')).toBe('active')
  })
})
