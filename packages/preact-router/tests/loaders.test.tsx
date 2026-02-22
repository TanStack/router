import { afterEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import { sleep } from './utils'

afterEach(() => {
  cleanup()
})

const WAIT_TIME = 100

describe('loaders are being called', () => {
  test('called on /', async () => {
    const indexLoaderMock = vi.fn()

    const rootRoute = createRootRoute({})
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: async () => {
        await sleep(WAIT_TIME)
        indexLoaderMock('foo')
      },
      component: () => <div>Index page</div>,
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(<RouterProvider router={router} />)

    const indexElement = await screen.findByText('Index page')
    expect(indexElement).toBeInTheDocument()

    expect(indexLoaderMock).toHaveBeenCalled()
  })

  test('both are called on /nested/foo', async () => {
    const nestedLoaderMock = vi.fn()
    const nestedFooLoaderMock = vi.fn()

    const rootRoute = createRootRoute({})
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <div>
          <h1>Index page</h1>
          <Link to="/nested/foo">link to foo</Link>
        </div>
      ),
    })
    const nestedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/nested',
      loader: async () => {
        await sleep(WAIT_TIME)
        nestedLoaderMock('nested')
      },
    })
    const fooRoute = createRoute({
      getParentRoute: () => nestedRoute,
      path: '/foo',
      loader: async () => {
        await sleep(WAIT_TIME)
        nestedFooLoaderMock('foo')
      },
      component: () => <div>Nested Foo page</div>,
    })
    const routeTree = rootRoute.addChildren([
      nestedRoute.addChildren([fooRoute]),
      indexRoute,
    ])
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(<RouterProvider router={router} />)

    const linkToFoo = await screen.findByText('link to foo')
    fireEvent.click(linkToFoo)

    const fooElement = await screen.findByText('Nested Foo page')
    expect(fooElement).toBeInTheDocument()

    expect(nestedLoaderMock).toHaveBeenCalled()
    expect(nestedFooLoaderMock).toHaveBeenCalled()
  })
})

describe('loaders parentMatchPromise', () => {
  test('parentMatchPromise is defined in a child route', async () => {
    const nestedLoaderMock = vi.fn()

    const rootRoute = createRootRoute({})
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <div>
          Index page
          <Link to="/nested/foo">link to foo</Link>
        </div>
      ),
    })
    const nestedRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/nested',
      loader: async () => {
        await sleep(WAIT_TIME)
        return 'nested'
      },
      component: () => <Outlet />,
    })
    const fooRoute = createRoute({
      getParentRoute: () => nestedRoute,
      path: '/foo',
      loader: async ({ parentMatchPromise }) => {
        nestedLoaderMock(parentMatchPromise)
        const parentMatch = await parentMatchPromise
        expect(parentMatch.loaderData).toBe('nested')
      },
      component: () => <div>Nested Foo page</div>,
    })
    const routeTree = rootRoute.addChildren([
      nestedRoute.addChildren([fooRoute]),
      indexRoute,
    ])
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(<RouterProvider router={router} />)

    const linkToFoo = await screen.findByRole('link', { name: 'link to foo' })
    expect(linkToFoo).toBeInTheDocument()

    fireEvent.click(linkToFoo)

    const fooElement = await screen.findByText('Nested Foo page')
    expect(fooElement).toBeInTheDocument()

    expect(nestedLoaderMock).toHaveBeenCalled()
    expect(nestedLoaderMock.mock.calls[0]?.[0]).toBeInstanceOf(Promise)
  })
})
