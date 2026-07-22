import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { createMemoryHistory } from '@tanstack/history'
import { Store } from '@tanstack/store'
import {
  Outlet,
  RouterContextProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useBlocker,
  useLoaderData,
  useLocation,
  useMatchRoute,
  useSearch,
} from '../src'
import {
  Matches,
  RouterStateSnapshotProvider,
  createRouterStateSnapshotStore,
} from '../src/native'
import type { RouterState } from '@tanstack/router-core'

afterEach(cleanup)

function cloneState(state: RouterState<any>): RouterState<any> {
  return {
    ...state,
    location: {
      ...state.location,
      state: { ...state.location.state },
    },
    resolvedLocation: state.resolvedLocation
      ? {
          ...state.resolvedLocation,
          state: { ...state.resolvedLocation.state },
        }
      : undefined,
    matches: state.matches.map((match) => ({ ...match })),
  }
}

const rootRoute = createRootRoute({
  component: () => (
    <section data-testid="layout">
      <Outlet />
    </section>
  ),
})

function Home() {
  const location = useLocation()
  const search = useSearch({ from: '/home' })
  const loaderData = useLoaderData({ from: '/home' })
  const matchRoute = useMatchRoute()

  return (
    <div data-testid="home-screen">
      {location.pathname}:{search.page}:{loaderData}:
      {String(Boolean(matchRoute({ to: '/details' })))}
    </div>
  )
}

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/home',
  validateSearch: (search) => ({ page: Number(search.page ?? 1) }),
  loader: () => 'home-loader',
  component: Home,
})

function Details() {
  const location = useLocation()
  const search = useSearch({ from: '/details' })
  const matchRoute = useMatchRoute()

  return (
    <div data-testid="details-screen">
      {location.pathname}:{search.source}:
      {String(Boolean(matchRoute({ to: '/details' })))}
    </div>
  )
}

const detailsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/details',
  validateSearch: (search) => ({ source: String(search.source ?? '') }),
  component: Details,
})

test('renders complete, independent match trees for native screens', async () => {
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, detailsRoute]),
    history: createMemoryHistory({ initialEntries: ['/home?page=2'] }),
  })
  await router.load()

  const homeStore = createRouterStateSnapshotStore(cloneState(router.state))

  await router.navigate({
    to: '/details',
    search: { source: 'push' },
  })
  const detailsStore = createRouterStateSnapshotStore(cloneState(router.state))

  render(
    <RouterContextProvider router={router}>
      <RouterStateSnapshotProvider router={router} store={homeStore}>
        <Matches includeTransitioner={false} />
      </RouterStateSnapshotProvider>
      <RouterStateSnapshotProvider router={router} store={detailsStore}>
        <Matches includeTransitioner={false} />
      </RouterStateSnapshotProvider>
    </RouterContextProvider>,
  )

  expect(screen.getByTestId('home-screen')).toHaveTextContent(
    '/home:2:home-loader:false',
  )
  expect(screen.getByTestId('details-screen')).toHaveTextContent(
    '/details:push:true',
  )
  expect(screen.getAllByTestId('layout')).toHaveLength(2)
})

test('only an active native snapshot registers route blockers', async () => {
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, detailsRoute]),
    history: createMemoryHistory({ initialEntries: ['/home'] }),
  })
  await router.load()

  const store = createRouterStateSnapshotStore(cloneState(router.state))
  const activeStore = new Store(false)
  const unblock = vi.fn()
  const block = vi
    .spyOn(router.history, 'block')
    .mockImplementation(() => unblock)

  function BlockingScreen() {
    useBlocker({ shouldBlockFn: () => true })
    return null
  }

  render(
    <RouterContextProvider router={router}>
      <RouterStateSnapshotProvider
        router={router}
        store={store}
        activeStore={activeStore}
      >
        <BlockingScreen />
      </RouterStateSnapshotProvider>
    </RouterContextProvider>,
  )

  expect(block).not.toHaveBeenCalled()

  act(() => activeStore.setState(() => true))
  expect(block).toHaveBeenCalledOnce()

  act(() => activeStore.setState(() => false))
  expect(unblock).toHaveBeenCalledOnce()
})

test('only the active native snapshot emits onRendered', async () => {
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, detailsRoute]),
    history: createMemoryHistory({ initialEntries: ['/home'] }),
  })
  await router.load()

  const homeStore = createRouterStateSnapshotStore(cloneState(router.state))
  const homeActiveStore = new Store(false)

  await router.navigate({
    to: '/details',
    search: { source: 'push' },
  })
  const detailsStore = createRouterStateSnapshotStore(cloneState(router.state))
  const detailsActiveStore = new Store(false)
  const onRendered = vi.fn()
  const unsubscribe = router.subscribe('onRendered', onRendered)

  render(
    <RouterContextProvider router={router}>
      <RouterStateSnapshotProvider
        router={router}
        store={homeStore}
        activeStore={homeActiveStore}
      >
        <Matches includeTransitioner={false} />
      </RouterStateSnapshotProvider>
      <RouterStateSnapshotProvider
        router={router}
        store={detailsStore}
        activeStore={detailsActiveStore}
      >
        <Matches includeTransitioner={false} />
      </RouterStateSnapshotProvider>
    </RouterContextProvider>,
  )

  expect(onRendered).not.toHaveBeenCalled()

  act(() => homeActiveStore.setState(() => true))
  await waitFor(() => expect(onRendered).toHaveBeenCalledTimes(1))
  expect(onRendered.mock.calls[0]?.[0]).toMatchObject({
    fromLocation: { pathname: '/home' },
    toLocation: { pathname: '/home' },
  })

  act(() => {
    homeActiveStore.setState(() => false)
    detailsActiveStore.setState(() => true)
  })
  await waitFor(() => expect(onRendered).toHaveBeenCalledTimes(2))
  expect(onRendered.mock.calls[1]?.[0]).toMatchObject({
    fromLocation: { pathname: '/home' },
    toLocation: { pathname: '/details' },
  })

  act(() => {
    detailsActiveStore.setState(() => false)
    homeActiveStore.setState(() => true)
  })
  await waitFor(() => expect(onRendered).toHaveBeenCalledTimes(3))
  expect(onRendered.mock.calls[2]?.[0]).toMatchObject({
    fromLocation: { pathname: '/details' },
    toLocation: { pathname: '/home' },
  })

  unsubscribe()
})
