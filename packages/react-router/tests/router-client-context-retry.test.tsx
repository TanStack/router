import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { hydrate } from '@tanstack/router-core/ssr/client'
import { dehydrateSsrMatchId } from '../../router-core/src/ssr/ssr-match-id'
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
  delete window.$_TSR
})

test('a RouterProvider mounted after router hydration never renders transported success after client context reconstruction fails', async () => {
  const serverRootRoute = createRootRoute({ component: Outlet })
  const serverPageRoute = createRoute({
    getParentRoute: () => serverRootRoute,
    path: '/page',
    context: () => ({ clientReady: true }),
    component: () => <div>Server page</div>,
  })
  const serverRouter = createRouter({
    routeTree: serverRootRoute.addChildren([serverPageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
  })
  serverRouter.isServer = true
  await serverRouter.load()
  const serverMatches = serverRouter.stores.matches.get()
  expect(serverMatches.at(-1)).toMatchObject({ status: 'success' })

  const contextError = new Error('Client context failed')
  const pageRenders = vi.fn()
  const clientRootRoute = createRootRoute({ component: Outlet })
  const clientPageRoute = createRoute({
    getParentRoute: () => clientRootRoute,
    path: '/page',
    context: () => {
      throw contextError
    },
    component: () => {
      const context = clientRouter.state.matches.at(-1)?.context
      pageRenders(context)
      return context?.clientReady ? (
        <div>Client page</div>
      ) : (
        <div>Missing client context</div>
      )
    },
    errorComponent: ({ error }) => <div>{error.message}</div>,
  })
  const clientRouter = createRouter({
    routeTree: clientRootRoute.addChildren([clientPageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
  })
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
  render(<RouterProvider router={clientRouter} />)

  expect(await screen.findByText(contextError.message)).toBeInTheDocument()
  expect(screen.queryByText('Missing client context')).not.toBeInTheDocument()
  expect(screen.queryByText('Client page')).not.toBeInTheDocument()
  expect(pageRenders).not.toHaveBeenCalled()
})
