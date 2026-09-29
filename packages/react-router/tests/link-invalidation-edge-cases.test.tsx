import React from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterContextProvider,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(cleanup)

test('a navigation inside a search updater cannot strand another active link', async () => {
  let redirectFromUpdater = false
  let nestedNavigation: Promise<void> | undefined
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Link
          to="/a"
          search={() => {
            if (
              redirectFromUpdater &&
              router.state.location.pathname === '/b'
            ) {
              redirectFromUpdater = false
              nestedNavigation = router.navigate({ to: '/c' })
            }
            return {}
          }}
        >
          Updating A
        </Link>
        <Link to="/a">Static A</Link>
        <Outlet />
      </>
    ),
  })
  const routeTree = rootRoute.addChildren(
    (['/a', '/b', '/c'] as const).map((path) =>
      createRoute({
        getParentRoute: () => rootRoute,
        path,
        component: () => <p>{path}</p>,
      }),
    ),
  )
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/a'] }),
  })
  render(<RouterProvider router={router} />)
  const updating = await screen.findByRole('link', { name: 'Updating A' })
  const fixed = screen.getByRole('link', { name: 'Static A' })
  await waitFor(() => expect(router.state.status).toBe('idle'))
  expect(updating).toHaveAttribute('aria-current', 'page')
  expect(fixed).toHaveAttribute('aria-current', 'page')
  redirectFromUpdater = true

  await act(async () => {
    await router.navigate({ to: '/b' })
    await nestedNavigation
  })

  expect(nestedNavigation).toBeDefined()
  expect(router.state.location.pathname).toBe('/c')
  expect(screen.getByText('/c')).toBeInTheDocument()
  expect(updating).not.toHaveAttribute('aria-current')
  expect(fixed).not.toHaveAttribute('aria-current')
})

test('source route validation changes inherited search even when raw search is unchanged', async () => {
  const rootRoute = createRootRoute()
  const firstRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/first',
    validateSearch: () => ({ source: 'first' }),
  })
  const secondRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/second',
    validateSearch: () => ({ source: 'second' }),
  })
  const targetRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([firstRoute, secondRoute, targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/first'] }),
  })
  await router.load()
  render(
    <RouterContextProvider router={router}>
      <Link to="/target" search={(search: { source?: string }) => search}>
        Inherited search
      </Link>
    </RouterContextProvider>,
  )
  const link = await screen.findByRole('link', { name: 'Inherited search' })
  await waitFor(() => expect(router.state.status).toBe('idle'))
  expect(link).toHaveAttribute('href', '/target?source=first')

  expect(router.state.location.searchStr).toBe('')
  await act(async () => {
    router.history.push('/second')
    await router.load()
  })

  expect(router.state.location.searchStr).toBe('')
  expect(link).toHaveAttribute('href', '/target?source=second')
})

test('a changing masked destination does not rerender unchanged link content', async () => {
  const renderContent = vi.fn(() => 'Masked target')
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Link
          to="/targets/$id"
          params={(params: { id?: string }) => ({ id: params.id })}
          mask={{ to: '/public' }}
        >
          {renderContent}
        </Link>
        <Outlet />
      </>
    ),
  })
  const sourceRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/sources/$id',
  })
  const targetRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/targets/$id',
  })
  const publicRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/public',
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([sourceRoute, targetRoute, publicRoute]),
    history: createMemoryHistory({ initialEntries: ['/sources/1'] }),
  })
  render(<RouterProvider router={router} />)
  const link = await screen.findByRole('link', { name: 'Masked target' })
  await waitFor(() => expect(router.state.status).toBe('idle'))
  expect(link).toHaveAttribute('href', '/public')
  expect(renderContent).toHaveBeenCalled()
  renderContent.mockClear()

  await act(() => router.navigate({ to: '/sources/$id', params: { id: '2' } }))

  expect(link).toHaveAttribute('href', '/public')
  expect(link).not.toHaveAttribute('aria-current')
  expect(renderContent).not.toHaveBeenCalled()
})

test('a static destination follows independent source changes in its relative mask', async () => {
  const observeLoader = vi.fn()
  const rootRoute = createRootRoute({
    validateSearch: (search) => ({
      page: search.page === undefined ? undefined : Number(search.page),
    }),
    component: () => (
      <>
        <Link
          to="/target"
          mask={{ to: './public', search: true, hash: true }}
          activeOptions={{ exact: true }}
          preload="intent"
          preloadDelay={0}
        >
          Relative masked target
        </Link>
        <Outlet />
      </>
    ),
  })
  const firstRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/first',
    component: () => <p>First page</p>,
  })
  const secondRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/second',
    component: () => <p>Second page</p>,
  })
  const targetRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    loader: ({ preload, location }) => {
      observeLoader({ preload, pathname: location.pathname })
      return 'loaded'
    },
    component: () => <p>Target page</p>,
  })
  const firstPublicRoute = createRoute({
    getParentRoute: () => firstRoute,
    path: 'public',
  })
  const secondPublicRoute = createRoute({
    getParentRoute: () => secondRoute,
    path: 'public',
  })
  const targetPublicRoute = createRoute({
    getParentRoute: () => targetRoute,
    path: 'public',
  })
  const history = createMemoryHistory({
    initialEntries: ['/first?page=1#one'],
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      firstRoute.addChildren([firstPublicRoute]),
      secondRoute.addChildren([secondPublicRoute]),
      targetRoute.addChildren([targetPublicRoute]),
    ]),
    history,
  })
  render(<RouterProvider router={router} />)
  const link = await screen.findByRole('link', {
    name: 'Relative masked target',
  })
  await waitFor(() => expect(router.state.status).toBe('idle'))
  expect(link).toHaveAttribute('href', '/first/public?page=1#one')
  expect(link).not.toHaveAttribute('aria-current')

  await act(() =>
    router.navigate({ to: '/first', search: { page: 2 }, hash: true }),
  )
  expect(link).toHaveAttribute('href', '/first/public?page=2#one')

  await act(() => router.navigate({ to: '/first', search: true, hash: 'two' }))
  expect(link).toHaveAttribute('href', '/first/public?page=2#two')

  await act(() => router.navigate({ to: '/second', search: true, hash: true }))
  expect(link).toHaveAttribute('href', '/second/public?page=2#two')
  expect(link).not.toHaveAttribute('aria-current')
  expect(observeLoader).not.toHaveBeenCalled()

  fireEvent.mouseOver(link)
  await waitFor(() =>
    expect(observeLoader).toHaveBeenCalledWith({
      preload: true,
      pathname: '/target',
    }),
  )
  expect(router.state.location.pathname).toBe('/second')

  fireEvent.click(link)
  await screen.findByText('Target page')
  await waitFor(() => expect(router.state.status).toBe('idle'))
  expect(router.state.location.pathname).toBe('/target')
  expect(history.location.href).toBe('/second/public?page=2#two')
  expect(link).toHaveAttribute('href', '/target/public')
  expect(link).toHaveAttribute('aria-current', 'page')
})
