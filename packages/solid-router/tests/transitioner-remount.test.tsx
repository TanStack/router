import { cleanup, render, screen, waitFor } from '@solidjs/testing-library'
import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { hydrate } from '@tanstack/router-core/ssr/client'
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import type { TsrSsrGlobal } from '@tanstack/router-core/ssr/client'

afterEach(() => {
  cleanup()
  delete window.$_TSR
})

test('remounting a hydrated router loads a history change that happened while unmounted', async () => {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Index</div>,
  })
  const nextRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/next',
    component: () => <div>Next</div>,
  })
  const history = createMemoryHistory({ initialEntries: ['/'] })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, nextRoute]),
    history,
  })

  const matches = router.matchRoutes(router.latestLocation)
  window.$_TSR = {
    router: {
      manifest: { routes: {} },
      matches: matches.map((match) => ({
        i: match.id,
        s: 'success' as const,
        ssr: true,
        u: Date.now(),
      })),
    },
    h: vi.fn(),
    e: vi.fn(),
    c: vi.fn(),
    p: vi.fn(),
    buffer: [],
  } satisfies TsrSsrGlobal
  await hydrate(router)
  expect(router.ssr).toBeDefined()

  const firstRender = render(() => <RouterProvider router={router} />)
  expect(await screen.findByText('Index')).toBeInTheDocument()

  firstRender.unmount()
  history.push('/next')

  const secondRender = render(() => <RouterProvider router={router} />)
  expect(await screen.findByText('Next')).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/next')

  secondRender.unmount()
  history.replace('/next', { remounted: true })

  render(() => <RouterProvider router={router} />)
  await waitFor(() => {
    expect((router.state.location.state as any).remounted).toBe(true)
  })
  expect(screen.getByText('Next')).toBeInTheDocument()
})

test('remounting the provider emits onRendered for the newly mounted DOM', async () => {
  let mountLabel = 'First mount'
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div data-testid="index-route">{mountLabel}</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const renderedDom: Array<string | null> = []
  const unsubscribe = router.subscribe('onRendered', () => {
    renderedDom.push(screen.queryByTestId('index-route')?.textContent ?? null)
  })

  try {
    const firstRender = render(() => <RouterProvider router={router} />)
    expect(await screen.findByText('First mount')).toBeInTheDocument()
    await waitFor(() => expect(renderedDom).toEqual(['First mount']))

    firstRender.unmount()
    mountLabel = 'Second mount'
    render(() => <RouterProvider router={router} />)
    expect(await screen.findByText('Second mount')).toBeInTheDocument()
    await waitFor(() =>
      expect(renderedDom).toEqual(['First mount', 'Second mount']),
    )
  } finally {
    unsubscribe()
  }
})
