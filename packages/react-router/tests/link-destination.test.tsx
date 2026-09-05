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
  defaultStringifySearch,
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

  test('updates when ancestor search middleware is added and removed', async () => {
    const { router, rootRoute } = setupFixedLink()
    render(<RouterProvider router={router} />)

    const link = await screen.findByTestId('fixed-link')
    expect(link).toHaveAttribute('href', '/target/fixed#details')

    rootRoute.update({
      search: { middlewares: [retainSearchParams(true)] },
    })
    await act(() =>
      router.navigate({
        to: '/items/$source',
        params: { source: 'two' },
        search: { retained: 'value' },
      }),
    )
    expect(link).toHaveAttribute('href', '/target/fixed?retained=value#details')

    rootRoute.update({ search: undefined })
    await act(() =>
      router.navigate({
        to: '/items/$source',
        params: { source: 'three' },
        search: { retained: 'value' },
      }),
    )
    expect(link).toHaveAttribute('href', '/target/fixed#details')
  })

  test('continues evaluating a custom search serializer', async () => {
    const { router } = setupFixedLink()
    let language = 'en'
    router.update({
      stringifySearch: (search) =>
        defaultStringifySearch({ ...search, language }),
    })
    render(<RouterProvider router={router} />)

    const link = await screen.findByTestId('fixed-link')
    expect(link).toHaveAttribute('href', '/target/fixed?language=en#details')

    language = 'fr'
    await act(() =>
      router.navigate({ to: '/items/$source', params: { source: 'two' } }),
    )
    expect(link).toHaveAttribute('href', '/target/fixed?language=fr#details')
  })

  test('reads accessor-backed params after navigation', async () => {
    let id = 'one'
    const { router } = setupFixedLink({
      get id() {
        return id
      },
    })
    render(<RouterProvider router={router} />)

    const link = await screen.findByTestId('fixed-link')
    expect(link).toHaveAttribute('href', '/target/one#details')

    id = 'two'
    await act(() =>
      router.navigate({ to: '/items/$source', params: { source: 'two' } }),
    )
    expect(link).toHaveAttribute('href', '/target/two#details')
  })

  test('updates when an existing params object changes', async () => {
    const params = { id: 'one' }
    const { router } = setupFixedLink(params)
    render(<RouterProvider router={router} />)

    const link = await screen.findByTestId('fixed-link')
    expect(link).toHaveAttribute('href', '/target/one#details')

    params.id = 'two'
    await act(() =>
      router.navigate({ to: '/items/$source', params: { source: 'two' } }),
    )
    expect(link).toHaveAttribute('href', '/target/two#details')
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
