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
  RouterProvider,
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  defaultStringifySearch,
  redirect,
} from '../src'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('persistent static links change activity without rebuilding their destinations', async () => {
  const stringifySearch = vi.fn(defaultStringifySearch)
  const rootRoute = createRootRoute({
    component: () => (
      <>
        {Array.from({ length: 64 }, (_, id) => (
          <Link
            key={id}
            to="/items/$id"
            params={{ id: String(id) }}
            hash="static-menu"
            search={{ menu: true }}
            activeOptions={{ includeSearch: false }}
          >
            Item {id}
          </Link>
        ))}
        <Outlet />
      </>
    ),
  })
  const itemRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/items/$id',
    component: () => <p>Item page</p>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([itemRoute]),
    history: createMemoryHistory({ initialEntries: ['/items/0'] }),
    stringifySearch,
  })
  render(<RouterProvider router={router} />)
  const first = await screen.findByRole('link', { name: 'Item 0' })
  const second = screen.getByRole('link', { name: 'Item 1' })
  await waitFor(() => expect(router.state.status).toBe('idle'))
  expect(first).toHaveAttribute('aria-current', 'page')
  expect(
    stringifySearch.mock.calls.filter(([search]) => search.menu === true)
      .length,
  ).toBeGreaterThanOrEqual(64)
  stringifySearch.mockClear()

  const buildLocation = vi.spyOn(router, 'buildLocation')
  await act(() => router.navigate({ to: '/items/$id', params: { id: '1' } }))

  expect(first).not.toHaveAttribute('aria-current')
  expect(second).toHaveAttribute('aria-current', 'page')
  expect(first).toHaveAttribute('href', '/items/0?menu=true#static-menu')
  // This also sees real builder work if Link stops calling the public wrapper.
  expect(
    stringifySearch.mock.calls.filter(([search]) => search.menu === true),
  ).toHaveLength(0)
  // The public hash option distinguishes the mounted links from the navigation.
  expect(
    buildLocation.mock.calls.filter(
      ([options]) => options.hash === 'static-menu',
    ),
  ).toHaveLength(0)
})

test('a hash-only navigation does not rerun a persistent link search updater', async () => {
  const updateSearch = vi.fn((search: { page?: number }) => ({
    page: search.page,
  }))
  const rootRoute = createRootRoute({
    validateSearch: (search) => ({ page: Number(search.page || 1) }),
    component: () => (
      <>
        <Link to="/items" search={updateSearch} hash="fixed">
          Items
        </Link>
        <Outlet />
      </>
    ),
  })
  const itemRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/items',
    component: () => <p>Item page</p>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([itemRoute]),
    history: createMemoryHistory({ initialEntries: ['/items?page=1#first'] }),
  })
  render(<RouterProvider router={router} />)
  const link = await screen.findByRole('link', { name: 'Items' })
  await waitFor(() => expect(router.state.status).toBe('idle'))
  expect(link).toHaveAttribute('href', '/items?page=1#fixed')
  updateSearch.mockClear()

  await act(() =>
    router.navigate({ to: '/items', search: { page: 1 }, hash: 'second' }),
  )

  expect(link).toHaveAttribute('href', '/items?page=1#fixed')
  expect(link).toHaveAttribute('aria-current', 'page')
  expect(updateSearch).not.toHaveBeenCalled()
})

test('links in a departing match skip location work while persistent links update immediately', async () => {
  const gate = createControlledPromise<void>()
  const updateSearch = vi.fn((search: { marker?: string }) => ({
    marker: search.marker,
  }))
  const rootRoute = createRootRoute({
    validateSearch: (search) => ({ marker: String(search.marker || '') }),
    component: () => (
      <>
        <Link to="/away" activeOptions={{ includeSearch: false }}>
          Persistent away link
        </Link>
        <Outlet />
      </>
    ),
  })
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/home',
    component: () => (
      <Link to="/item" search={updateSearch}>
        Departing item link
      </Link>
    ),
  })
  const awayRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/away',
    loader: () => gate,
    component: () => <p>Away page</p>,
  })
  const itemRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/item',
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, awayRoute, itemRoute]),
    history: createMemoryHistory({ initialEntries: ['/home?marker=before'] }),
    defaultPendingMs: 60_000,
  })
  render(<RouterProvider router={router} />)
  const departing = await screen.findByRole('link', {
    name: 'Departing item link',
  })
  await waitFor(() => expect(router.state.status).toBe('idle'))
  updateSearch.mockClear()

  let navigation!: Promise<void>
  try {
    await act(async () => {
      navigation = router.navigate({
        to: '/away',
        search: { marker: 'after' },
      })
      await Promise.resolve()
    })
    await waitFor(() => expect(router.state.location.pathname).toBe('/away'))
    expect(departing).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Persistent away link' }),
    ).toHaveAttribute('aria-current', 'page')
    expect(updateSearch).not.toHaveBeenCalled()
  } finally {
    await act(async () => {
      gate.resolve()
      await navigation
    })
  }
  expect(screen.queryByText('Departing item link')).not.toBeInTheDocument()
  expect(screen.getByText('Away page')).toBeInTheDocument()
  expect(updateSearch).not.toHaveBeenCalled()
})

test.each(['redirect', 'superseding navigation'] as const)(
  'a retained owner becomes consistent after %s returns to it',
  async (returnKind) => {
    const gate = createControlledPromise<void>()
    const rootRoute = createRootRoute({
      validateSearch: (search) => ({ marker: String(search.marker || '') }),
      component: Outlet,
    })
    const homeRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/home',
      component: () => (
        <Link
          to="/item"
          search={(search: { marker?: string }) => ({ marker: search.marker })}
        >
          Retained item link
        </Link>
      ),
    })
    const awayRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/away',
      loader: async () => {
        await gate
        if (returnKind === 'redirect') {
          throw redirect({ to: '/home', search: { marker: 'returned' } })
        }
      },
      component: () => <p>Away page</p>,
    })
    const itemRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/item',
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([homeRoute, awayRoute, itemRoute]),
      history: createMemoryHistory({ initialEntries: ['/home?marker=before'] }),
      defaultPendingMs: 60_000,
    })
    render(<RouterProvider router={router} />)
    const retained = await screen.findByRole('link', {
      name: 'Retained item link',
    })
    await waitFor(() => expect(router.state.status).toBe('idle'))
    expect(retained).toHaveAttribute('href', '/item?marker=before')

    let navigation!: Promise<void>
    try {
      await act(async () => {
        navigation = router.navigate({
          to: '/away',
          search: { marker: 'leaving' },
        })
        await Promise.resolve()
      })
      await waitFor(() => expect(router.state.location.pathname).toBe('/away'))
      expect(retained).toBeInTheDocument()

      if (returnKind === 'superseding navigation') {
        await act(() =>
          router.navigate({ to: '/home', search: { marker: 'returned' } }),
        )
      }
    } finally {
      await act(async () => {
        gate.resolve()
        await navigation
      })
    }

    await waitFor(() => {
      expect(retained).toHaveAttribute('href', '/item?marker=returned')
      expect(router.state.status).toBe('idle')
    })
    expect(screen.getByRole('link', { name: 'Retained item link' })).toBe(
      retained,
    )
    expect(screen.queryByText('Away page')).not.toBeInTheDocument()
  },
)

test('changed link props take effect while its owner is waiting to depart', async () => {
  const gate = createControlledPromise<void>()
  const rootRoute = createRootRoute({
    validateSearch: (search) => ({ marker: String(search.marker || '') }),
    component: Outlet,
  })
  function Home() {
    const [id, setId] = React.useState('first')
    return (
      <>
        <button onClick={() => setId('second')}>Change destination</button>
        <Link
          to="/items/$id"
          params={{ id }}
          search={(search: { marker?: string }) => ({ marker: search.marker })}
        >
          Changing item link
        </Link>
      </>
    )
  }
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/home',
    component: Home,
  })
  const awayRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/away',
    loader: () => gate,
    component: () => <p>Away page</p>,
  })
  const itemRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/items/$id',
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, awayRoute, itemRoute]),
    history: createMemoryHistory({ initialEntries: ['/home?marker=before'] }),
    defaultPendingMs: 60_000,
  })
  render(<RouterProvider router={router} />)
  const link = await screen.findByRole('link', { name: 'Changing item link' })
  await waitFor(() => expect(router.state.status).toBe('idle'))
  expect(link).toHaveAttribute('href', '/items/first?marker=before')

  let navigation!: Promise<void>
  try {
    await act(async () => {
      navigation = router.navigate({ to: '/away', search: { marker: 'after' } })
      await Promise.resolve()
    })
    await waitFor(() => expect(router.state.location.pathname).toBe('/away'))
    fireEvent.click(screen.getByRole('button', { name: 'Change destination' }))
    expect(link).toHaveAttribute('href', '/items/second?marker=after')
  } finally {
    await act(async () => {
      gate.resolve()
      await navigation
    })
  }
})

test('persistent links follow inherited params, search and hash independently', async () => {
  const rootRoute = createRootRoute({
    validateSearch: (search) => ({ page: Number(search.page || 1) }),
    component: () => (
      <>
        <Link
          to="/items/$id"
          params={true}
          search={true}
          hash={true}
          activeOptions={{ exact: true, includeHash: true }}
        >
          Current item
        </Link>
        <Link
          to="/items/$id"
          params={{ id: '1' }}
          search={{ page: 1 }}
          hash="first"
          activeOptions={{ exact: true, includeHash: true }}
        >
          Original item
        </Link>
        <Outlet />
      </>
    ),
  })
  const itemRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/items/$id',
    component: () => <p>Item page</p>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([itemRoute]),
    history: createMemoryHistory({ initialEntries: ['/items/1?page=1#first'] }),
  })
  render(<RouterProvider router={router} />)
  const inherited = await screen.findByRole('link', { name: 'Current item' })
  const fixed = screen.getByRole('link', { name: 'Original item' })
  await waitFor(() => expect(router.state.status).toBe('idle'))
  await waitFor(() => expect(fixed).toHaveAttribute('aria-current', 'page'))

  for (const [id, page, hash, originalActive] of [
    ['2', 1, 'first', false],
    ['1', 2, 'first', false],
    ['1', 1, 'second', false],
    ['1', 1, 'first', true],
  ] as const) {
    await act(() =>
      router.navigate({
        to: '/items/$id',
        params: { id },
        search: { page },
        hash,
      }),
    )
    expect(inherited).toHaveAttribute(
      'href',
      `/items/${id}?page=${page}#${hash}`,
    )
    expect(inherited).toHaveAttribute('aria-current', 'page')
    expect(fixed).toHaveAttribute('href', '/items/1?page=1#first')
    expect(fixed.getAttribute('aria-current')).toBe(
      originalActive ? 'page' : null,
    )
  }
})

test('removed links stop evaluating while their router continues navigating', async () => {
  const updateSearch = vi.fn((search: { page?: number }) => ({
    page: search.page,
  }))
  function Layout() {
    const [visible, setVisible] = React.useState(true)
    return (
      <>
        <button onClick={() => setVisible(false)}>Remove links</button>
        {visible
          ? Array.from({ length: 32 }, (_, id) => (
              <Link
                key={id}
                to="/items/$id"
                params={{ id: String(id) }}
                search={updateSearch}
              >
                Removable item {id}
              </Link>
            ))
          : null}
        <Outlet />
      </>
    )
  }
  const rootRoute = createRootRoute({
    validateSearch: (search) => ({ page: Number(search.page || 1) }),
    component: Layout,
  })
  const itemRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/items/$id',
    component: () => <p>Item page</p>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([itemRoute]),
    history: createMemoryHistory({ initialEntries: ['/items/0?page=1'] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('link', { name: 'Removable item 0' })
  await waitFor(() => expect(router.state.status).toBe('idle'))
  fireEvent.click(screen.getByRole('button', { name: 'Remove links' }))
  expect(screen.queryAllByRole('link')).toHaveLength(0)
  updateSearch.mockClear()

  for (const page of [2, 3, 4]) {
    await act(() =>
      router.navigate({
        to: '/items/$id',
        params: { id: String(page) },
        search: { page },
      }),
    )
  }

  expect(screen.getByText('Item page')).toBeInTheDocument()
  expect(updateSearch).not.toHaveBeenCalled()
})
