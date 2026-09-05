import * as React from 'react'
import { act, waitFor } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { dehydrateSsrMatchId } from '../../router-core/src/ssr/ssr-match-id'
import { hydrate } from '../src/ssr/client'
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useCanGoBack,
} from '../src'
import type { TsrSsrGlobal } from '../src/ssr/client'

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

function makeRouteTree() {
  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <h1>Page one</h1>,
  })
  const aboutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/about',
    component: function AboutComponent() {
      const canGoBack = useCanGoBack()
      return (
        <div data-testid="can-go-back">
          {canGoBack ? 'can go back' : 'cannot go back'}
        </div>
      )
    },
  })
  return rootRoute.addChildren([indexRoute, aboutRoute])
}

describe('useCanGoBack during hydration', () => {
  test('does not report a hydration mismatch when the browser has history behind the entry', async () => {
    // The server builds a fresh single entry history per request, so it can
    // never know how deep the browser's history is.
    const serverRouter = createRouter({
      routeTree: makeRouteTree(),
      history: createMemoryHistory({ initialEntries: ['/about'] }),
    })
    serverRouter.isServer = true
    await serverRouter.load()
    const serverMatches = serverRouter.stores.matches.get()
    const serverHtml = renderToString(<RouterProvider router={serverRouter} />)
    expect(serverHtml).toContain('cannot go back')

    // The browser preserves history.state across a reload, so the client
    // router starts on an entry whose __TSR_index is already 1.
    const clientRouter = createRouter({
      routeTree: makeRouteTree(),
      history: createMemoryHistory({ initialEntries: ['/', '/about'] }),
    })
    expect(clientRouter.stores.location.get().state.__TSR_index).toBe(1)

    window.$_TSR = {
      router: {
        manifest: { routes: {} },
        dehydratedData: {},
        matches: serverMatches.map((match) => ({
          i: dehydrateSsrMatchId(match.id),
          u: match.updatedAt,
          s: match.status,
          l: match.loaderData,
          e: match.error,
          ssr: match.ssr,
        })),
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    }

    await hydrate(clientRouter)

    const container = document.createElement('div')
    container.innerHTML = serverHtml
    document.body.appendChild(container)

    const recoverableHydrationErrors: Array<Error> = []
    let root!: ReturnType<typeof hydrateRoot>
    await act(async () => {
      root = hydrateRoot(container, <RouterProvider router={clientRouter} />, {
        onRecoverableError: (error) => {
          const messages = [
            error instanceof Error ? error.message : String(error),
            error instanceof Error && error.cause instanceof Error
              ? error.cause.message
              : '',
          ]
          if (
            messages.some((message) =>
              /hydration (?:failed|mismatch)|server rendered HTML.*client|server rendered text/i.test(
                message,
              ),
            )
          ) {
            recoverableHydrationErrors.push(error as Error)
            return
          }
          throw error
        },
      })
      testCleanups.push(async () => {
        await act(() => root.unmount())
      })
      await Promise.resolve()
    })

    expect(recoverableHydrationErrors).toHaveLength(0)

    // Once hydration has settled the hook reports the real browser history.
    await waitFor(() => {
      expect(container).toHaveTextContent('can go back')
    })
  })
})
