import React from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  retainSearchParams,
} from '../src'

describe('Link destination updates', () => {
  beforeEach(() => vi.stubEnv('NODE_ENV', 'production'))
  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
  })

  function setupFixedLink(
    params = { id: 'fixed' },
    stringify?: (params: Record<string, unknown>) => { id: string },
  ) {
    const rootRoute = createRootRoute({
      component: () => (
        <>
          <Link
            to="/target/$id"
            params={params}
            search={{}}
            hash="details"
            activeOptions={{ includeSearch: false }}
            data-testid="fixed-link"
          >
            Target
          </Link>
          <Outlet />
        </>
      ),
    })
    const itemsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/items/$source',
    })
    const targetRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/target/$id',
      params: { stringify },
    })
    const routeTree = rootRoute.addChildren([itemsRoute, targetRoute])
    const router = createRouter<typeof routeTree, 'always' | 'never'>({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/items/one'] }),
    })
    return { router, rootRoute }
  }

  test('preserves a fixed destination when unrelated location inputs change', async () => {
    const { router } = setupFixedLink()
    render(<RouterProvider router={router} />)

    const link = await screen.findByTestId('fixed-link')
    expect(link).toHaveAttribute('href', '/target/fixed#details')
    expect(link).not.toHaveAttribute('data-status')

    await act(() =>
      router.navigate({
        to: '/items/$source',
        params: { source: 'two' },
        search: { tab: 'other' },
        hash: 'other',
      }),
    )

    expect(link).toHaveAttribute('href', '/target/fixed#details')
    expect(link).not.toHaveAttribute('data-status')

    await act(() =>
      router.navigate({
        to: '/target/$id',
        params: { id: 'fixed' },
      }),
    )
    expect(link).toHaveAttribute('data-status', 'active')
    expect(link).toHaveAttribute('href', '/target/fixed#details')
  })

  test('updates the destination when router options change', async () => {
    const { router } = setupFixedLink()
    render(<RouterProvider router={router} />)

    const link = await screen.findByTestId('fixed-link')
    expect(link).toHaveAttribute('href', '/target/fixed#details')

    router.update({ trailingSlash: 'always' })
    await act(() =>
      router.navigate({ to: '/items/$source', params: { source: 'two' } }),
    )
    expect(link).toHaveAttribute('href', '/target/fixed/#details')

    router.update({ trailingSlash: 'never' })
    await act(() =>
      router.navigate({ to: '/items/$source', params: { source: 'three' } }),
    )
    expect(link).toHaveAttribute('href', '/target/fixed#details')
  })

  test('evaluates param stringifiers before reusing pathnames', async () => {
    const stringify = vi.fn((params: Record<string, unknown>) => ({
      id: `${params.source}-${params.id}`,
    }))
    const { router } = setupFixedLink({ id: 'fixed' }, stringify)
    render(<RouterProvider router={router} />)

    const link = await screen.findByTestId('fixed-link')
    expect(link).toHaveAttribute('href', '/target/one-fixed#details')

    await act(() =>
      router.navigate({ to: '/items/$source', params: { source: 'two' } }),
    )
    expect(link).toHaveAttribute('href', '/target/two-fixed#details')

    stringify.mockClear()
    await act(() =>
      router.navigate({ to: '/items/$source', params: { source: 'one' } }),
    )
    expect(link).toHaveAttribute('href', '/target/one-fixed#details')
    expect(stringify).toHaveBeenCalled()
  })

  test('updates when the route tree is rebuilt after route options change', async () => {
    const { router, rootRoute } = setupFixedLink()
    render(<RouterProvider router={router} />)

    const link = await screen.findByTestId('fixed-link')
    expect(link).toHaveAttribute('href', '/target/fixed#details')

    // HMR updates the live route in place, then rebuilds the route tree.
    rootRoute.update({
      search: { middlewares: [retainSearchParams(true)] },
    })
    router.setRoutes(router.buildRouteTree())
    await act(() =>
      router.navigate({
        to: '/items/$source',
        params: { source: 'two' },
        search: { retained: 'value' },
      }),
    )
    expect(link).toHaveAttribute('href', '/target/fixed?retained=value#details')

    rootRoute.update({ search: undefined })
    router.setRoutes(router.buildRouteTree())
    await act(() =>
      router.navigate({
        to: '/items/$source',
        params: { source: 'three' },
        search: { retained: 'value' },
      }),
    )
    expect(link).toHaveAttribute('href', '/target/fixed#details')
  })

  test('reuses the location for equal inline literals and rebuilds on nested changes', async () => {
    const rootRoute = createRootRoute({
      component: function Root() {
        const [page, setPage] = React.useState(1)
        const [, rerender] = React.useState(0)
        return (
          <>
            <button onClick={() => rerender((n) => n + 1)}>Rerender</button>
            <button onClick={() => setPage((n) => n + 1)}>Next page</button>
            <Link
              to="/items/$source"
              params={{ source: 'one' }}
              search={{ filters: { page }, tags: ['a'] }}
              data-testid="nested-link"
            >
              Items
            </Link>
            <Outlet />
          </>
        )
      },
    })
    const itemsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/items/$source',
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([itemsRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    const buildLocation = vi.spyOn(router, 'buildLocation')
    render(<RouterProvider router={router} />)

    const link = await screen.findByTestId('nested-link')
    expect(link).toHaveAttribute(
      'href',
      '/items/one?filters=%7B%22page%22%3A1%7D&tags=%5B%22a%22%5D',
    )

    // Fresh literals with equal contents must not produce a new options
    // object, otherwise the router could never reuse the built location.
    const builds = buildLocation.mock.calls.length
    expect(builds).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Rerender' }))
    fireEvent.click(screen.getByRole('button', { name: 'Rerender' }))
    expect(buildLocation).toHaveBeenCalledTimes(builds)
    expect(link).toHaveAttribute(
      'href',
      '/items/one?filters=%7B%22page%22%3A1%7D&tags=%5B%22a%22%5D',
    )

    // A nested value that changes through React state is a new object, so
    // the cached location for the previous contents must not be served.
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(link).toHaveAttribute(
      'href',
      '/items/one?filters=%7B%22page%22%3A2%7D&tags=%5B%22a%22%5D',
    )

    await act(() =>
      router.navigate({ to: '/items/$source', params: { source: 'two' } }),
    )
    expect(link).toHaveAttribute(
      'href',
      '/items/one?filters=%7B%22page%22%3A2%7D&tags=%5B%22a%22%5D',
    )
    buildLocation.mockRestore()
  })

  test('updates fixed params and hash when Link props change', async () => {
    const rootRoute = createRootRoute({
      component: function Root() {
        const [value, setValue] = React.useState('one')
        return (
          <>
            <button onClick={() => setValue('two')}>Change target</button>
            <Link
              to="/items/$id"
              params={{ id: value }}
              hash={value}
              data-testid="changing-link"
            >
              Item
            </Link>
            <Outlet />
          </>
        )
      },
    })
    const itemsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/items/$id',
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([itemsRoute]),
      history: createMemoryHistory({ initialEntries: ['/items/one'] }),
    })
    render(<RouterProvider router={router} />)

    const link = await screen.findByTestId('changing-link')
    expect(link).toHaveAttribute('href', '/items/one#one')
    expect(link).toHaveAttribute('data-status', 'active')

    fireEvent.click(screen.getByRole('button', { name: 'Change target' }))

    expect(link).toHaveAttribute('href', '/items/two#two')
    expect(link).not.toHaveAttribute('data-status')
  })

  test('updates inherited params and active state together', async () => {
    const rootRoute = createRootRoute({
      component: () => (
        <>
          <Link to="/items/$id" params={{}} data-testid="inherited-link">
            {({ isActive }) => (isActive ? 'Current item' : 'Another item')}
          </Link>
          <Outlet />
        </>
      ),
    })
    const itemsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/items/$id',
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([itemsRoute]),
      history: createMemoryHistory({ initialEntries: ['/items/one'] }),
    })
    render(<RouterProvider router={router} />)

    const link = await screen.findByTestId('inherited-link')
    expect(link).toHaveAttribute('href', '/items/one')
    expect(link).toHaveTextContent('Current item')

    await act(() =>
      router.navigate({ to: '/items/$id', params: { id: 'two' } }),
    )

    expect(link).toHaveAttribute('href', '/items/two')
    expect(link).toHaveAttribute('data-status', 'active')
    expect(link).toHaveTextContent('Current item')
  })
})
